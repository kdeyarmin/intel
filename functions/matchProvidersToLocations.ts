import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { npi_list } = body; // optional: subset of NPIs to match

  // Fetch all required data
  const [providers, locations, taxonomies, referrals, utilizations] = await Promise.all([
    base44.entities.Provider.filter({}),
    base44.entities.ProviderLocation.filter({}),
    base44.entities.ProviderTaxonomy.filter({}),
    base44.entities.CMSReferral.filter({}),
    base44.entities.CMSUtilization.filter({}),
  ]);

  // Filter providers if npi_list given
  const targetProviders = npi_list?.length
    ? providers.filter(p => npi_list.includes(p.npi))
    : providers.slice(0, 50); // limit batch size

  // Index data by NPI for fast lookup
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

  // Build location index by state for proximity grouping
  const locByState = {};
  locations.forEach(l => {
    if (l.state) {
      if (!locByState[l.state]) locByState[l.state] = [];
      locByState[l.state].push(l);
    }
  });

  // Build provider summaries for LLM
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

  // Build candidate locations (unique locations, grouped by state)
  const uniqueLocations = [];
  const seenIds = new Set();
  locations.forEach(l => {
    if (!seenIds.has(l.id)) {
      seenIds.add(l.id);
      uniqueLocations.push({
        id: l.id,
        npi: l.npi,
        address: l.address_1 || '',
        city: l.city || '',
        state: l.state || '',
        zip: l.zip || '',
        type: l.location_type,
        is_primary: l.is_primary,
      });
    }
  });

  // Use LLM to generate match suggestions
  const prompt = `You are an AI healthcare provider-location matching engine.

Given these providers and locations, suggest the best location matches for each provider.
Consider:
1. SPECIALIZATION: Match providers to locations where their specialty is most needed
2. PROXIMITY: Prefer locations in the same state/city as the provider's existing locations
3. REFERRAL PATTERNS: Providers with high home health/hospice referrals should match to relevant facility locations

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

  // Save matches to entity
  const matches = result.matches || [];
  const created = [];

  for (const match of matches) {
    // Skip if location_id doesn't exist in our data
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

  // Log audit
  await base44.asServiceRole.entities.AuditEvent.create({
    event_type: 'user_action',
    user_email: user.email,
    details: {
      action: 'AI Provider-Location Matching',
      providers_analyzed: targetProviders.length,
      matches_created: created.length,
    },
    timestamp: new Date().toISOString(),
  });

  return Response.json({
    success: true,
    providers_analyzed: targetProviders.length,
    matches_created: created.length,
  });
});