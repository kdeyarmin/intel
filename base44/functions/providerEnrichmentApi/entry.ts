import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

type ProviderEnrichmentPayload = {
    npi?: string;
};

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        let payload: ProviderEnrichmentPayload = {};
        try {
            payload = await req.json();
        } catch (e) {
            return Response.json({ error: 'Invalid JSON payload' }, { status: 400 });
        }
        
        const { npi } = payload;

        if (!npi) {
            return Response.json({ error: 'NPI is required' }, { status: 400 });
        }

        // 1. Fetch existing data from the database
        const providers = await base44.asServiceRole.entities.Provider.filter({ npi });
        const provider = providers.length > 0 ? providers[0] : null;

        const locations = await base44.asServiceRole.entities.ProviderLocation.filter({ npi });
        const taxonomies = await base44.asServiceRole.entities.ProviderTaxonomy.filter({ npi });

        // 2. Fetch latest data from NPPES API
        let nppesData = null;
        try {
            const nppesRes = await fetch(`https://npiregistry.cms.hhs.gov/api/?version=2.1&number=${npi}`);
            if (nppesRes.ok) {
                const data = await nppesRes.json();
                if (data.results && data.results.length > 0) {
                    nppesData = data.results[0];
                }
            }
        } catch (e) {
            console.error("NPPES API Error:", e);
        }

        // 3. AI Enrichment for missing/outdated info
        let aiSuggestions = null;
        try {
            const prompt = `
                Analyze the healthcare provider with NPI: ${npi}.
                
                Current DB Data:
                Provider: ${JSON.stringify(provider || {})}
                Locations: ${JSON.stringify(locations || [])}
                Taxonomies: ${JSON.stringify(taxonomies || [])}
                
                Latest NPPES Registry Data: ${JSON.stringify(nppesData || {})}

                Search the internet for this provider to find missing or outdated information. Look for:
                - Current practice website
                - Active email addresses
                - New or unlisted practice locations and phone numbers
                - Additional specialties or clinical focus areas

                Compare the found information with the provided data and return intelligent suggestions for updates.
            `;

            aiSuggestions = await base44.asServiceRole.integrations.Core.InvokeLLM({
                prompt: prompt,
                add_context_from_internet: true,
                response_json_schema: {
                    type: "object",
                    properties: {
                        suggested_website: { type: "string", description: "Found website URL if any" },
                        suggested_emails: { type: "array", items: { type: "string" }, description: "Found email addresses" },
                        suggested_locations: { 
                            type: "array", 
                            items: { 
                                type: "object",
                                properties: {
                                    address: { type: "string" },
                                    phone: { type: "string" },
                                    is_new_or_updated: { type: "boolean" }
                                }
                            }
                        },
                        suggested_specialties: { type: "array", items: { type: "string" } },
                        enrichment_notes: { type: "string", description: "Explanation of findings and what should be updated" },
                        confidence_score: { type: "number", description: "1-100 score on the confidence of these suggestions" }
                    }
                }
            });
        } catch (e) {
            console.error("AI Enrichment Error:", e);
        }

        return Response.json({
            npi,
            status: 'success',
            database_record: {
                provider,
                locations,
                taxonomies
            },
            nppes_registry_data: nppesData,
            ai_enrichment_suggestions: aiSuggestions
        });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});
