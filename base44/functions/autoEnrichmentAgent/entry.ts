import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // 1. Find providers with missing NPIs
        const providersWithoutNPI = await base44.asServiceRole.entities.Provider.filter({ npi: null }, 5); // Limit to 5
        
        // 2. Find providers marked for enrichment or pending
        const providersToEnrich = await base44.asServiceRole.entities.Provider.filter({ ai_enrichment_status: 'pending' }, 5);

        const results = {
            npi_found: 0,
            enriched: 0,
            alerts_created: 0,
            errors: []
        };

        // Handle missing NPIs
        for (const p of providersWithoutNPI) {
            try {
                // Try to find NPI via AI search
                const prompt = `Find the NPI number for healthcare provider: ${p.first_name} ${p.last_name} ${p.organization_name || ''} in ${p.state || ''}. Return JSON: {"npi": "string"}`;
                const aiRes = await base44.asServiceRole.integrations.Core.InvokeLLM({
                    prompt,
                    add_context_from_internet: true,
                    response_json_schema: { type: "object", properties: { npi: { type: "string" } } }
                });

                if (aiRes.npi) {
                    await base44.asServiceRole.entities.Provider.update(p.id, { 
                        npi: aiRes.npi,
                        ai_enrichment_notes: `NPI found via Auto-Monitor: ${aiRes.npi}`
                    });
                    results.npi_found++;
                } else {
                    // Flag as critical gap
                    await base44.asServiceRole.entities.DataQualityAlert.create({
                        title: `Missing NPI for ${p.first_name} ${p.last_name}`,
                        description: "Could not automatically resolve NPI. Manual review required.",
                        severity: "critical",
                        entity_type: "Provider",
                        action_required: true,
                        status: "new"
                    });
                    results.alerts_created++;
                }
            } catch (e) {
                console.error(`Error finding NPI for ${p.id}`, e);
                results.errors.push(`NPI Lookup ${p.id}: ${e.message}`);
            }
        }

        // Handle Enrichment
        for (const p of providersToEnrich) {
            try {
                if (!p.npi) continue; // Skip if still no NPI

                // Invoke the existing enrichment API logic (we can't call the endpoint easily from here without full URL, 
                // so we'll reimplement the core logic or assume we can invoke it if it was a function. 
                // Since providerEnrichmentApi is a function, let's use base44.functions.invoke)
                
                const enrichmentRes = await base44.functions.invoke('providerEnrichmentApi', { npi: p.npi });
                
                if (enrichmentRes.data && enrichmentRes.data.ai_enrichment_suggestions) {
                    const suggestions = enrichmentRes.data.ai_enrichment_suggestions;
                    
                    // Update Provider with enrichment status
                    await base44.asServiceRole.entities.Provider.update(p.id, {
                        ai_enrichment_status: 'enriched',
                        ai_enrichment_timestamp: new Date().toISOString(),
                        ai_enrichment_notes: JSON.stringify(suggestions),
                        // Automatically update email if high confidence
                        email: (!p.email && suggestions.suggested_emails?.[0]) ? suggestions.suggested_emails[0] : p.email
                    });
                    results.enriched++;

                    // Check for critical gaps in suggestions
                    if (suggestions.enrichment_notes && suggestions.enrichment_notes.toLowerCase().includes('critical')) {
                         await base44.asServiceRole.entities.DataQualityAlert.create({
                            title: `Critical Data Gap for NPI ${p.npi}`,
                            description: suggestions.enrichment_notes,
                            severity: "high",
                            entity_type: "Provider",
                            action_required: true,
                            status: "new"
                        });
                        results.alerts_created++;
                    }
                } else {
                     await base44.asServiceRole.entities.Provider.update(p.id, {
                        ai_enrichment_status: 'failed',
                        ai_enrichment_notes: "Enrichment API returned no suggestions"
                    });
                }

            } catch (e) {
                console.error(`Error enriching ${p.npi}`, e);
                results.errors.push(`Enrichment ${p.npi}: ${e.message}`);
                 await base44.asServiceRole.entities.Provider.update(p.id, {
                    ai_enrichment_status: 'failed',
                    ai_enrichment_notes: e.message
                });
            }
        }

        return Response.json(results);

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});