import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const payload = await req.json();
    const { mode = 'batch', npi = null, batch_size = 10, skip_already_searched = true } = payload;

    let providersToSearch = [];

    if (mode === 'single' && npi) {
      providersToSearch = await base44.asServiceRole.entities.Provider.filter({ npi });
    } else {
      // Batch mode: get providers without emails
      const allProviders = await base44.asServiceRole.entities.Provider.list('-created_date', 500);
      providersToSearch = allProviders.filter(p => {
        if (skip_already_searched && p.email_searched_at) return false;
        if (p.email) return false;
        return true;
      }).slice(0, batch_size);
    }

    if (providersToSearch.length === 0) {
      return Response.json({ message: 'No providers to search', searched: 0 });
    }

    // Get all locations and taxonomies upfront for efficiency
    const allLocations = await base44.asServiceRole.entities.ProviderLocation.list('-created_date', 500);
    const allTaxonomies = await base44.asServiceRole.entities.ProviderTaxonomy.list('-created_date', 500);

    let searchedCount = 0;
    let foundCount = 0;
    const results = [];

    for (const provider of providersToSearch) {
      try {
        const providerLocs = allLocations.filter(l => l.npi === provider.npi);
        const primaryLoc = providerLocs.find(l => l.is_primary) || providerLocs[0];
        const providerTaxs = allTaxonomies.filter(t => t.npi === provider.npi);
        const primaryTax = providerTaxs.find(t => t.primary_flag) || providerTaxs[0];

        const name = provider.entity_type === 'Individual'
          ? `${provider.first_name || ''} ${provider.last_name || ''}`.trim()
          : provider.organization_name || '';

        const locationInfo = primaryLoc
          ? `${primaryLoc.address_1 || ''}, ${primaryLoc.city || ''}, ${primaryLoc.state || ''} ${primaryLoc.zip || ''}`.trim()
          : 'N/A';

        const prompt = `Find professional email addresses for this healthcare provider/practice. Search public directories, practice websites, and healthcare databases.

PROVIDER:
- Name: ${name}
- NPI: ${provider.npi}
- Type: ${provider.entity_type}
- Credential: ${provider.credential || 'N/A'}
- Organization: ${provider.organization_name || 'N/A'}
- Specialty: ${primaryTax?.taxonomy_description || 'N/A'}
- Address: ${locationInfo}
- Phone: ${primaryLoc?.phone || 'N/A'}

INSTRUCTIONS:
1. Search for this provider's practice website or employer website.
2. Look for publicly listed email addresses on practice websites, healthcare directories (Healthgrades, Vitals, WebMD, Zocdoc, NPI databases, hospital/health system staff pages).
3. If you find a website domain, try to infer email patterns (first.last@domain.com, flast@domain.com, etc.).
4. Rate each email: "high" = found on a public page, "medium" = inferred from a verified domain, "low" = guessed.
5. Return up to 5 emails sorted by confidence.
6. IMPORTANT: Only return plausible professional medical emails. No generic gmail/yahoo unless that's what's publicly listed.`;

        const res = await base44.asServiceRole.integrations.Core.InvokeLLM({
          prompt,
          add_context_from_internet: true,
          response_json_schema: {
            type: "object",
            properties: {
              emails: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    email: { type: "string" },
                    confidence: { type: "string", enum: ["high", "medium", "low"] },
                    source: { type: "string" }
                  }
                }
              },
              practice_website: { type: "string" },
              notes: { type: "string" }
            }
          }
        });

        const emails = (res.emails || []).filter(e => e.email && e.email.includes('@'));
        const bestEmail = emails[0] || null;

        // Update Provider with best email
        const providerUpdate = {
          email_searched_at: new Date().toISOString(),
        };

        if (bestEmail) {
          providerUpdate.email = bestEmail.email;
          providerUpdate.email_confidence = bestEmail.confidence;
          providerUpdate.email_source = bestEmail.source || '';
          providerUpdate.additional_emails = emails.slice(1);
          foundCount++;
        }

        await base44.asServiceRole.entities.Provider.update(provider.id, providerUpdate);

        // Also update primary location with the best email if it exists
        if (bestEmail && primaryLoc && !primaryLoc.email) {
          await base44.asServiceRole.entities.ProviderLocation.update(primaryLoc.id, {
            email: bestEmail.email,
            email_confidence: bestEmail.confidence,
            email_source: bestEmail.source || '',
          });
        }

        searchedCount++;
        results.push({
          npi: provider.npi,
          name,
          emails_found: emails.length,
          best_email: bestEmail?.email || null,
          confidence: bestEmail?.confidence || null,
        });

        // Delay to avoid rate limits
        await new Promise(r => setTimeout(r, 500));

      } catch (err) {
        console.error(`Email search failed for NPI ${provider.npi}:`, err.message);
        // Mark as searched even on failure so we don't retry immediately
        await base44.asServiceRole.entities.Provider.update(provider.id, {
          email_searched_at: new Date().toISOString(),
        });
        searchedCount++;
        results.push({
          npi: provider.npi,
          name: provider.first_name || provider.organization_name || provider.npi,
          emails_found: 0,
          best_email: null,
          error: err.message,
        });
      }
    }

    // Log audit event
    await base44.asServiceRole.entities.AuditEvent.create({
      event_type: 'import',
      user_email: user.email,
      details: {
        action: 'Email Search Bot',
        entity: 'Provider',
        searched_count: searchedCount,
        found_count: foundCount,
        message: `Searched ${searchedCount} providers, found emails for ${foundCount}`
      },
      timestamp: new Date().toISOString(),
    });

    return Response.json({
      success: true,
      searched: searchedCount,
      found: foundCount,
      results,
    });

  } catch (error) {
    console.error('Email search bot error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});