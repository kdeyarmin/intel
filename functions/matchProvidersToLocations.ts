import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { npi_list } = body;

  // Fetch all required data + historical feedback
  const [providers, locations, taxonomies, referrals, utilizations, pastMatches] = await Promise.all([
    base44.entities.Provider.filter({}),
    base44.entities.ProviderLocation.filter({}),
    base44.entities.ProviderTaxonomy.filter({}),
    base44.entities.CMSReferral.filter({}),
    base44.entities.CMSUtilization.filter({}),
    base44.entities.ProviderLocationMatch.filter({}),
  ]);

  // ---- Build feedback summary from past decisions ----
  const approvedMatches = pastMatches.filter(m => m.status === 'approved');
  const rejectedMatches = pastMatches.filter(m => m.status === 'rejected');
  const overrideMatches = pastMatches.filter(m => m.status === 'override');

  // Extract patterns from approved matches (what works)
  const approvedPatterns = approvedMatches.slice(0, 30).map(m => ({
    npi: m.npi,
    location_id: m.location_id,
    provider_name: m.provider_name,
    location_display: m.location_display,
    confidence: m.confidence_score,
    spec_score: m.specialization_score,
    prox_score: m.proximity_score,
    ref_score: m.referral_score,
  }));

  // Extract patterns from rejected matches (what doesn't work)
  const rejectedPatterns = rejectedMatches.slice(0, 20).map(m => ({
    npi: m.npi,
    location_id: m.location_id,
    provider_name: m.provider_name,
    location_display: m.location_display,
    confidence: m.confidence_score,
    reasons: m.match_reasons,
  }));

  // Extract override insights (user corrections)
  const overrideInsights = overrideMatches.slice(0, 15).map(m => ({
    npi: m.npi,
    location_id: m.location_id,
    provider_name: m.provider_name,
    location_display: m.location_display,
    override_notes: m.override_notes,
    original_confidence: m.confidence_score,
  }));

  // Compute feedback weight adjustments
  const avgApprovedSpec = approvedMatches.length
    ? Math.round(approvedMatches.reduce((s, m) => s + (m.specialization_score || 0), 0) / approvedMatches.length)
    : 50;
  const avgApprovedProx = approvedMatches.length
    ? Math.round(approvedMatches.reduce((s, m) => s + (m.proximity_score || 0), 0) / approvedMatches.length)
    : 50;
  const avgApprovedRef = approvedMatches.length
    ? Math.round(approvedMatches.reduce((s, m) => s + (m.referral_score || 0), 0) / approvedMatches.length)
    : 50;

  const feedbackStats = {
    total_past_decisions: pastMatches.filter(m => m.status !== 'suggested').length,
    approved_count: approvedMatches.length,
    rejected_count: rejectedMatches.length,
    override_count: overrideMatches.length,
    avg_approved_specialization: avgApprovedSpec,
    avg_approved_proximity: avgApprovedProx,
    avg_approved_referral: avgApprovedRef,
  };

  // Filter providers if npi_list given
  const targetProviders = npi_list?.length
    ? providers.filter(p => npi_list.includes(p.npi))
    : providers.slice(0, 50);

  // Index data by NPI
  const locByNPI = {};
  locations.forEach(l => {
    if (!locByNPI[l.npi]) locByNPI[l.npi] = [];
    locByNPI[l.npi].push(l);
  });

  const taxByNPI = {};
  taxonomies.forEach(t => {
    if (!taxByNPI[t.npi]) taxByNPI[t.npi] = [];
    taxByNPI[t.npi].push(t);
  });

  const refByNPI = {};
  referrals.forEach(r => { refByNPI[r.npi] = r; });

  const utilByNPI = {};
  utilizations.forEach(u => { utilByNPI[u.npi] = u; });

  // Build provider summaries
  const providerSummaries = targetProviders.map(p => {
    const tax = taxByNPI[p.npi] || [];
    const ref = refByNPI[p.npi];
    const util = utilByNPI[p.npi];
    const ownLocs = locByNPI[p.npi] || [];
    const primaryState = ownLocs.find(l => l.is_primary)?.state || ownLocs[0]?.state || '';

    return {
      npi: p.npi,
      name: p.entity_type === 'Individual' ? `${p.first_name} ${p.last_name}` : p.organization_name || p.npi,
      entity_type: p.entity_type,
      credential: p.credential || '',
      specialties: tax.map(t => t.taxonomy_description).filter(Boolean),
      state: primaryState,
      city: ownLocs.find(l => l.is_primary)?.city || ownLocs[0]?.city || '',
      has_referrals: !!ref,
      total_referrals: ref?.total_referrals || 0,
      home_health_referrals: ref?.home_health_referrals || 0,
      hospice_referrals: ref?.hospice_referrals || 0,
      total_beneficiaries: util?.total_medicare_beneficiaries || 0,
      existing_location_ids: ownLocs.map(l => l.id),
    };
  });

  // Build candidate locations
  const uniqueLocations = [];
  const seenIds = new Set();
  locations.forEach(l => {
    if (!seenIds.has(l.id)) {
      seenIds.add(l.id);
      uniqueLocations.push({
        id: l.id, npi: l.npi, address: l.address_1 || '', city: l.city || '',
        state: l.state || '', zip: l.zip || '', type: l.location_type, is_primary: l.is_primary,
      });
    }
  });

  // Build feedback-aware prompt
  const feedbackSection = feedbackStats.total_past_decisions > 0
    ? `
IMPORTANT - LEARNING FROM PAST USER FEEDBACK:
You have ${feedbackStats.total_past_decisions} past user decisions to learn from.

FEEDBACK STATISTICS:
- ${feedbackStats.approved_count} matches approved, ${feedbackStats.rejected_count} rejected, ${feedbackStats.override_count} overridden
- Approved matches averaged: Specialization=${feedbackStats.avg_approved_specialization}, Proximity=${feedbackStats.avg_approved_proximity}, Referral=${feedbackStats.avg_approved_referral}
- Weight factors that correlate with approval more heavily in your scoring.

EXAMPLES OF APPROVED MATCHES (these patterns WORK - generate similar ones):
${JSON.stringify(approvedPatterns.slice(0, 10), null, 1)}

EXAMPLES OF REJECTED MATCHES (AVOID these patterns):
${JSON.stringify(rejectedPatterns.slice(0, 10), null, 1)}

USER OVERRIDE CORRECTIONS (pay close attention to the notes - these reveal what the user truly wants):
${JSON.stringify(overrideInsights.slice(0, 10), null, 1)}

Use these patterns to calibrate your matching. Prioritize the scoring dimensions that led to approvals. Avoid patterns seen in rejections.
`
    : '';

  const prompt = `You are an AI healthcare provider-location matching engine.

Given these providers and locations, suggest the best location matches for each provider.
Consider:
1. SPECIALIZATION: Match providers to locations where their specialty is most needed
2. PROXIMITY: Prefer locations in the same state/city as the provider's existing locations
3. REFERRAL PATTERNS: Providers with high home health/hospice referrals should match to relevant facility locations
${feedbackSection}
PROVIDERS:
${JSON.stringify(providerSummaries.slice(0, 20), null, 1)}

CANDIDATE LOCATIONS (sample):
${JSON.stringify(uniqueLocations.slice(0, 60), null, 1)}

For each provider, suggest up to 3 best location matches. Return JSON with this exact schema.`;

  const result = await base44.integrations.Core.InvokeLLM({
    prompt,
    response_json_schema: {
      type: "object",
      properties: {
        matches: {
          type: "array",
          items: {
            type: "object",
            properties: {
              npi: { type: "string" },
              provider_name: { type: "string" },
              location_id: { type: "string" },
              location_display: { type: "string" },
              confidence_score: { type: "number" },
              specialization_score: { type: "number" },
              proximity_score: { type: "number" },
              referral_score: { type: "number" },
              reasons: { type: "array", items: { type: "string" } }
            }
          }
        }
      }
    }
  });

  const newMatches = result.matches || [];
  const created = [];

  for (const match of newMatches) {
    if (!seenIds.has(match.location_id)) continue;

    const record = await base44.asServiceRole.entities.ProviderLocationMatch.create({
      npi: match.npi,
      location_id: match.location_id,
      confidence_score: Math.min(100, Math.max(0, match.confidence_score || 0)),
      specialization_score: match.specialization_score || 0,
      proximity_score: match.proximity_score || 0,
      referral_score: match.referral_score || 0,
      match_reasons: match.reasons || [],
      status: 'suggested',
      provider_name: match.provider_name || '',
      location_display: match.location_display || '',
    });
    created.push(record);
  }

  await base44.asServiceRole.entities.AuditEvent.create({
    event_type: 'user_action',
    user_email: user.email,
    details: {
      action: 'AI Provider-Location Matching (Feedback-Enhanced)',
      providers_analyzed: targetProviders.length,
      matches_created: created.length,
      feedback_used: feedbackStats.total_past_decisions,
    },
    timestamp: new Date().toISOString(),
  });

  return Response.json({
    success: true,
    providers_analyzed: targetProviders.length,
    matches_created: created.length,
    feedback_stats: feedbackStats,
  });
});