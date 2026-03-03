import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const payload = await req.json();
    const { mode = 'batch', npi = null, batch_size = 10, skip_already_searched = true, offset = 0 } = payload;

    let providersToSearch = [];

    if (mode === 'single' && npi) {
      providersToSearch = await base44.asServiceRole.entities.Provider.filter({ npi });
    } else {
      let query = {};
      if (skip_already_searched) {
        query = { 
          $or: [
            { email_searched_at: null },
            { email_searched_at: "" },
            { email_searched_at: { $exists: false } }
          ]
        };
      }
      
      const skip = skip_already_searched ? 0 : offset;
      providersToSearch = await base44.asServiceRole.entities.Provider.filter(query, '-created_date', batch_size, skip);
    }

    if (providersToSearch.length === 0) {
      return Response.json({ message: 'No providers to search', searched: 0, found: 0, results: [], has_more: false });
    }

    const npisToSearch = providersToSearch.map(p => p.npi);
    const allLocations = await base44.asServiceRole.entities.ProviderLocation.filter({ npi: { $in: npisToSearch } }, undefined, batch_size * 5);
    const allTaxonomies = await base44.asServiceRole.entities.ProviderTaxonomy.filter({ npi: { $in: npisToSearch } }, undefined, batch_size * 5);

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

        const existingEmails = [provider.email, ...(provider.additional_emails || []).map(e => e.email)].filter(Boolean);

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
- Existing Emails: ${existingEmails.length > 0 ? existingEmails.join(', ') : 'None known'}

INSTRUCTIONS:
1. Search for this provider's practice website or employer website.
2. Look for publicly listed email addresses on practice websites, healthcare directories (Healthgrades, Vitals, WebMD, Zocdoc, NPI databases, hospital/health system staff pages).
3. If you find a website domain, try to infer email patterns (first.last@domain.com, flast@domain.com, etc.).
4. Rate each email: "high" = found on a public page, "medium" = inferred from a verified domain, "low" = guessed.
5. Return up to 5 emails sorted by confidence. Include existing emails if you can verify them.
6. IMPORTANT: Only return plausible professional medical emails. No generic gmail/yahoo unless that's what's publicly listed.
7. PRACTICE EMAILS ARE ACCEPTABLE: If you cannot find a personal/direct email for the provider, it is perfectly fine to return practice-level or office-level emails. Always prefer a direct provider email, but never return zero results if a practice email exists.`;

        let res;
        try {
          res = await base44.asServiceRole.integrations.Core.InvokeLLM({
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
        } catch (llmErr) {
          if (llmErr.message?.includes('Rate limit') || llmErr.response?.status === 429) {
            console.warn(`[Retry] LLM Rate limit hit for NPI ${provider.npi}. Waiting 5 seconds...`);
            await new Promise(r => setTimeout(r, 5000));
            res = await base44.asServiceRole.integrations.Core.InvokeLLM({
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
          } else {
            throw llmErr;
          }
        }

        const emails = (res?.emails || []).filter(e => e.email && e.email.includes('@'));
        const bestEmail = emails[0] || null;

        // --- AI Email Validation Step ---
        let validationResult = null;
        if (emails.length > 0) {
          const emailList = emails.map(e => e.email).join(', ');
          validationResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
            prompt: `You are an email deliverability expert. Validate the following email addresses for a healthcare provider named "${name}" (NPI: ${provider.npi}).

EMAIL ADDRESSES TO VALIDATE:
${emails.map((e, i) => `${i+1}. ${e.email} (confidence: ${e.confidence}, source: ${e.source})`).join('\n')}

PROVIDER CONTEXT:
- Type: ${provider.entity_type}
- Organization: ${provider.organization_name || 'N/A'}
- Credential: ${provider.credential || 'N/A'}
- Location: ${locationInfo}

VALIDATION CRITERIA - For each email, check:
1. FORMAT: Is the email format valid? (proper syntax, no spaces, valid TLD)
2. DOMAIN: Is the domain a real, active organization? (hospital, clinic, health system, or known provider like gmail)
3. PATTERN: Does the email follow typical patterns for that domain? (first.last@, flast@, info@, etc.)
4. RELEVANCE: Does the email domain match the provider's known organization or practice?
5. DISPOSABLE: Is it a disposable/temporary email service?
6. ROLE-BASED: Is it a role-based address like info@, admin@, contact@ (less likely to reach the specific person)?
7. CATCH-ALL: Does the domain likely use a catch-all (accepts all emails but may not deliver)?

For each email, assign:
- "valid" = high likelihood of being deliverable and reaching the intended person
- "risky" = might work but has concerns (pattern mismatch, role-based, catch-all domain, generic provider)
- "invalid" = likely undeliverable (bad format, non-existent domain, clearly wrong person, disposable)

Return validation for ALL emails provided.`,
            response_json_schema: {
              type: "object",
              properties: {
                validations: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      email: { type: "string" },
                      status: { type: "string", enum: ["valid", "risky", "invalid"] },
                      reason: { type: "string" }
                    }
                  }
                }
              }
            }
          });
        }

        const validations = validationResult?.validations || [];
        const getValidation = (email) => validations.find(v => v.email === email) || { status: 'unknown', reason: '' };

        // Update Provider with best email + validation, preserving existing emails
        const providerUpdate = {
          email_searched_at: new Date().toISOString(),
        };

        let newBest = null;
        if (emails.length > 0) {
          const existingEmailsList = [];
          if (provider.email) {
            existingEmailsList.push({
              email: provider.email,
              confidence: provider.email_confidence || 'medium',
              source: provider.email_source || 'existing',
              validation_status: provider.email_validation_status || 'unknown',
              validation_reason: provider.email_validation_reason || ''
            });
          }
          if (provider.additional_emails && Array.isArray(provider.additional_emails)) {
            existingEmailsList.push(...provider.additional_emails);
          }
          
          const combined = [...existingEmailsList];
          for (const e of emails) {
            if (!combined.some(c => c.email.toLowerCase() === e.email.toLowerCase())) {
              const v = getValidation(e.email);
              combined.push({
                email: e.email,
                confidence: e.confidence,
                source: e.source || 'ai_search',
                validation_status: v.status || 'unknown',
                validation_reason: v.reason || ''
              });
            } else {
              // Update validation status if the newly verified one is better
              const existingIdx = combined.findIndex(c => c.email.toLowerCase() === e.email.toLowerCase());
              const v = getValidation(e.email);
              if (v.status === 'valid' || v.status === 'risky') {
                 combined[existingIdx].validation_status = v.status;
                 combined[existingIdx].validation_reason = v.reason || '';
              }
            }
          }
          
          // Rank: valid > risky > unknown > invalid. High > Medium > Low.
          const statusRank = { 'valid': 3, 'risky': 2, 'unknown': 1, 'invalid': 0 };
          const confRank = { 'high': 3, 'medium': 2, 'low': 1 };
          
          combined.sort((a, b) => {
             const statA = statusRank[a.validation_status] ?? 1;
             const statB = statusRank[b.validation_status] ?? 1;
             if (statA !== statB) return statB - statA;
             const confA = confRank[a.confidence] ?? 1;
             const confB = confRank[b.confidence] ?? 1;
             return confB - confA;
          });
          
          newBest = combined[0];
          
          providerUpdate.email = newBest.email;
          providerUpdate.email_confidence = newBest.confidence;
          providerUpdate.email_source = newBest.source;
          providerUpdate.email_validation_status = newBest.validation_status;
          providerUpdate.email_validation_reason = newBest.validation_reason;
          providerUpdate.additional_emails = combined.slice(1);
          foundCount++;
        }

        await base44.asServiceRole.entities.Provider.update(provider.id, providerUpdate);

        // Also update primary location
        if (newBest && primaryLoc && !primaryLoc.email) {
          await base44.asServiceRole.entities.ProviderLocation.update(primaryLoc.id, {
            email: newBest.email,
            email_confidence: newBest.confidence,
            email_source: newBest.source || '',
          });
        }

        searchedCount++;
        results.push({
          npi: provider.npi,
          name,
          emails_found: emails.length,
          best_email: bestEmail?.email || null,
          confidence: bestEmail?.confidence || null,
          validation_status: bestValidation?.status || null,
          validation_reason: bestValidation?.reason || null,
          all_validations: validations,
        });

        await new Promise(r => setTimeout(r, 500));

      } catch (err) {
        console.error(`Email search failed for NPI ${provider.npi}:`, err.message);
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

    await base44.asServiceRole.entities.AuditEvent.create({
      event_type: 'import',
      user_email: user.email,
      details: {
        action: 'Email Search Bot',
        entity: 'Provider',
        searched_count: searchedCount,
        found_count: foundCount,
        message: `Searched ${searchedCount} providers, found emails for ${foundCount} (with validation)`
      },
      timestamp: new Date().toISOString(),
    });

    // Check if there are more unsearched providers remaining
    let hasMore = false;
    if (mode !== 'single') {
      hasMore = providersToSearch.length >= batch_size;
    }

    return Response.json({
      success: true,
      searched: searchedCount,
      found: foundCount,
      results,
      has_more: hasMore,
    });

  } catch (error) {
    console.error('Email search bot error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});