import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

type ProviderEnrichmentUpdate = {
    entity_type: string;
    status: string;
    last_update_date: string;
    needs_nppes_enrichment: boolean;
    first_name?: string;
    last_name?: string;
    middle_name?: string;
    credential?: string;
    gender?: string;
    organization_name?: string;
    enumeration_date?: string;
};

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const payload = await req.json();
        const { npi, batch_size = 50 } = payload;

        let providersToEnrich = [];
        
        if (npi) {
            // Single NPI enrichment
            const provider = await base44.entities.Provider.filter({ npi });
            if (provider.length > 0) {
                providersToEnrich = provider;
            }
        } else {
            // Batch enrichment of providers that need it
            const needsEnrichment = await base44.entities.Provider.filter({ 
                needs_nppes_enrichment: true 
            });
            providersToEnrich = needsEnrichment.slice(0, batch_size);
        }

        if (providersToEnrich.length === 0) {
            return Response.json({ 
                message: 'No providers need enrichment',
                enriched: 0 
            });
        }

        let enrichedCount = 0;
        let failedCount = 0;
        const errors = [];

        for (const provider of providersToEnrich) {
            try {
                // Call NPPES API
                const response = await fetch(
                    `https://npiregistry.cms.hhs.gov/api/?version=2.1&number=${provider.npi}`
                );
                
                if (!response.ok) {
                    throw new Error(`NPPES API error: ${response.status}`);
                }

                const data = await response.json();
                
                if (!data.results || data.results.length === 0) {
                    throw new Error('NPI not found in NPPES registry');
                }

                const nppesData = data.results[0];
                const basicInfo = nppesData.basic;
                const addresses = nppesData.addresses || [];
                const taxonomies = nppesData.taxonomies || [];

                // Update Provider
                const providerUpdate: ProviderEnrichmentUpdate = {
                    entity_type: nppesData.enumeration_type === 'NPI-1' ? 'Individual' : 'Organization',
                    status: basicInfo.status === 'A' ? 'Active' : 'Deactivated',
                    last_update_date: new Date().toISOString(),
                    needs_nppes_enrichment: false,
                };

                if (nppesData.enumeration_type === 'NPI-1') {
                    providerUpdate.first_name = basicInfo.first_name;
                    providerUpdate.last_name = basicInfo.last_name;
                    providerUpdate.middle_name = basicInfo.middle_name;
                    providerUpdate.credential = basicInfo.credential;
                    providerUpdate.gender = basicInfo.gender === 'M' ? 'M' : basicInfo.gender === 'F' ? 'F' : '';
                } else {
                    providerUpdate.organization_name = basicInfo.organization_name || basicInfo.name;
                }

                if (basicInfo.enumeration_date) {
                    providerUpdate.enumeration_date = basicInfo.enumeration_date;
                }

                await base44.asServiceRole.entities.Provider.update(provider.id, providerUpdate);

                // Add/Update Locations
                for (const address of addresses) {
                    const locationType = address.address_purpose === 'LOCATION' ? 'Practice' : 'Mailing';
                    
                    const locationData = {
                        npi: provider.npi,
                        location_type: locationType,
                        is_primary: address.address_purpose === 'LOCATION',
                        address_1: address.address_1,
                        address_2: address.address_2,
                        city: address.city,
                        state: address.state,
                        zip: address.postal_code,
                        phone: address.telephone_number,
                        fax: address.fax_number,
                    };

                    // Check if location already exists
                    const existingLoc = await base44.asServiceRole.entities.ProviderLocation.filter({
                        npi: provider.npi,
                        location_type: locationType
                    });

                    if (existingLoc.length === 0) {
                        await base44.asServiceRole.entities.ProviderLocation.create(locationData);
                    } else {
                        await base44.asServiceRole.entities.ProviderLocation.update(
                            existingLoc[0].id, 
                            locationData
                        );
                    }
                }

                // Add/Update Taxonomies
                for (const taxonomy of taxonomies) {
                    const taxonomyData = {
                        npi: provider.npi,
                        taxonomy_code: taxonomy.code,
                        taxonomy_description: taxonomy.desc,
                        primary_flag: taxonomy.primary || false,
                        license_number: taxonomy.license,
                        state: taxonomy.state,
                    };

                    // Check if taxonomy already exists
                    const existingTax = await base44.asServiceRole.entities.ProviderTaxonomy.filter({
                        npi: provider.npi,
                        taxonomy_code: taxonomy.code
                    });

                    if (existingTax.length === 0) {
                        await base44.asServiceRole.entities.ProviderTaxonomy.create(taxonomyData);
                    } else {
                        await base44.asServiceRole.entities.ProviderTaxonomy.update(
                            existingTax[0].id,
                            taxonomyData
                        );
                    }
                }

                enrichedCount++;

                // Small delay to respect API rate limits
                await new Promise(resolve => setTimeout(resolve, 100));

            } catch (error) {
                failedCount++;
                errors.push({
                    npi: provider.npi,
                    error: error.message
                });
                console.error(`Failed to enrich ${provider.npi}:`, error);
            }
        }

        // Log audit event
        await base44.asServiceRole.entities.AuditEvent.create({
            event_type: 'import',
            user_email: user.email,
            details: {
                action: 'NPPES Data Enrichment',
                entity: 'Provider',
                enriched_count: enrichedCount,
                failed_count: failedCount,
                message: `Enriched ${enrichedCount} providers from NPPES API`
            },
            timestamp: new Date().toISOString(),
        });

        return Response.json({
            success: true,
            enriched: enrichedCount,
            failed: failedCount,
            errors: errors.length > 0 ? errors.slice(0, 5) : undefined
        });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});
