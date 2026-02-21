import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // This function is triggered by an entity automation
        // Payload contains: { event: { type, entity_name, entity_id }, data: { ... } }
        const payload = await req.json();
        const { event, data } = payload;

        // Verify it's a provider creation event
        if (!event || event.entity_name !== 'Provider' || event.type !== 'create') {
             // Fallback for manual invocation (e.g. testing)
             if (payload.npi) {
                // handle manual test case if needed, but primarily this is for automation
             } else {
                return Response.json({ message: 'Ignored: Not a provider creation event' });
             }
        }

        const provider = data || (payload.npi ? await base44.entities.Provider.filter({npi: payload.npi}).then(r => r[0]) : null);

        if (!provider) {
            return Response.json({ error: 'Provider data not found' });
        }

        // Use service role for updates since this is a system automation
        const adminClient = base44.asServiceRole;

        // Construct search query
        const name = provider.entity_type === 'Individual' 
            ? `${provider.first_name} ${provider.last_name} ${provider.credential || ''} ${provider.organization_name || ''}`
            : provider.organization_name;
        
        // We need location context if possible. Since this runs ON create, we might not have locations yet 
        // if they are created AFTER the provider.
        // However, usually the crawler inserts provider then locations. 
        // Let's try to fetch locations for context.
        const locations = await adminClient.entities.ProviderLocation.filter({ npi: provider.npi });
        const locationContext = locations.map(l => `${l.city}, ${l.state}`).join('; ');
        
        const prompt = `
        Search for contact information for this healthcare provider:
        Name: ${name}
        NPI: ${provider.npi}
        Locations Context: ${locationContext}

        Find the following information:
        1. Primary Email Address
        2. Cell Phone Number (or direct mobile line)
        3. Practice Website URL
        4. Primary Practice Address (if different/better than what might be known)

        Only return information if you find it with high confidence (likely to be accurate).
        `;

        const llmResponse = await adminClient.integrations.Core.InvokeLLM({
            prompt: prompt,
            add_context_from_internet: true,
            response_json_schema: {
                type: "object",
                properties: {
                    email: { type: "string", description: "Primary email address if found with high confidence" },
                    email_confidence: { type: "string", enum: ["high", "medium", "low"], description: "Confidence level of email" },
                    email_source: { type: "string", description: "URL or source where email was found" },
                    cell_phone: { type: "string", description: "Cell/Mobile number if found with high confidence" },
                    website: { type: "string", description: "Website URL" },
                    address: { 
                        type: "object", 
                        properties: {
                            street: { type: "string" },
                            city: { type: "string" },
                            state: { type: "string" },
                            zip: { type: "string" },
                            phone: { type: "string", description: "Office phone number" }
                        },
                        description: "Primary practice address if found"
                    },
                    confidence_score: { type: "number", description: "Overall confidence 0-1" }
                }
            }
        });

        // Parse response (InvokeLLM returns a dict if schema is provided, but checking type just in case)
        const result = typeof llmResponse === 'string' ? JSON.parse(llmResponse) : llmResponse;
        
        if (!result) {
            return Response.json({ message: 'No info found' });
        }

        const updates = {};
        let updated = false;

        // Only update if confidence is high (user requirement)
        // We'll trust the LLM's "high" assessment or a score > 0.8
        const isHighConfidence = result.confidence_score > 0.8 || result.email_confidence === 'high';

        if (isHighConfidence) {
            if (result.email && !provider.email) {
                updates.email = result.email;
                updates.email_confidence = 'high';
                updates.email_source = result.email_source || 'AI Search';
                updates.email_searched_at = new Date().toISOString();
                updated = true;
            }
            
            if (result.cell_phone && !provider.cell_phone) {
                updates.cell_phone = result.cell_phone;
                updated = true;
            }

            if (result.website && !provider.website) {
                updates.website = result.website;
                updated = true;
            }
        }

        if (updated) {
            await adminClient.entities.Provider.update(provider.id, updates);
        }

        // Handle Address/Location
        if (result.address && result.address.street && isHighConfidence) {
             // Check if this address matches any existing location
             const isNewAddress = !locations.some(l => 
                l.address_1?.toLowerCase().includes(result.address.street.toLowerCase()) ||
                (l.city?.toLowerCase() === result.address.city.toLowerCase() && l.zip === result.address.zip)
             );

             if (isNewAddress) {
                 await adminClient.entities.ProviderLocation.create({
                     npi: provider.npi,
                     location_type: 'Practice',
                     is_primary: false, // Don't override existing primary without checking
                     address_1: result.address.street,
                     city: result.address.city,
                     state: result.address.state,
                     zip: result.address.zip,
                     phone: result.address.phone,
                     source: 'ai_suggested' // Assuming we add this source or it's fine
                 });
             }
        }

        return Response.json({ 
            success: true, 
            updated, 
            found: result 
        });

    } catch (error) {
        console.error('Auto enrichment failed:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});