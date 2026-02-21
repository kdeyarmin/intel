import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const { action = 'all', npi_list = [], limit = 50, skip_existing = true } = body;

    // Fetch providers to enrich
    let providers = [];
    if (npi_list.length > 0) {
      providers = await base44.asServiceRole.entities.Provider.filter({
        npi: { $in: npi_list }
      });
    } else {
      providers = await base44.asServiceRole.entities.Provider.list('-created_date', limit);
    }

    const results = {
      total: providers.length,
      success: 0,
      failed: 0,
      skipped: 0,
      details: []
    };

    for (const provider of providers) {
      try {
        // Skip if already enriched
        if (skip_existing) {
          const existing = await Promise.all([
            base44.asServiceRole.entities.ProviderMedicareCompare.filter({ npi: provider.npi }),
            base44.asServiceRole.entities.ProviderNPIValidation.filter({ npi: provider.npi }),
            base44.asServiceRole.entities.ProviderDEASchedules.filter({ npi: provider.npi })
          ]);

          if (existing.some(e => e.length > 0)) {
            results.skipped++;
            results.details.push({
              npi: provider.npi,
              status: 'skipped',
              reason: 'Already enriched'
            });
            continue;
          }
        }

        const enrichmentResults = {};

        // Enrich Medicare data
        if (action === 'all' || action === 'medicare') {
          try {
            const medicareRes = await base44.functions.invoke('enrichProviderMedicareData', {
              npi: provider.npi
            });
            enrichmentResults.medicare = medicareRes.data?.success;
          } catch (e) {
            enrichmentResults.medicare_error = e.message;
          }
        }

        // Validate NPI
        if (action === 'all' || action === 'npi') {
          try {
            const npiRes = await base44.functions.invoke('validateProviderNPI', {
              npi: provider.npi,
              checkDiscrepancies: true
            });
            enrichmentResults.npi = npiRes.data?.success;
          } catch (e) {
            enrichmentResults.npi_error = e.message;
          }
        }

        // Enrich DEA data
        if (action === 'all' || action === 'dea') {
          try {
            const deaRes = await base44.functions.invoke('enrichProviderDEAData', {
              npi: provider.npi
            });
            enrichmentResults.dea = deaRes.data?.success;
          } catch (e) {
            enrichmentResults.dea_error = e.message;
          }
        }

        const hasSuccess = Object.values(enrichmentResults).some(v => v === true);
        if (hasSuccess) {
          results.success++;
        } else {
          results.failed++;
        }

        results.details.push({
          npi: provider.npi,
          provider_name: provider.entity_type === 'Individual' 
            ? `${provider.first_name} ${provider.last_name}`.trim() 
            : provider.organization_name,
          status: hasSuccess ? 'success' : 'failed',
          enrichments: enrichmentResults
        });
      } catch (error) {
        results.failed++;
        results.details.push({
          npi: provider.npi,
          status: 'error',
          error: error.message
        });
      }
    }

    // Send summary email
    await base44.integrations.Core.SendEmail({
      to: user.email,
      subject: `Batch External Data Enrichment Complete - ${results.success}/${results.total} successful`,
      body: `
Batch External Data Enrichment Summary

Total Providers Processed: ${results.total}
Successful Enrichments: ${results.success}
Failed: ${results.failed}
Skipped: ${results.skipped}

Action: ${action}
Skip Existing: ${skip_existing}

Detailed results are available in the app dashboard.
      `
    });

    return Response.json({
      success: true,
      results
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});