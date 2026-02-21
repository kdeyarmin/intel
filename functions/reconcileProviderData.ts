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
      // All providers
      providers = await base44.entities.Provider.list();
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
    // Fetch external data (simulated - in production, call actual APIs)
    const externalData = await fetchExternalProviderData(provider.npi, source);

    if (!externalData) {
      reconciliation.status = 'missing_external';
      return reconciliation;
    }

    // Compare key fields
    const fieldsToCheck = [
      { internal: 'first_name', external: 'firstName', type: 'string' },
      { internal: 'last_name', external: 'lastName', type: 'string' },
      { internal: 'organization_name', external: 'organizationName', type: 'string' },
      { internal: 'status', external: 'status', type: 'string' },
    ];

    for (const field of fieldsToCheck) {
      const internalVal = String(provider[field.internal] || '').toLowerCase().trim();
      const externalVal = String(externalData[field.external] || '').toLowerCase().trim();

      if (internalVal && externalVal && internalVal !== externalVal) {
        const similarity = calculateSimilarity(internalVal, externalVal);
        if (similarity < 0.8) {
          reconciliation.discrepancies.push({
            field: field.internal,
            internal_value: provider[field.internal],
            external_value: externalData[field.external],
            confidence: similarity,
            severity: similarity < 0.5 ? 'high' : 'medium'
          });
          reconciliation.status = 'discrepancy';
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

async function fetchExternalProviderData(npi, source) {
  // Placeholder for actual API calls to NPPES, PECOS, etc.
  // In production, you'd call real APIs or use cached data
  try {
    if (source === 'nppes') {
      // Simulate NPPES lookup
      return {
        firstName: 'John',
        lastName: 'Doe',
        organizationName: null,
        status: 'Active'
      };
    }
  } catch (err) {
    console.error(`Failed to fetch ${source} data:`, err);
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