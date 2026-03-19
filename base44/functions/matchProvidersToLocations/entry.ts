import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Fuzzy name matching utilities
function normalizeString(str) {
  if (!str) return '';
  return str.toLowerCase()
    .replace(/\b(dr|md|do|np|pa|phd|dds|dpm|od|pharmd|rn|pt|ot|st|rph|crnp|aprn)\b/gi, '')
    .replace(/[.,\-()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshteinDistance(a, b) {
  const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= b.length; j++) matrix[j][0] = j;
  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j - 1][i] + 1,
        matrix[j][i - 1] + 1,
        matrix[j - 1][i - 1] + cost
      );
    }
  }
  return matrix[b.length][a.length];
}

function nameSimilarity(name1, name2) {
  const norm1 = normalizeString(name1);
  const norm2 = normalizeString(name2);
  if (!norm1 || !norm2) return 0;
  if (norm1 === norm2) return 100;
  
  const maxLen = Math.max(norm1.length, norm2.length);
  const distance = levenshteinDistance(norm1, norm2);
  const similarity = ((maxLen - distance) / maxLen) * 100;
  
  // Token-based matching boost
  const tokens1 = norm1.split(' ').filter(t => t.length > 1);
  const tokens2 = norm2.split(' ').filter(t => t.length > 1);
  const commonTokens = tokens1.filter(t => tokens2.includes(t)).length;
  const tokenBoost = (commonTokens / Math.max(tokens1.length, tokens2.length)) * 30;
  
  return Math.min(100, similarity + tokenBoost);
}

function addressSimilarity(addr1, addr2, city1, city2, state1, state2, zip1, zip2) {
  let score = 0;
  
  // State match is critical (30 points)
  if (state1 && state2 && state1.toUpperCase() === state2.toUpperCase()) {
    score += 30;
  }
  
  // ZIP match (25 points for full, 15 for partial)
  const z1 = (zip1 || '').substring(0, 5);
  const z2 = (zip2 || '').substring(0, 5);
  if (z1 && z2) {
    if (z1 === z2) score += 25;
    else if (z1.substring(0, 3) === z2.substring(0, 3)) score += 15;
  }
  
  // City match (20 points)
  if (city1 && city2 && normalizeString(city1) === normalizeString(city2)) {
    score += 20;
  }
  
  // Address similarity (25 points)
  if (addr1 && addr2) {
    const addrSim = nameSimilarity(addr1, addr2);
    score += (addrSim / 100) * 25;
  }
  
  return Math.min(100, score);
}

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

  // FUZZY MATCHING: Pre-compute similarity scores for AI context
  const fuzzyHints = [];
  for (const prov of providerSummaries.slice(0, 20)) {
    const provName = prov.name;
    const provLocs = locByNPI[prov.npi] || [];
    const provState = provLocs.find(l => l.is_primary)?.state || provLocs[0]?.state;
    const provCity = provLocs.find(l => l.is_primary)?.city || provLocs[0]?.city;
    const provAddr = provLocs.find(l => l.is_primary)?.address_1 || provLocs[0]?.address_1;
    const provZip = provLocs.find(l => l.is_primary)?.zip || provLocs[0]?.zip;
    
    const candidatesForProv = uniqueLocations
      .filter(loc => loc.npi !== prov.npi) // Don't match to self
      .map(loc => {
        const locProvider = providers.find(p => p.npi === loc.npi);
        const locName = locProvider?.entity_type === 'Individual' 
          ? `${locProvider.first_name} ${locProvider.last_name}`
          : locProvider?.organization_name || '';
        
        const nameSim = nameSimilarity(provName, locName);
        const addrSim = addressSimilarity(provAddr, loc.address, provCity, loc.city, provState, loc.state, provZip, loc.zip);
        const overallSim = (nameSim * 0.6) + (addrSim * 0.4);
        
        return { location_id: loc.id, name_similarity: Math.round(nameSim), address_similarity: Math.round(addrSim), overall_similarity: Math.round(overallSim) };
      })
      .filter(c => c.overall_similarity > 30)
      .sort((a, b) => b.overall_similarity - a.overall_similarity)
      .slice(0, 5);
    
    if (candidatesForProv.length > 0) {
      fuzzyHints.push({ npi: prov.npi, fuzzy_matches: candidatesForProv });
    }
  }

  const prompt = `You are an advanced AI healthcare provider-location matching engine with fuzzy name and address matching capabilities.

MATCHING ALGORITHM - Use ALL these signals:
1. NAME SIMILARITY: Use the pre-computed fuzzy name matching scores (Levenshtein distance + token overlap)
2. ADDRESS SIMILARITY: Use the pre-computed address/city/state/ZIP matching scores
3. SPECIALIZATION: Match providers to locations where their specialty is most needed
4. PROXIMITY: Prefer locations in the same geographic area (state/city/ZIP)
5. REFERRAL PATTERNS: Providers with high home health/hospice referrals should match to relevant facility locations
6. NPI: If a provider appears in multiple datasets with different locations, these may be the same entity

FUZZY MATCHING PRE-COMPUTED SCORES (USE THESE HEAVILY - they represent sophisticated string similarity):
${JSON.stringify(fuzzyHints, null, 1)}

${feedbackSection}
PROVIDERS:
${JSON.stringify(providerSummaries.slice(0, 20), null, 1)}

CANDIDATE LOCATIONS (sample):
${JSON.stringify(uniqueLocations.slice(0, 60), null, 1)}

INSTRUCTIONS:
- For each provider, suggest up to 3 best location matches
- PRIORITIZE matches with high fuzzy_matches overall_similarity scores (>60 is strong, >80 is very strong)
- If fuzzy matching shows a strong name+address match, weight that heavily in your confidence score
- Consider that the same provider may appear in NPPES vs CMS datasets with slight variations (e.g., "John Smith MD" vs "Smith John")
- Return JSON with this exact schema`;

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
              name_match_score: { type: "number" },
              address_match_score: { type: "number" },
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
      name_match_score: match.name_match_score || 0,
      address_match_score: match.address_match_score || 0,
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