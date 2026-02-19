import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { offset = 0, limit = 25, entity_type_filter = 'Individual', credential_filter = '' } = await req.json();

    // Build filter for providers
    const filter = {};
    if (entity_type_filter) filter.entity_type = entity_type_filter;

    // Get providers
    const providers = await base44.asServiceRole.entities.Provider.filter(filter, '-created_date', 500);

    // Apply credential filter client-side if provided
    let filtered = providers;
    if (credential_filter) {
      const creds = credential_filter.split(',').map(c => c.trim().toUpperCase());
      filtered = providers.filter(p => {
        const provCred = (p.credential || '').toUpperCase();
        return creds.some(c => provCred.includes(c));
      });
    }

    // Get total count before pagination
    const totalCount = filtered.length;

    // Apply pagination
    const page = filtered.slice(offset, offset + limit);

    if (page.length === 0) {
      return Response.json({ results: [], totalCount, processed: 0 });
    }

    // Get NPIs for this batch
    const npis = page.map(p => p.npi);

    // Fetch locations and taxonomies for all providers in batch
    const allLocations = [];
    const allTaxonomies = [];
    for (const npi of npis) {
      const locs = await base44.asServiceRole.entities.ProviderLocation.filter({ npi });
      const taxs = await base44.asServiceRole.entities.ProviderTaxonomy.filter({ npi });
      allLocations.push(...locs.map(l => ({ ...l, _npi: npi })));
      allTaxonomies.push(...taxs.map(t => ({ ...t, _npi: npi })));
    }

    // Build provider summaries for the LLM
    const providerSummaries = page.map(p => {
      const locs = allLocations.filter(l => l.npi === p.npi || l._npi === p.npi);
      const taxs = allTaxonomies.filter(t => t.npi === p.npi || t._npi === p.npi);
      const primaryLoc = locs.find(l => l.is_primary) || locs[0];
      const name = p.entity_type === 'Individual'
        ? `${p.first_name || ''} ${p.last_name || ''}`.trim()
        : p.organization_name || '';
      return {
        npi: p.npi,
        name,
        credential: p.credential || '',
        organization: p.organization_name || '',
        specialty: taxs.map(t => t.taxonomy_description).filter(Boolean).join(', '),
        city: primaryLoc?.city || '',
        state: primaryLoc?.state || '',
        phone: primaryLoc?.phone || ''
      };
    });

    // Call LLM in smaller sub-batches of 5 to avoid token limits
    const allResults = [];
    for (let i = 0; i < providerSummaries.length; i += 5) {
      const subBatch = providerSummaries.slice(i, i + 5);
      
      const prompt = `For each of these ${subBatch.length} healthcare providers, find the most likely professional email address by searching the web. For each provider, return the single best email you can find or infer, along with a confidence level.

PROVIDERS:
${subBatch.map((p, idx) => `${idx + 1}. NPI: ${p.npi} | Name: ${p.name} ${p.credential} | Org: ${p.organization} | Specialty: ${p.specialty} | Location: ${p.city}, ${p.state} | Phone: ${p.phone}`).join('\n')}

For each provider, search for their practice website, hospital affiliation, or organization and find/infer an email. Rate confidence: "high" if found publicly, "medium" if inferred from a known domain, "low" if guessed.

Return results for ALL ${subBatch.length} providers, even if you can only guess.`;

      const res = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt,
        add_context_from_internet: true,
        response_json_schema: {
          type: "object",
          properties: {
            providers: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  npi: { type: "string" },
                  email: { type: "string" },
                  confidence: { type: "string", enum: ["high", "medium", "low"] },
                  source: { type: "string" }
                }
              }
            }
          }
        }
      });

      if (res?.providers) {
        allResults.push(...res.providers);
      }
    }

    // Merge results with provider data
    const results = page.map(p => {
      const emailResult = allResults.find(r => r.npi === p.npi) || {};
      const locs = allLocations.filter(l => l.npi === p.npi || l._npi === p.npi);
      const taxs = allTaxonomies.filter(t => t.npi === p.npi || t._npi === p.npi);
      const primaryLoc = locs.find(l => l.is_primary) || locs[0];
      const name = p.entity_type === 'Individual'
        ? `${p.first_name || ''} ${p.last_name || ''}`.trim()
        : p.organization_name || '';

      return {
        npi: p.npi,
        name,
        credential: p.credential || '',
        organization: p.organization_name || '',
        specialty: taxs.map(t => t.taxonomy_description).filter(Boolean).join('; '),
        city: primaryLoc?.city || '',
        state: primaryLoc?.state || '',
        phone: primaryLoc?.phone || '',
        email: emailResult.email || '',
        email_confidence: emailResult.confidence || '',
        email_source: emailResult.source || ''
      };
    });

    return Response.json({ results, totalCount, processed: page.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});