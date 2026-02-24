import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { sources = ['nppes'], provider_ids = [], job_type = 'manual' } = await req.json();

    // Create job record
    const job = await base44.entities.ReconciliationJob.create({
      job_type,
      sources,
      status: 'running',
      started_at: new Date().toISOString(),
    });

    let providers;
    if (provider_ids.length > 0) {
      // Specific providers
      providers = [];
      for (const id of provider_ids) {
        const p = await base44.entities.Provider.get(id);
        if (p) providers.push(p);
      }
    } else {
      // All providers - for scheduled runs, limit batch size to prevent timeouts with AI
      const allProviders = await base44.entities.Provider.list();
      providers = job_type === 'scheduled' ? allProviders.slice(0, 5) : allProviders.slice(0, 10);
    }

    let matched = 0;
    let discrepancies = 0;
    let missingExternal = 0;
    const jobReconciliations = [];

    // Reconcile each provider
    for (const provider of providers) {
      if (!provider.npi) continue;

      const reconciliations = await Promise.all(
        sources.map(source => reconcileProvider(provider, source, base44))
      );

      for (const recon of reconciliations) {
        jobReconciliations.push(recon);

        if (recon.status === 'match') {
          matched++;
        } else if (recon.status === 'discrepancy') {
          discrepancies++;
        } else if (recon.status === 'missing_external') {
          missingExternal++;
        }
      }
    }

    // Save reconciliation records
    if (jobReconciliations.length > 0) {
      try {
        await base44.entities.ProviderReconciliation.bulkCreate(jobReconciliations);
      } catch (e) {
        for (const recon of jobReconciliations) {
          try {
            await base44.entities.ProviderReconciliation.create(recon);
          } catch (err) {
            console.error('Failed to save reconciliation:', err);
          }
        }
      }
    }

    // Update job
    const completedJob = await base44.entities.ReconciliationJob.update(job.id, {
      status: 'completed',
      completed_at: new Date().toISOString(),
      total_providers: providers.length,
      matched,
      discrepancies_found: discrepancies,
      missing_external: missingExternal,
      ai_suggestions_generated: jobReconciliations.filter(r => r.ai_suggestions?.length > 0).length,
    });

    return Response.json({
      success: true,
      job_id: job.id,
      total_providers: providers.length,
      matched,
      discrepancies_found: discrepancies,
      missing_external: missingExternal,
      message: `Reconciliation complete: ${matched} matched, ${discrepancies} discrepancies found`
    });

  } catch (error) {
    console.error('Reconciliation error:', error);
    return Response.json(
      { error: error.message || 'Reconciliation failed' },
      { status: 500 }
    );
  }
});

async function reconcileProvider(provider, source, base44) {
  const reconciliation = {
    npi: provider.npi,
    reconciliation_date: new Date().toISOString(),
    source,
    discrepancies: [],
    status: 'match',
  };

  try {
    // Fetch external data using AI as a dynamic external API
    const externalData = await fetchExternalProviderData(provider.npi, source, base44);

    if (!externalData) {
      reconciliation.status = 'missing_external';
      return reconciliation;
    }

    // Fetch internal taxonomy for comparison
    const taxonomies = await base44.entities.ProviderTaxonomy.filter({ npi: provider.npi });
    const primaryTaxonomy = taxonomies.find(t => t.primary_flag) || taxonomies[0];
    const internalSpecialty = primaryTaxonomy ? primaryTaxonomy.taxonomy_description : '';

    // Compare key fields
    const fieldsToCheck = [
      { internal: 'first_name', external: 'firstName', type: 'string', internalVal: provider.first_name },
      { internal: 'last_name', external: 'lastName', type: 'string', internalVal: provider.last_name },
      { internal: 'organization_name', external: 'organizationName', type: 'string', internalVal: provider.organization_name },
      { internal: 'status', external: 'status', type: 'string', internalVal: provider.status },
      { internal: 'specialty', external: 'specialty', type: 'string', internalVal: internalSpecialty },
    ];

    for (const field of fieldsToCheck) {
      const internalVal = String(field.internalVal || '').toLowerCase().trim();
      const externalVal = String(externalData[field.external] || '').toLowerCase().trim();

      if (externalVal && externalVal !== 'null' && externalVal !== 'undefined') {
        if (!internalVal || internalVal === 'null' || internalVal === 'undefined') {
          reconciliation.discrepancies.push({
            field: field.internal,
            internal_value: 'Missing',
            external_value: externalData[field.external],
            confidence: 0,
            severity: 'high'
          });
          reconciliation.status = 'discrepancy';
        } else {
          const similarity = calculateSimilarity(internalVal, externalVal);
          const threshold = field.internal === 'specialty' ? 0.6 : 0.8;
          
          if (similarity < threshold) {
            reconciliation.discrepancies.push({
              field: field.internal,
              internal_value: field.internalVal,
              external_value: externalData[field.external],
              confidence: similarity,
              severity: similarity < 0.5 ? 'high' : 'medium'
            });
            reconciliation.status = 'discrepancy';
          }
        }
      }
    }

    // Generate AI suggestions if discrepancies found
    if (reconciliation.discrepancies.length > 0) {
      reconciliation.ai_suggestions = await generateAISuggestions(provider, reconciliation.discrepancies, base44);
    }

  } catch (err) {
    console.error(`Error reconciling ${provider.npi}:`, err);
    reconciliation.status = 'discrepancy';
    reconciliation.discrepancies.push({
      field: 'reconciliation',
      internal_value: 'N/A',
      external_value: 'Error fetching',
      severity: 'medium'
    });
  }

  return reconciliation;
}

async function fetchExternalProviderData(npi, source, base44) {
  try {
    // In production this would call PECOS, State APIs, or NPPES.
    // For this automated setup, we use AI with web context to query external sources dynamically.
    const prompt = `Look up the medical provider with NPI ${npi} on the internet. Return a JSON object with their firstName, lastName, organizationName, status (Active/Inactive), and their primary specialty or taxonomy. Only output valid JSON matching this schema: {"firstName": "string", "lastName": "string", "organizationName": "string", "status": "string", "specialty": "string"}`;
    
    const res = await base44.integrations.Core.InvokeLLM({
      prompt,
      add_context_from_internet: true,
      response_json_schema: {
        type: "object",
        properties: {
          firstName: {type: "string"},
          lastName: {type: "string"},
          organizationName: {type: "string"},
          status: {type: "string"},
          specialty: {type: "string"}
        }
      }
    });

    return res;
  } catch (err) {
    console.error(`Failed to fetch ${source} data for NPI ${npi}:`, err);
    return null;
  }
}

function calculateSimilarity(str1, str2) {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) return 1.0;

  const editDistance = getEditDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

function getEditDistance(s1, s2) {
  const costs = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  return costs[s2.length];
}

async function generateAISuggestions(provider, discrepancies, base44) {
  const suggestions = [];

  for (const disc of discrepancies) {
    try {
      const prompt = `Provider ${provider.npi} has a discrepancy in field "${disc.field}":
      - Our record: "${disc.internal_value}"
      - External source: "${disc.external_value}"
      - Similarity: ${(disc.confidence * 100).toFixed(0)}%
      
      This is for a ${provider.entity_type} provider. 
      Should we update our record to match the external source? 
      Provide a brief suggestion (1-2 sentences) with reasoning.`;

      const response = await base44.integrations.Core.InvokeLLM({
        prompt,
        add_context_from_internet: false,
      });

      suggestions.push({
        field: disc.field,
        suggestion: response || 'Manual review recommended',
        reasoning: `Based on ${(disc.confidence * 100).toFixed(0)}% match similarity`,
        confidence: disc.confidence
      });
    } catch (err) {
      console.error('AI suggestion failed:', err);
      suggestions.push({
        field: disc.field,
        suggestion: 'Manual review recommended',
        reasoning: 'Could not generate AI suggestion',
        confidence: 0
      });
    }
  }

  return suggestions;
}