import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

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

    // Get the provider and their email data
    const provider = await base44.entities.Provider.get(provider_id);
    if (!provider) {
      return Response.json({ error: 'Provider not found' }, { status: 404 });
    }

    // Collect all emails for this provider
    const allEmails = [];
    
    // Primary email
    if (provider.email) {
      allEmails.push({
        email: provider.email,
        confidence: provider.email_confidence || 'medium',
        source: provider.email_source || 'search',
        validation_status: provider.email_validation_status || 'unknown',
        quality_score: provider.email_quality_score || 0,
        quality_confidence: provider.email_quality_confidence || 'low'
      });
    }

    // Additional emails
    if (provider.additional_emails && Array.isArray(provider.additional_emails)) {
      allEmails.push(...provider.additional_emails.map(e => ({
        email: e.email,
        confidence: e.confidence || 'medium',
        source: e.source || 'search',
        validation_status: e.validation_status || 'unknown',
        quality_score: 0
      })));
    }

    // If only one email, no deduplication needed
    if (allEmails.length <= 1) {
      return Response.json({
        success: true,
        email_groups: [],
        message: 'Only one email found, no deduplication needed'
      });
    }

    // Use AI to identify duplicates and group similar emails
    const deduplicationPrompt = `You are an email deduplication expert. Analyze these email addresses for the same provider and identify potential duplicates or similar variations.

Provider: ${provider.entity_type === 'Individual' ? `${provider.first_name} ${provider.last_name}` : provider.organization_name}
Organization: ${provider.organization_name || 'N/A'}

Email addresses found:
${allEmails.map((e, i) => `${i + 1}. ${e.email} (confidence: ${e.confidence}, validation: ${e.validation_status})`).join('\n')}

For each group of similar/duplicate emails:
1. Identify which is the PRIMARY email (most verified, highest confidence, best quality)
2. List ALTERNATIVES with why they're duplicates/similar
3. Provide the REASON for choosing the primary one

Format your response as JSON with this structure:
{
  "groups": [
    {
      "primary": {"email": "...", "confidence": "..."},
      "primary_reason": "Why this is the best one",
      "alternatives": [
        {"email": "...", "reason_duplicate": "Why this is similar/duplicate", "confidence": "...", "reliability_score": 75}
      ]
    }
  ],
  "analysis_notes": "General observations about the emails"
}

IMPORTANT: Return ONLY valid JSON, no markdown formatting or code blocks.`;

    const llmResponse = await base44.integrations.Core.InvokeLLM({
      prompt: deduplicationPrompt,
      response_json_schema: {
        type: "object",
        properties: {
          groups: {
            type: "array",
            items: {
              type: "object",
              properties: {
                primary: { type: "object" },
                primary_reason: { type: "string" },
                alternatives: {
                  type: "array",
                  items: { type: "object" }
                }
              }
            }
          },
          analysis_notes: { type: "string" }
        }
      }
    });

    // Enrich groups with quality data from our system
    const enrichedGroups = (llmResponse.groups || []).map(group => {
      const primaryData = allEmails.find(e => e.email === group.primary.email);
      const enrichedAlts = (group.alternatives || []).map(alt => {
        const altData = allEmails.find(e => e.email === alt.email);
        return {
          ...alt,
          validation_status: altData?.validation_status,
          quality_score: altData?.quality_score || 0,
          reliability_score: alt.reliability_score || 65
        };
      });

      return {
        primary: {
          ...primaryData,
          email: group.primary.email
        },
        primary_reason: group.primary_reason,
        alternatives: enrichedAlts
      };
    });

    // Save deduplication result to provider for future reference
    await base44.entities.Provider.update(provider_id, {
      email_dedup_analyzed_at: new Date().toISOString()
    });

    return Response.json({
      success: true,
      email_groups: enrichedGroups,
      analysis_notes: llmResponse.analysis_notes,
      total_emails: allEmails.length,
      unique_groups: enrichedGroups.length
    });
  } catch (error) {
    console.error('Deduplication error:', error);
    return Response.json(
      { error: error.message || 'Deduplication failed' },
      { status: 500 }
    );
  }
});