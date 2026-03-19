import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { npi } = await req.json();
    if (!npi) return Response.json({ error: 'NPI required' }, { status: 400 });

    const providers = await base44.asServiceRole.entities.Provider.filter({ npi });
    if (!providers || providers.length === 0) {
      return Response.json({ error: 'Provider not found' }, { status: 404 });
    }
    const provider = providers[0];

    // Build the context
    const name = provider.entity_type === 'Individual'
      ? `${provider.first_name || ''} ${provider.last_name || ''}`.trim()
      : provider.organization_name || '';

    const firmographics = provider.firmographics ? JSON.stringify(provider.firmographics) : 'None';
    const linkedin = provider.linkedin_url || 'None';
    const twitter = provider.twitter_url || 'None';
    const emailInfo = provider.email ? `${provider.email} (Status: ${provider.email_validation_status || 'unknown'}, Score: ${provider.email_quality_score || 'N/A'})` : 'None';
    const website = provider.website || 'None';
    
    const prompt = `Analyze the following healthcare provider data to predict the likelihood of successful email outreach engagement and suggest an optimal strategy.

PROVIDER:
- Name: ${name}
- NPI: ${provider.npi}
- Type: ${provider.entity_type}
- Credential: ${provider.credential || 'N/A'}
- Firmographics: ${firmographics}
- LinkedIn: ${linkedin}
- Twitter: ${twitter}
- Email Info: ${emailInfo}
- Website: ${website}

INSTRUCTIONS:
1. Provide a score from 0-100 indicating the likelihood of outreach success based on the data richness and validity (e.g., valid email, presence of social profiles, known firmographics increase score).
2. Generate a concise profile summary.
3. Suggest a 1-2 sentence outreach strategy based on their data (e.g., mentioning firmographics or social presence).
4. List 2-4 key factors influencing this score.`;

    const aiRes = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: "object",
        properties: {
          score: { type: "number" },
          summary: { type: "string" },
          strategy: { type: "string" },
          factors: { type: "array", items: { type: "string" } }
        }
      }
    });

    const updates = {
      ai_outreach_score: aiRes.score,
      ai_profile_summary: aiRes.summary,
      ai_outreach_strategy: aiRes.strategy,
      ai_engagement_factors: aiRes.factors
    };

    await base44.asServiceRole.entities.Provider.update(provider.id, updates);

    return Response.json({ success: true, result: updates });
  } catch (error) {
    console.error('calculateOutreachScore error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});