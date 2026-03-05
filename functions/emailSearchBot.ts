import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const MAX_EXEC_MS = 45000;

Deno.serve(async (req) => {
  const execStartTime = Date.now();
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

    const updateWithRetry = async (entityName, id, data, attempt = 1) => {
      try {
        return await base44.asServiceRole.entities[entityName].update(id, data);
      } catch (err) {
        if (err.message?.includes('Rate limit') && attempt <= 3) {
          await new Promise(r => setTimeout(r, attempt * 3000));
          return await updateWithRetry(entityName, id, data, attempt + 1);
        }
        throw err;
      }
    };

    for (const provider of providersToSearch) {
      if (Date.now() - execStartTime > MAX_EXEC_MS) {
        console.log(`[EmailBot] Execution time limit reached. Yielding to next invocation.`);
        break;
      }
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

        const prompt = `Find and validate professional email addresses for this healthcare provider/practice. Search public directories, practice websites, and healthcare databases.

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
2. Look for publicly listed email addresses on practice websites, healthcare directories (Healthgrades, Vitals, WebMD, Zocdoc, NPI databases, hospital staff pages).
3. If you find a website domain, try to infer email patterns (first.last@domain.com, flast@domain.com, etc.).
4. PRACTICE EMAILS ARE ACCEPTABLE: If you cannot find a direct email, it is perfectly fine to return practice-level or office-level emails. Do not return 0 results if a practice email exists.
5. Rate each email's find confidence: "high", "medium", "low".
6. VALIDATION STEP: For each email you find, validate it. Assign a quality score (0-100), a status ("valid", "risky", "invalid"), risk flags (e.g. "role-based"), and detailed reasons for the score. Include details about web presence of the email domain.
7. Return up to 5 emails, prioritizing valid and direct emails.`;

        const LLM_SCHEMA = {
          type: "object",
          properties: {
            emails: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  email: { type: "string" },
                  confidence: { type: "string", enum: ["high", "medium", "low"] },
                  source: { type: "string" },
                  validation_status: { type: "string", enum: ["valid", "risky", "invalid"] },
                  quality_score: { type: "number" },
                  quality_confidence: { type: "string", enum: ["high", "medium", "low"] },
                  quality_reasons: { type: "array", items: { type: "string" } },
                  quality_risk_flags: { type: "array", items: { type: "string" } }
                }
              }
            },
            practice_website: { type: "string" },
            notes: { type: "string" }
          }
        };

        const invokeWithRetry = async (attempt = 1) => {
          try {
            return await base44.asServiceRole.integrations.Core.InvokeLLM({
              prompt,
              add_context_from_internet: true,
              response_json_schema: LLM_SCHEMA
            });
          } catch (err) {
            if ((err.message?.includes('Rate limit') || err.response?.status === 429) && attempt <= 3) {
              console.warn(`[Retry] Rate limit hit for NPI ${provider.npi}. Waiting ${attempt * 5}s...`);
              await new Promise(r => setTimeout(r, attempt * 5000));
              return await invokeWithRetry(attempt + 1);
            }
            throw err;
          }
        };

        const res = await invokeWithRetry();

        const emails = (res?.emails || []).filter(e => e.email && e.email.includes('@'));
        
        // Map back to expected structure
        const validations = emails.map(e => ({
          email: e.email,
          status: e.validation_status || 'unknown',
          score: e.quality_score || 0,
          confidence: e.quality_confidence || e.confidence || 'low',
          reasons: e.quality_reasons || [],
          risk_flags: e.quality_risk_flags || [],
          reason: (e.quality_reasons || []).join('; ')
        }));

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

        await updateWithRetry('Provider', provider.id, providerUpdate);

        // Also update primary location
        if (newBest && primaryLoc && !primaryLoc.email) {
          await updateWithRetry('ProviderLocation', primaryLoc.id, {
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
          await updateWithRetry('Provider', provider.id, {
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

    if (currentTask) {
      const newProcessed = (currentTask.processed_items || 0) + searchedCount;
      const newSuccess = (currentTask.success_count || 0) + foundCount;
      const newError = (currentTask.error_count || 0) + (searchedCount - foundCount);
      const isDone = !hasMore || currentTask.status === 'cancelled';

      await base44.asServiceRole.entities.BackgroundTask.update(currentTask.id, {
        processed_items: newProcessed,
        success_count: newSuccess,
        error_count: newError,
        current_batch_number: (currentTask.current_batch_number || 0) + 1,
        status: isDone ? 'completed' : 'processing',
        completed_at: isDone ? new Date().toISOString() : undefined
      });

      if (!isDone) {
        // Self invoke for next batch
        setTimeout(() => {
          base44.asServiceRole.functions.invoke('emailSearchBot', {
            mode: 'process_background',
            task_id: currentTask.id
          }).catch(console.error);
        }, 2000);
      }
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