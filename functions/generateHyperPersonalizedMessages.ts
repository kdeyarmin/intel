import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { campaign_id, limit = 50 } = await req.json();

        if (!campaign_id) {
            return Response.json({ error: 'Campaign ID required' }, { status: 400 });
        }

        const campaign = await base44.entities.OutreachCampaign.get(campaign_id);
        if (!campaign) {
            return Response.json({ error: 'Campaign not found' }, { status: 404 });
        }

        // Find pending messages that don't have a body yet
        // We use 'pending' status. We might want to add a 'generated' status or just check if body_html is empty.
        // Let's filter for status 'pending' and empty body_html (if possible in filter, otherwise in code)
        const messages = await base44.entities.OutreachMessage.filter({ campaign_id: campaign_id, status: 'pending' });
        
        // Filter those needing generation
        const toGenerate = messages.filter(m => !m.body_html).slice(0, limit);

        if (toGenerate.length === 0) {
            return Response.json({ message: 'No messages need generation', count: 0 });
        }

        // Fetch provider data for these messages
        const npis = toGenerate.map(m => m.npi);
        const providers = await base44.entities.Provider.filter({ npi: { $in: npis } }); // Pseudo-filter, actually likely need to loop or bulk fetch if supported. 
        // SDK filter typically doesn't support $in complex queries like Mongo yet unless documented. 
        // Safer to fetch individually or fetch all providers in batches if list is huge. 
        // For now, let's fetch all providers matching NPIs. If filter doesn't support list, we loop.
        
        // Optimized: Fetch providers one by one or assuming we can fetch by list. 
        // Let's assume we need to fetch individually for safety or use a simpler approach.
        // Actually, let's just loop.
        
        let generatedCount = 0;

        for (const msg of toGenerate) {
            try {
                // Fetch context
                const providerList = await base44.entities.Provider.filter({ npi: msg.npi });
                const provider = providerList[0];
                if (!provider) continue;

                const locations = await base44.entities.ProviderLocation.filter({ npi: msg.npi });
                const primaryLoc = locations.find(l => l.is_primary) || locations[0];
                
                const referrals = await base44.entities.CMSReferral.filter({ npi: msg.npi });
                const referralStats = referrals[0];

                const scores = await base44.entities.LeadScore.filter({ npi: msg.npi });
                const score = scores[0];

                // Construct prompt
                const context = {
                    name: msg.recipient_name,
                    specialty: provider.credential || 'Healthcare Provider',
                    organization: provider.organization_name,
                    city: primaryLoc?.city,
                    state: primaryLoc?.state,
                    referral_volume: referralStats?.total_referrals,
                    lead_score: score?.score,
                    campaign_context: campaign.description
                };

                const prompt = `
                Write a short, highly personalized email body for this provider.
                
                Campaign Goal: ${campaign.name} - ${campaign.description}
                
                Recipient Profile:
                - Name: ${context.name}
                - Location: ${context.city || 'Unknown'}, ${context.state || ''}
                - Organization: ${context.organization || 'Private Practice'}
                - Referral Volume: ${context.referral_volume || 'Unknown'}
                - Lead Score: ${context.lead_score || 'N/A'}

                Instructions:
                - Be concise (under 150 words).
                - Reference their specific location or volume if impressive.
                - Connect CareMetric's value to their specific situation.
                - End with a clear call to action.
                - Return strictly HTML content for the body (no <html> tags, just the content).
                `;

                const aiRes = await base44.integrations.Core.InvokeLLM({
                    prompt,
                    response_json_schema: {
                        type: "object",
                        properties: {
                            body_html: { type: "string" },
                            personalization_reason: { type: "string" }
                        }
                    }
                });

                const result = typeof aiRes === 'string' ? JSON.parse(aiRes) : aiRes;

                if (result.body_html) {
                    await base44.entities.OutreachMessage.update(msg.id, {
                        body_html: result.body_html,
                        status: 'generated',
                        ai_personalization_reason: result.personalization_reason
                    });
                    generatedCount++;
                }

            } catch (err) {
                console.error(`Failed to generate for ${msg.npi}`, err);
            }
        }

        return Response.json({ 
            success: true, 
            generated: generatedCount,
            total_pending: messages.length - generatedCount 
        });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});