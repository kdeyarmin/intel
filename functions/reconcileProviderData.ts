import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { action, reconciliation_id, resolution, sources = ['nppes'], provider_ids = [], job_type = 'manual' } = await req.json();

    if (action === 'resolve') {
      const recon = await base44.asServiceRole.entities.ProviderReconciliation.get(reconciliation_id);
      if (!recon) return Response.json({ error: 'Not found' }, { status: 404 });
      
      if (resolution === 'accept' && recon.discrepancies?.length > 0) {
        // Find provider by NPI
        const providers = await base44.asServiceRole.entities.Provider.filter({ npi: recon.npi });
        if (providers.length > 0) {
          const provider = providers[0];
          const updates = {};
          for (const disc of recon.discrepancies) {
            updates[disc.field] = disc.external_value;
          }
          await base44.asServiceRole.entities.Provider.update(provider.id, updates);
        }
      }

      const updated = await base44.asServiceRole.entities.ProviderReconciliation.update(reconciliation_id, {
        resolution_status: resolution === 'accept' ? 'accepted' : 'rejected',
        resolved_at: new Date().toISOString(),
        resolved_by: user.email,
      });

      return Response.json({ success: true, reconciliation: updated });
    }

    let config = null;
    try {
      const configs = await base44.entities.ReconciliationSettings.filter({ config_key: 'default' });
      if (configs.length > 0) config = configs[0];
    } catch (e) {
      console.warn("Failed to fetch ReconciliationSettings", e);
    }

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
        sources.map(source => reconcileProvider(provider, source, base44, config))
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

async function reconcileProvider(provider, source, base44, config) {
  const reconciliation = {
    npi: provider.npi,
    reconciliation_date: new Date().toISOString(),
    source,
    discrepancies: [],
    status: 'match',
  };

  try {
    // Fetch external data using API or AI
    const externalData = await fetchExternalProviderData(provider.npi, source, base44, config);

    if (!externalData) {
      reconciliation.status = 'missing_external';
      return reconciliation;
    }

    // Fetch internal taxonomy for comparison
    const taxonomies = await base44.entities.ProviderTaxonomy.filter({ npi: provider.npi });
    const primaryTaxonomy = taxonomies.find(t => t.primary_flag) || taxonomies[0];
    const internalSpecialty = primaryTaxonomy ? primaryTaxonomy.taxonomy_description : '';

    // Prepare internal data for AI
    const internalData = {
      first_name: provider.first_name,
      last_name: provider.last_name,
      organization_name: provider.organization_name,
      status: provider.status,
      specialty: internalSpecialty
    };

    // Use AI to compare and find discrepancies
    const prompt = `You are an AI Data Reconciliation Assistant for healthcare providers.
    Compare the following two provider records:
    
    Internal Record:
    ${JSON.stringify(internalData, null, 2)}
    
    External Record from ${source}:
    ${JSON.stringify(externalData, null, 2)}
    
    Tasks:
    1. Identify any discrepancies between the two records. Map external fields (firstName, lastName, organizationName, etc.) to internal fields (first_name, last_name, organization_name, status, specialty).
    2. Determine if these records likely represent the same provider (suggesting potential matches).
    3. Flag if this is a complex case that requires manual review (e.g. conflicting names but same NPI, major specialty differences).
    
    Return a JSON object with:
    - discrepancies: array of objects with "field" (internal field name), "internal_value", "external_value", "severity" (low, medium, high), and "suggestion" (what action to take)
    - is_match: boolean
    - requires_manual_review: boolean
    - reasoning: string explanation
    `;

    const aiAnalysisRes = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: {
            type: "object",
            properties: {
                discrepancies: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            field: {type: "string"},
                            internal_value: {type: "string"},
                            external_value: {type: "string"},
                            severity: {type: "string"},
                            suggestion: {type: "string"}
                        }
                    }
                },
                is_match: {type: "boolean"},
                requires_manual_review: {type: "boolean"},
                reasoning: {type: "string"}
            }
        }
    });

    let aiAnalysis = aiAnalysisRes;
    if (typeof aiAnalysis === 'string') {
        try { aiAnalysis = JSON.parse(aiAnalysis); } catch(e) { aiAnalysis = null; }
    }

    if (aiAnalysis && aiAnalysis.discrepancies) {
        reconciliation.discrepancies = aiAnalysis.discrepancies.map(d => ({
            field: d.field,
            internal_value: d.internal_value || '',
            external_value: d.external_value || '',
            severity: d.severity || 'medium',
            confidence: aiAnalysis.is_match ? 0.9 : 0.4
        }));

        if (!aiAnalysis.is_match || reconciliation.discrepancies.length > 0) {
            reconciliation.status = 'discrepancy';
        }

        if (reconciliation.discrepancies.length > 0) {
            if (aiAnalysis.requires_manual_review) {
                reconciliation.resolution_status = 'pending';
                reconciliation.notes = `AI Flagged for Manual Review: ${aiAnalysis.reasoning}`;
                reconciliation.ai_suggestions = aiAnalysis.discrepancies.map(d => ({
                    field: d.field,
                    suggestion: d.suggestion || 'Review manually',
                    reasoning: aiAnalysis.reasoning,
                    confidence: aiAnalysis.is_match ? 0.8 : 0.3
                }));
            } else {
                const autoAcceptThreshold = (config?.auto_accept_threshold || 90) / 100;
                if (aiAnalysis.is_match && autoAcceptThreshold <= 0.9) {
                    reconciliation.resolution_status = 'accepted';
                    reconciliation.resolved_at = new Date().toISOString();
                    reconciliation.resolved_by = 'system_ai_auto_accept';
                    reconciliation.notes = `AI Auto-accepted: ${aiAnalysis.reasoning}`;
                    
                    const updates = {};
                    for (const disc of reconciliation.discrepancies) {
                        if (disc.field !== 'specialty') {
                            updates[disc.field] = disc.external_value;
                        }
                    }
                    if (Object.keys(updates).length > 0) {
                        await base44.asServiceRole.entities.Provider.update(provider.id, updates).catch(e => console.error("Auto-update failed", e));
                    }
                } else {
                    reconciliation.ai_suggestions = aiAnalysis.discrepancies.map(d => ({
                        field: d.field,
                        suggestion: d.suggestion || 'Review manually',
                        reasoning: aiAnalysis.reasoning,
                        confidence: aiAnalysis.is_match ? 0.8 : 0.3
                    }));
                }
            }
        }
    } else {
        reconciliation.status = 'discrepancy';
        reconciliation.notes = 'AI Analysis failed or returned invalid format';
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

async function fetchExternalProviderData(npi, source, base44, config) {
  const startTime = Date.now();
  let endpoint = '';
  try {
    if (source === 'nppes') {
      endpoint = config?.nppes_endpoint || 'https://npiregistry.cms.hhs.gov/api/?version=2.1';
      console.log(`[Reconciliation] Fetching NPPES for ${npi} at ${endpoint}`);
      const res = await fetch(`${endpoint}&number=${npi}`);
      
      await logApiInteraction(base44, source, endpoint, npi, res.status, res.ok, null, Date.now() - startTime);

      if (!res.ok) throw new Error(`NPPES API Error: ${res.status}`);
      const data = await res.json();
      if (data.results && data.results.length > 0) {
        const basic = data.results[0].basic || {};
        const tax = data.results[0].taxonomies?.find(t => t.primary) || data.results[0].taxonomies?.[0];
        return {
          firstName: basic.first_name || '',
          lastName: basic.last_name || '',
          organizationName: basic.organization_name || '',
          status: basic.status === 'A' ? 'Active' : 'Inactive',
          specialty: tax ? tax.desc : ''
        };
      }
    } else if (source === 'pecos' && config?.pecos_endpoint) {
      endpoint = config.pecos_endpoint;
      console.log(`[Reconciliation] Fetching PECOS for ${npi} at ${endpoint}`);
      const headers = {};
      if (config.pecos_api_key) headers['Authorization'] = `Bearer ${config.pecos_api_key}`;
      const res = await fetch(`${endpoint}?npi=${npi}`, { headers });
      
      await logApiInteraction(base44, source, endpoint, npi, res.status, res.ok, null, Date.now() - startTime);

      if (!res.ok) throw new Error(`PECOS API Error: ${res.status}`);
      const data = await res.json();
      return {
          firstName: data.firstName || '',
          lastName: data.lastName || '',
          organizationName: data.organizationName || '',
          status: data.active ? 'Active' : 'Inactive',
          specialty: data.primarySpecialty || ''
      };
    } else if (source === 'cms' && config?.cms_endpoint) {
      endpoint = config.cms_endpoint;
      console.log(`[Reconciliation] Fetching CMS for ${npi} at ${endpoint}`);
      const headers = {};
      if (config.cms_api_key) headers['Authorization'] = `Bearer ${config.cms_api_key}`;
      const res = await fetch(`${endpoint}?npi=${npi}`, { headers });
      
      await logApiInteraction(base44, source, endpoint, npi, res.status, res.ok, null, Date.now() - startTime);

      if (!res.ok) throw new Error(`CMS API Error: ${res.status}`);
      const data = await res.json();
      return {
          firstName: data.first_name || '',
          lastName: data.last_name || '',
          organizationName: data.org_name || '',
          status: data.enrollment_status || '',
          specialty: data.specialty || ''
      };
    }
    
    // AI Fallback
    if (config?.enable_ai_fallback !== false) {
      console.log(`[Reconciliation] Falling back to AI search for ${npi} source: ${source}`);
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
    }
    
    return null;
  } catch (err) {
    console.error(`[Reconciliation] Failed to fetch ${source} data for NPI ${npi}:`, err);
    await logApiInteraction(base44, source, endpoint, npi, 500, false, err.message, Date.now() - startTime);
    return null;
  }
}

async function logApiInteraction(base44, source, endpoint, npi, status_code, is_success, error_message, response_time_ms) {
  try {
    await base44.entities.ApiInteractionLog.create({
      source,
      endpoint: endpoint || 'unknown',
      npi,
      status_code,
      is_success,
      error_message: error_message ? String(error_message).substring(0, 500) : '',
      response_time_ms
    });
  } catch (e) {
    console.error("Failed to log API interaction", e);
  }
}

// AI handles similarity and suggestions entirely