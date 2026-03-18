import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const getTimestamp = (value) => (value ? new Date(value).getTime() : 0);

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { provider_npi, referral_data, force_refresh } = await req.json();

    if (!provider_npi) {
      return Response.json({ error: 'provider_npi is required' }, { status: 400 });
    }

    // Check if we have recent analysis (within 30 days) unless force_refresh
    if (!force_refresh) {
      const existingAnalysis = await base44.entities.ReferralPathwayAnalysis.filter({
        provider_npi: provider_npi
      });

      if (existingAnalysis.length > 0) {
        const latest = existingAnalysis.sort((a, b) =>
          getTimestamp(b.analysis_date) - getTimestamp(a.analysis_date)
        )[0];

        const daysSince = (Date.now() - getTimestamp(latest.analysis_date)) / (1000 * 60 * 60 * 24);
        if (daysSince < 30) {
          return Response.json({ 
            message: 'Using cached analysis',
            analysis: latest 
          });
        }
      }
    }

    // Fetch provider details
    const providers = await base44.entities.Provider.filter({ npi: provider_npi });
    const provider = providers[0];

    if (!provider) {
      return Response.json({ error: 'Provider not found' }, { status: 404 });
    }

    // Fetch taxonomies
    const taxonomies = await base44.entities.ProviderTaxonomy.filter({ npi: provider_npi });
    const primaryTaxonomy = taxonomies.find(t => t.primary_flag) || taxonomies[0];

    // Fetch location
    const locations = await base44.entities.ProviderLocation.filter({ npi: provider_npi });
    const primaryLocation = locations.find(l => l.is_primary) || locations[0];

    // Fetch referral data (if provided, otherwise use CMS data)
    let referrals = referral_data || [];
    if (!referral_data) {
      const cmsReferrals = await base44.entities.CMSReferral.filter({ npi: provider_npi });
      referrals = cmsReferrals;
    }

    // Fetch preferred agencies
    const preferredAgencies = await base44.entities.PreferredAgency.filter({ active: true });

    // Build analysis prompt for AI
    const analysisPrompt = `
You are an expert in healthcare referral pattern analysis. Analyze the following provider's referral behavior:

PROVIDER PROFILE:
- NPI: ${provider_npi}
- Name: ${provider.entity_type === 'Organization' ? provider.organization_name : `${provider.first_name} ${provider.last_name}`}
- Specialty: ${primaryTaxonomy?.taxonomy_description || 'Unknown'}
- Location: ${primaryLocation?.city}, ${primaryLocation?.state}

REFERRAL DATA:
${referrals.length > 0 ? JSON.stringify(referrals, null, 2) : 'No detailed referral data available yet. Provide general analysis based on specialty and location.'}

PREFERRED AGENCY NETWORK:
${preferredAgencies.map(a => `- ${a.agency_name} (${a.agency_type}) - ${a.network_tier}`).join('\n')}

ANALYSIS TASKS:
1. Identify the provider's referral pattern (concentrated, diversified, specialty-driven, geography-based)
2. List top referral destinations with estimated percentages
3. Predict the most likely next referral destination with probability and reasoning
4. Detect if referrals are going outside the preferred network (leakage)
5. Provide strategic insights about this provider's referral behavior
6. Recommend engagement strategies to increase preferred network utilization

Return your analysis in the following JSON structure (no markdown, just JSON):
{
  "total_referrals_analyzed": <number>,
  "top_destinations": [
    {
      "agency_name": "string",
      "agency_type": "string",
      "referral_count": <number>,
      "percentage": <number>,
      "in_network": <boolean>
    }
  ],
  "referral_pattern": "string describing the pattern",
  "predicted_next_referral": {
    "agency_name": "string",
    "agency_type": "string",
    "probability": <number between 0-100>,
    "reasoning": "string explaining why"
  },
  "leakage_detected": <boolean>,
  "leakage_details": {
    "out_of_network_count": <number>,
    "out_of_network_percentage": <number>,
    "top_leakage_destinations": [
      {"agency_name": "string", "referral_count": <number>}
    ]
  },
  "ai_insights": "string with 2-3 sentences of strategic insights",
  "recommendations": ["string array of 3-4 actionable recommendations"]
}`;

    // Call AI for analysis
    const aiResponse = await base44.integrations.Core.InvokeLLM({
      prompt: analysisPrompt,
      response_json_schema: {
        type: "object",
        properties: {
          total_referrals_analyzed: { type: "number" },
          top_destinations: {
            type: "array",
            items: { type: "object" }
          },
          referral_pattern: { type: "string" },
          predicted_next_referral: { type: "object" },
          leakage_detected: { type: "boolean" },
          leakage_details: { type: "object" },
          ai_insights: { type: "string" },
          recommendations: {
            type: "array",
            items: { type: "string" }
          }
        }
      }
    });

    // Save analysis to database
    const analysisRecord = await base44.entities.ReferralPathwayAnalysis.create({
      provider_npi: provider_npi,
      analysis_date: new Date().toISOString(),
      total_referrals_analyzed: aiResponse.total_referrals_analyzed,
      top_destinations: aiResponse.top_destinations,
      referral_pattern: aiResponse.referral_pattern,
      predicted_next_referral: aiResponse.predicted_next_referral,
      leakage_detected: aiResponse.leakage_detected,
      leakage_details: aiResponse.leakage_details,
      ai_insights: aiResponse.ai_insights,
      recommendations: aiResponse.recommendations
    });

    // Log audit event
    await base44.entities.AuditEvent.create({
      event_type: 'scoring_run',
      user_email: user.email,
      details: {
        action: 'referral_pathway_analysis',
        entity: 'ReferralPathwayAnalysis',
        provider_npi: provider_npi,
        message: `AI analysis completed for provider ${provider_npi}`
      }
    });

    return Response.json({
      success: true,
      analysis: analysisRecord
    });

  } catch (error) {
    console.error('Error analyzing referral pathways:', error);
    return Response.json({ 
      error: error.message,
      stack: error.stack 
    }, { status: 500 });
  }
});
