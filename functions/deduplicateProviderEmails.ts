import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { provider_id } = await req.json();

    if (!provider_id) {
      return Response.json({ error: 'provider_id is required' }, { status: 400 });
    }

    // Fetch the provider
    const providers = await base44.asServiceRole.entities.Provider.filter({ id: provider_id });
    if (providers.length === 0) {
      return Response.json({ error: 'Provider not found' }, { status: 404 });
    }

    const provider = providers[0];
    
    // Collect all emails
    const allEmails = [];
    if (provider.email) {
      allEmails.push({
        email: provider.email,
        source: 'primary',
        confidence: provider.email_confidence || 'unknown',
        quality_score: provider.email_quality_score || 0,
        validation_status: provider.email_validation_status || 'unknown'
      });
    }
    
    if (provider.additional_emails && Array.isArray(provider.additional_emails)) {
      provider.additional_emails.forEach((alt, idx) => {
        allEmails.push({
          email: alt.email,
          source: `additional_${idx}`,
          confidence: alt.confidence || 'unknown',
          quality_score: alt.quality_score || 0,
          validation_status: alt.validation_status || 'unknown'
        });
      });
    }

    if (allEmails.length <= 1) {
      return Response.json({
        success: true,
        provider_npi: provider.npi,
        email_groups: allEmails.length > 0 ? [{ 
          primary: allEmails[0], 
          alternatives: [] 
        }] : [],
        deduplication_performed: false
      });
    }

    // Use AI to identify duplicates/variants
    const prompt = `Analyze these email addresses and identify which ones are likely duplicates or variants of the same person/contact:

${allEmails.map((e, i) => `${i + 1}. ${e.email} (confidence: ${e.confidence}, quality_score: ${e.quality_score})`).join('\n')}

Provider: ${provider.first_name} ${provider.last_name} (${provider.npi})

For each group of duplicate/variant emails:
1. Identify which is the most reliable (consider confidence score and quality)
2. Explain why they're duplicates (typo, formatting variation, different domain, etc.)
3. Rank alternatives by reliability

Return a JSON object with:
{
  "groups": [
    {
      "primary_email": "the most reliable email",
      "reason_for_primary": "why this one is best",
      "alternatives": [
        {
          "email": "alternative email",
          "reason_duplicate": "why it's a duplicate",
          "reliability_score": 0-100
        }
      ]
    }
  ]
}`;

    const analysisResult = await base44.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: 'object',
        properties: {
          groups: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                primary_email: { type: 'string' },
                reason_for_primary: { type: 'string' },
                alternatives: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      email: { type: 'string' },
                      reason_duplicate: { type: 'string' },
                      reliability_score: { type: 'number' }
                    }
                  }
                }
              }
            }
          }
        }
      }
    });

    // Enrich groups with original metadata
    const enrichedGroups = (analysisResult.groups || []).map(group => {
      const primaryData = allEmails.find(e => e.email.toLowerCase() === group.primary_email.toLowerCase());
      const alternativesData = group.alternatives.map(alt => {
        const altData = allEmails.find(e => e.email.toLowerCase() === alt.email.toLowerCase());
        return {
          ...alt,
          ...altData
        };
      });
      
      return {
        primary: primaryData || { email: group.primary_email },
        primary_reason: group.reason_for_primary,
        alternatives: alternativesData
      };
    });

    return Response.json({
      success: true,
      provider_npi: provider.npi,
      email_groups: enrichedGroups,
      deduplication_performed: true,
      total_unique_groups: enrichedGroups.length
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});