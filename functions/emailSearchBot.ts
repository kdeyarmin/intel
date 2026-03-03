import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const payload = await req.json();
    let { mode = 'batch', npi = null, batch_size = 10, skip_already_searched = true, offset = 0 } = payload;

    if (mode === 'start_background') {
      const task = await base44.asServiceRole.entities.BackgroundTask.create({
        task_type: 'email_search',
        status: 'processing',
        total_items: payload.total_items || 0,
        processed_items: 0,
        success_count: 0,
        error_count: 0,
        current_batch_number: 0,
        started_at: new Date().toISOString(),
        params: { batch_size, skip_already_searched }
      });

      base44.asServiceRole.functions.invoke('emailSearchBot', {
        mode: 'process_background',
        task_id: task.id
      }).catch(console.error);

      return Response.json({ success: true, task_id: task.id });
    }

    if (mode === 'stop_background') {
      if (payload.task_id) {
         await base44.asServiceRole.entities.BackgroundTask.update(payload.task_id, { status: 'cancelled' });
      }
      return Response.json({ success: true });
    }

    let currentTask = null;
    if (mode === 'process_background') {
      if (!payload.task_id) return Response.json({ error: 'No task_id' }, { status: 400 });
      currentTask = await base44.asServiceRole.entities.BackgroundTask.get(payload.task_id);
      if (!currentTask || currentTask.status !== 'processing') {
        return Response.json({ message: 'Task not processing or not found' });
      }
      batch_size = currentTask.params.batch_size || 10;
      skip_already_searched = currentTask.params.skip_already_searched ?? true;
    }

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
          
          const doValidation = async () => base44.asServiceRole.integrations.Core.InvokeLLM({
            prompt: `You are an advanced email deliverability expert AI. Validate the following email addresses for a healthcare provider named "${name}" (NPI: ${provider.npi}).

EMAIL ADDRESSES TO VALIDATE:
${emails.map((e, i) => `${i+1}. ${e.email} (confidence: ${e.confidence}, source: ${e.source})`).join('\n')}

PROVIDER CONTEXT:
- Type: ${provider.entity_type}
- Organization: ${provider.organization_name || 'N/A'}
- Credential: ${provider.credential || 'N/A'}
- Location: ${locationInfo}

VALIDATION CRITERIA & SCORING:
1. Analyze FORMAT, DOMAIN validity, PATTERN matching, RELEVANCE to provider.
2. Check for DISPOSABLE, ROLE-BASED, or CATCH-ALL characteristics.
3. Assign a quality score from 0-100 based on likelihood of reaching the provider directly.
4. Determine risk flags (e.g., 'role-based', 'generic-domain', 'pattern-mismatch').
5. Provide detailed reasons for the score.

For each email, assign:
- "valid" (score > 75)
- "risky" (score 40-75)
- "invalid" (score < 40)

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
                      score: { type: "number" },
                      confidence: { type: "string", enum: ["high", "medium", "low"] },
                      reasons: { type: "array", items: { type: "string" } },
                      risk_flags: { type: "array", items: { type: "string" } }
                    }
                  }
                }
              }
            }
          });

          try {
            validationResult = await doValidation();
          } catch (valErr) {
            if (valErr.message?.includes('Rate limit') || valErr.response?.status === 429) {
              console.warn(`[Retry] LLM Validation Rate limit hit for NPI ${provider.npi}. Waiting 5s...`);
              await new Promise(r => setTimeout(r, 5000));
              validationResult = await doValidation();
            } else {
              throw valErr;
            }
          }
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
                validation_reason: v.reasons ? v.reasons.join('; ') : v.reason || '',
                quality_score: v.score,
                quality_confidence: v.confidence,
                quality_reasons: v.reasons,
                quality_risk_flags: v.risk_flags
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
          if (newBest.quality_score !== undefined) providerUpdate.email_quality_score = newBest.quality_score;
          if (newBest.quality_confidence) providerUpdate.email_quality_confidence = newBest.quality_confidence;
          if (newBest.quality_reasons) providerUpdate.email_quality_reasons = newBest.quality_reasons;
          if (newBest.quality_risk_flags) providerUpdate.email_quality_risk_flags = newBest.quality_risk_flags;
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
          best_email: newBest?.email || null,
          confidence: newBest?.confidence || null,
          validation_status: newBest?.validation_status || null,
          validation_reason: newBest?.validation_reason || null,
          all_validations: validations,
        });

        await new Promise(r => setTimeout(r, 500));

      } catch (err) {
        console.error(`Email search failed for NPI ${provider.npi}:`, err.message);
        try {
          await base44.asServiceRole.entities.Provider.update(provider.id, {
            email_searched_at: new Date().toISOString(),
          });
        } catch (updateErr) {
          console.error(`Failed to update provider status for ${provider.npi}:`, updateErr.message);
        }
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