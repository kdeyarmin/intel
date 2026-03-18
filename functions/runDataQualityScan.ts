import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Data Quality Rules Engine
const QUALITY_RULES = [
  // Completeness rules
  { id: 'missing_name', name: 'Missing Provider Name', category: 'completeness', severity: 'high',
    check: (p) => !((p.first_name && p.last_name) || p.organization_name),
    field: 'first_name/last_name', entityType: 'Provider' },
  { id: 'missing_credential', name: 'Missing Credential', category: 'completeness', severity: 'medium',
    check: (p) => p.entity_type === 'Individual' && (!p.credential || p.credential.trim() === ''),
    field: 'credential', entityType: 'Provider', autoDelete: true },
  { id: 'missing_enum_date', name: 'Missing Enumeration Date', category: 'completeness', severity: 'medium',
    check: (p) => !p.enumeration_date, field: 'enumeration_date', entityType: 'Provider' },
  { id: 'no_location', name: 'Provider Has No Location', category: 'completeness', severity: 'high',
    entityType: 'Provider', aggregate: true, autoDelete: true },
  { id: 'no_taxonomy', name: 'Provider Has No Taxonomy', category: 'completeness', severity: 'high',
    entityType: 'Provider', aggregate: true, autoDelete: true },

  // Accuracy rules
  { id: 'invalid_npi', name: 'Invalid NPI Format', category: 'accuracy', severity: 'critical',
    check: (p) => { const c = String(p.npi || '').replace(/\D/g, ''); return c.length !== 10; },
    field: 'npi', entityType: 'Provider' },
  // Invalid ZIP codes are ignored per policy
  { id: 'invalid_state', name: 'Invalid State Code', category: 'accuracy', severity: 'high',
    check: (l) => {
      const VALID = new Set(['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
        'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
        'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC','PR','VI','GU','AS','MP']);
      return l.state && !VALID.has(l.state.toUpperCase());
    },
    field: 'state', entityType: 'ProviderLocation' },
  { id: 'missing_address', name: 'Location Missing Address', category: 'completeness', severity: 'medium',
    check: (l) => !l.address_1 || l.address_1.trim() === '',
    field: 'address_1', entityType: 'ProviderLocation' },
  { id: 'missing_city', name: 'Location Missing City', category: 'completeness', severity: 'medium',
    check: (l) => !l.city || l.city.trim() === '',
    field: 'city', entityType: 'ProviderLocation' },

  // Consistency rules
  { id: 'org_with_gender', name: 'Organization With Gender Set', category: 'consistency', severity: 'low',
    check: (p) => p.entity_type === 'Organization' && p.gender && p.gender !== '',
    field: 'gender', entityType: 'Provider' },
  { id: 'deactivated_with_location', name: 'Deactivated Provider With Active Location', category: 'consistency', severity: 'medium',
    entityType: 'Provider', aggregate: true },

  // Enhanced Rules (Duplicates & Formatting)
  { id: 'invalid_phone', name: 'Invalid Phone Format', category: 'accuracy', severity: 'medium',
    check: (l) => l.phone && !/^(\+?1[-.]?)?\(?([0-9]{3})\)?[-. ]?([0-9]{3})[-. ]?([0-9]{4})$/.test(l.phone),
    field: 'phone', entityType: 'ProviderLocation' },
    
  { id: 'missing_email', name: 'Missing Email Address', category: 'completeness', severity: 'medium',
    check: (p) => !p.email, field: 'email', entityType: 'Provider' },

  { id: 'duplicate_provider', name: 'Potential Duplicate Provider', category: 'duplicate', severity: 'high',
    entityType: 'Provider', aggregate: true },
];

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();

  if (user?.role !== 'admin') {
    return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
  }

  const payload = await req.json().catch(() => ({}));
  const { action = 'run_scan', scan_id, alert_id, suggested_value } = payload;

  // ---- APPLY FIX ----
  if (action === 'apply_fix') {
    if (!alert_id) return Response.json({ error: 'alert_id required' }, { status: 400 });
    const alert = await base44.asServiceRole.entities.DataQualityAlert.filter({ id: alert_id });
    if (!alert || alert.length === 0) return Response.json({ error: 'Alert not found' }, { status: 404 });
    const a = alert[0];
    if (!a.suggested_value && !suggested_value) return Response.json({ error: 'No suggested value' }, { status: 400 });

    const fixValue = suggested_value || a.suggested_value;

    // Apply the fix to the entity
    if (a.entity_id && a.entity_type && a.field_name) {
      const entityMap = {
        'Provider': base44.asServiceRole.entities.Provider,
        'ProviderLocation': base44.asServiceRole.entities.ProviderLocation,
        'ProviderTaxonomy': base44.asServiceRole.entities.ProviderTaxonomy,
      };
      const entity = entityMap[a.entity_type];
      if (entity) {
        await entity.update(a.entity_id, { [a.field_name]: fixValue });
      }
    }
    await base44.asServiceRole.entities.DataQualityAlert.update(a.id, {
      status: 'accepted',
      resolved_at: new Date().toISOString(),
      resolved_by: user.email,
    });
    return Response.json({ success: true });
  }

  // ---- DISMISS ----
  if (action === 'dismiss') {
    if (!alert_id) return Response.json({ error: 'alert_id required' }, { status: 400 });
    await base44.asServiceRole.entities.DataQualityAlert.update(alert_id, {
      status: 'rejected',
      resolved_at: new Date().toISOString(),
      resolved_by: user.email,
    });
    return Response.json({ success: true });
  }

  // ---- AUTO-FIX ELIGIBLE ALERTS ----
  if (action === 'auto_fix_eligible') {
    const openAlerts = await base44.asServiceRole.entities.DataQualityAlert.filter(
      { status: 'open' }, '-created_date', 500
    );

    const eligible = openAlerts.filter(a =>
      (a.severity === 'low' || a.severity === 'medium') &&
      a.suggested_value &&
      a.entity_id &&
      a.field_name &&
      a.entity_type
    );

    if (eligible.length === 0) {
      return Response.json({
        success: true,
        fixed: 0,
        skipped: 0,
        message: 'No eligible alerts for auto-fix.',
      });
    }

    const fixSummaries = eligible.slice(0, 30).map((a, i) =>
      `${i + 1}. Entity: ${a.entity_type}, NPI: ${a.npi || 'N/A'}, Field: ${a.field_name}, Current: "${a.current_value || '(empty)'}", Suggested: "${a.suggested_value}", Rule: ${a.rule_name}, Severity: ${a.severity}`
    ).join('\n');

    let confidenceResults = [];
    try {
      const aiRes = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt: `You are a healthcare data quality expert. Review these proposed auto-fixes for provider data. For each fix, assess whether it is safe to apply automatically WITHOUT human review.

PROPOSED FIXES:
${fixSummaries}

For each fix, return:
- index (1-based)
- safe_to_auto_fix (boolean): true ONLY if the fix is obviously correct and low-risk
- confidence (0-100): how confident you are the fix is correct
- reason: brief explanation

Be conservative - only approve fixes that are clearly correct.`,
        response_json_schema: {
          type: "object",
          properties: {
            assessments: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  index: { type: "number" },
                  safe_to_auto_fix: { type: "boolean" },
                  confidence: { type: "number" },
                  reason: { type: "string" },
                }
              }
            }
          }
        }
      });
      confidenceResults = aiRes?.assessments || [];
    } catch (e) {
      return Response.json({ success: false, error: 'AI confidence check failed', detail: e.message });
    }

    const entityMap = {
      'Provider': base44.asServiceRole.entities.Provider,
      'ProviderLocation': base44.asServiceRole.entities.ProviderLocation,
      'ProviderTaxonomy': base44.asServiceRole.entities.ProviderTaxonomy,
    };

    let fixed = 0;
    let skipped = 0;
    const fixLog = [];

    for (const assessment of confidenceResults) {
      const idx = assessment.index - 1;
      if (idx < 0 || idx >= eligible.length) continue;
      const alert = eligible[idx];

      if (assessment.safe_to_auto_fix && assessment.confidence >= 80) {
        const entity = entityMap[alert.entity_type];
        if (entity) {
          try {
            await entity.update(alert.entity_id, { [alert.field_name]: alert.suggested_value });
            await base44.asServiceRole.entities.DataQualityAlert.update(alert.id, {
              status: 'auto_fixed',
              resolved_at: new Date().toISOString(),
              resolved_by: 'AI Auto-Fix',
            });
            fixed++;
            fixLog.push({ npi: alert.npi, field: alert.field_name, old: alert.current_value, new: alert.suggested_value, confidence: assessment.confidence });
          } catch (e) {
            skipped++;
            fixLog.push({ npi: alert.npi, field: alert.field_name, error: e.message });
          }
        } else {
          skipped++;
        }
      } else {
        skipped++;
        fixLog.push({ npi: alert.npi, field: alert.field_name, reason: assessment.reason, confidence: assessment.confidence, skipped: true });
      }
    }

    return Response.json({
      success: true,
      fixed,
      skipped,
      total_eligible: eligible.length,
      assessed: confidenceResults.length,
      fix_log: fixLog,
      message: `Auto-fixed ${fixed} alerts, skipped ${skipped} (low confidence or unsafe).`,
    });
  }

  // ---- ANALYZE RECURRING PATTERNS ----
  if (action === 'analyze_patterns') {
    const alerts = await base44.asServiceRole.entities.DataQualityAlert.list('-created_date', 500);

    const ruleGroups = {};
    for (const a of alerts) {
      if (!ruleGroups[a.rule_id]) ruleGroups[a.rule_id] = { rule_name: a.rule_name, category: a.category, severity: a.severity, count: 0, open: 0, fixed: 0, dismissed: 0, entity_type: a.entity_type, field: a.field_name };
      ruleGroups[a.rule_id].count++;
      if (a.status === 'open') ruleGroups[a.rule_id].open++;
      if (a.status === 'accepted' || a.status === 'auto_fixed') ruleGroups[a.rule_id].fixed++;
      if (a.status === 'rejected') ruleGroups[a.rule_id].dismissed++;
    }

    const patternSummary = Object.entries(ruleGroups)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 15)
      .map(([id, g]) => `Rule: ${g.rule_name} | Category: ${g.category} | Severity: ${g.severity} | Total: ${g.count} (Open:${g.open}, Fixed:${g.fixed}, Dismissed:${g.dismissed}) | Entity: ${g.entity_type || 'N/A'} | Field: ${g.field || 'N/A'}`)
      .join('\n');

    const scans = await base44.asServiceRole.entities.DataQualityScan.list('-created_date', 10);
    const scanTrend = scans.map(s => `${s.created_date}: Overall=${s.scores?.overall || 'N/A'}%, Alerts=${s.alerts_generated || 0}`).join('\n');

    const aiRes = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: `You are a healthcare data quality analyst. Perform a root-cause analysis of recurring data quality issues.

ALERT PATTERNS (grouped by rule, sorted by frequency):
${patternSummary}

SCAN HISTORY (most recent first):
${scanTrend}

TOTAL ALERTS: ${alerts.length} (Open: ${alerts.filter(a => a.status === 'open').length}, Fixed: ${alerts.filter(a => a.status === 'accepted' || a.status === 'auto_fixed').length})

Provide:
1. Top 5 recurring patterns with root cause analysis
2. Systemic issues from upstream data pipelines
3. Trend analysis — improving or degrading?
4. Prioritized action plan for maximum impact
5. Predictions of issues likely to worsen`,
      response_json_schema: {
        type: "object",
        properties: {
          recurring_patterns: {
            type: "array",
            items: {
              type: "object",
              properties: {
                rule_name: { type: "string" },
                occurrence_count: { type: "number" },
                root_cause: { type: "string" },
                upstream_source: { type: "string" },
                fix_strategy: { type: "string" },
              }
            }
          },
          systemic_issues: {
            type: "array",
            items: {
              type: "object",
              properties: {
                issue: { type: "string" },
                affected_rules: { type: "array", items: { type: "string" } },
                root_cause: { type: "string" },
                recommendation: { type: "string" },
              }
            }
          },
          trend_analysis: { type: "string" },
          action_plan: {
            type: "array",
            items: {
              type: "object",
              properties: {
                priority: { type: "number" },
                action: { type: "string" },
                impact: { type: "string" },
                effort: { type: "string", enum: ["low", "medium", "high"] },
              }
            }
          },
          predictions: { type: "array", items: { type: "string" } },
          summary: { type: "string" },
        }
      }
    });

    return Response.json({ success: true, analysis: aiRes });
  }

  // ---- ASSISTANT QUERY ----
  if (action === 'assistant_query') {
    const { question } = payload;
    if (!question) return Response.json({ error: 'question required' }, { status: 400 });

    const [alerts, scans, providers, locations, taxonomies] = await Promise.all([
      base44.asServiceRole.entities.DataQualityAlert.list('-created_date', 200),
      base44.asServiceRole.entities.DataQualityScan.list('-created_date', 5),
      base44.asServiceRole.entities.Provider.list('-created_date', 50),
      base44.asServiceRole.entities.ProviderLocation.list('-created_date', 50),
      base44.asServiceRole.entities.ProviderTaxonomy.list('-created_date', 50),
    ]);

    const openAlerts = alerts.filter(a => a.status === 'open');
    const autoFixable = openAlerts.filter(a => (a.severity === 'low' || a.severity === 'medium') && a.suggested_value && a.entity_id);
    const latestScan = scans[0];

    const catCounts = {};
    openAlerts.forEach(a => { catCounts[a.category] = (catCounts[a.category] || 0) + 1; });
    const sevCounts = {};
    openAlerts.forEach(a => { sevCounts[a.severity] = (sevCounts[a.severity] || 0) + 1; });

    const context = `DATA QUALITY CONTEXT:
- Total alerts: ${alerts.length} (Open: ${openAlerts.length})
- Auto-fixable (low/medium + suggested value): ${autoFixable.length}
- By category: ${Object.entries(catCounts).map(([k, v]) => `${k}:${v}`).join(', ') || 'none'}
- By severity: ${Object.entries(sevCounts).map(([k, v]) => `${k}:${v}`).join(', ') || 'none'}
- Latest scan: ${latestScan ? `Overall ${latestScan.scores?.overall || 'N/A'}%, ${latestScan.alerts_generated || 0} alerts` : 'No scans yet'}
- Database: ${providers.length} providers, ${locations.length} locations, ${taxonomies.length} taxonomies
- Top open issues: ${openAlerts.slice(0, 5).map(a => a.summary).join('; ') || 'none'}`;

    const aiRes = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: `You are CareMetric's AI Data Quality Assistant. You help healthcare data administrators understand and fix data quality issues.

${context}

USER QUESTION: ${question}

Respond helpfully. Reference specific alert counts, categories, and scan scores. Be concise and actionable.`,
      response_json_schema: {
        type: "object",
        properties: {
          answer: { type: "string" },
          suggested_actions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                action: { type: "string" },
                description: { type: "string" },
                auto_executable: { type: "boolean" },
              }
            }
          },
          related_stats: {
            type: "object",
            properties: {
              open_alerts: { type: "number" },
              auto_fixable: { type: "number" },
              overall_score: { type: "number" },
            }
          },
        }
      }
    });

    return Response.json({ success: true, response: aiRes });
  }

  // ---- RUN SCAN ----
  const scan = await base44.asServiceRole.entities.DataQualityScan.create({
    status: 'running',
    started_at: new Date().toISOString(),
  });

  const scanBatchId = scan.id;

  // Fetch data
  const [providers, locations, taxonomies, batches] = await Promise.all([
    base44.asServiceRole.entities.Provider.list('-created_date', 200),
    base44.asServiceRole.entities.ProviderLocation.list('-created_date', 200),
    base44.asServiceRole.entities.ProviderTaxonomy.list('-created_date', 200),
    base44.asServiceRole.entities.ImportBatch.filter({ status: 'completed' }, '-created_date', 100),
  ]);

  const locNPIs = new Set(locations.map(l => l.npi));
  const taxNPIs = new Set(taxonomies.map(t => t.npi));
  const deactivatedNPIs = new Set(providers.filter(p => p.status === 'Deactivated').map(p => p.npi));

  const ruleResults = [];
  const alertsToCreate = [];

  // Run individual record checks
  let autoDeletedCount = 0;
  const entityDeleter = {
    'Provider': base44.asServiceRole.entities.Provider,
    'ProviderLocation': base44.asServiceRole.entities.ProviderLocation,
    'ProviderTaxonomy': base44.asServiceRole.entities.ProviderTaxonomy,
  };

  for (const rule of QUALITY_RULES) {
    if (rule.aggregate) continue;
    const records = rule.entityType === 'Provider' ? providers : locations;
    const failing = records.filter(r => rule.check(r));
    ruleResults.push({
      rule_id: rule.id, rule_name: rule.name, category: rule.category,
      total: records.length, passing: records.length - failing.length, failing: failing.length,
      pct: records.length > 0 ? Math.round(((records.length - failing.length) / records.length) * 100) : 100,
    });

    // Auto-delete records for rules flagged with autoDelete
    if (rule.autoDelete && failing.length > 0) {
      const entity = entityDeleter[rule.entityType];
      if (entity) {
        for (const rec of failing) {
          try {
            await entity.delete(rec.id);
            autoDeletedCount++;
          } catch (e) { console.warn(`[DQ] Auto-delete failed for ${rec.id}: ${e.message}`); }
        }
      }
      alertsToCreate.push({
        rule_id: rule.id, rule_name: rule.name, category: rule.category,
        severity: rule.severity, entity_type: rule.entityType,
        field_name: rule.field, status: 'auto_fixed', scan_batch_id: scanBatchId,
        summary: `Auto-deleted ${failing.length} ${rule.entityType} records: ${rule.name}`,
        affected_count: failing.length,
      });
      continue; // Skip creating open alerts for auto-deleted records
    }

    if (failing.length > 0) {
      // Create aggregate alert
      alertsToCreate.push({
        rule_id: rule.id, rule_name: rule.name, category: rule.category,
        severity: rule.severity, entity_type: rule.entityType,
        field_name: rule.field, status: 'open', scan_batch_id: scanBatchId,
        summary: `${failing.length} ${rule.entityType} records failing: ${rule.name}`,
        affected_count: failing.length,
      });

      // Create up to 5 individual alerts with AI suggestions for fixable issues
      const samples = failing.slice(0, 5);
      for (const rec of samples) {
        alertsToCreate.push({
          rule_id: rule.id, rule_name: rule.name, category: rule.category,
          severity: rule.severity, entity_type: rule.entityType,
          entity_id: rec.id, npi: rec.npi || '',
          field_name: rule.field,
          current_value: String(rec[rule.field] ?? '(empty)'),
          status: 'open', scan_batch_id: scanBatchId,
          summary: `${rule.name}: ${rule.entityType} ${rec.npi || rec.id}`,
          affected_count: 1,
        });
      }
    }
  }

  // Aggregate checks — auto-delete providers with no location
  const noLocProviders = providers.filter(p => !locNPIs.has(p.npi));
  ruleResults.push({
    rule_id: 'no_location', rule_name: 'Provider Has No Location', category: 'completeness',
    total: providers.length, passing: providers.length - noLocProviders.length, failing: noLocProviders.length,
    pct: providers.length > 0 ? Math.round(((providers.length - noLocProviders.length) / providers.length) * 100) : 100,
  });
  if (noLocProviders.length > 0) {
    for (const p of noLocProviders) {
      try { await base44.asServiceRole.entities.Provider.delete(p.id); autoDeletedCount++; } catch (e) { console.warn(`[DQ] Auto-delete no-loc provider ${p.npi}: ${e.message}`); }
    }
    alertsToCreate.push({
      rule_id: 'no_location', rule_name: 'Provider Has No Location', category: 'completeness',
      severity: 'high', entity_type: 'Provider', status: 'auto_fixed', scan_batch_id: scanBatchId,
      summary: `Auto-deleted ${noLocProviders.length} providers with no associated location record`,
      affected_count: noLocProviders.length,
    });
  }

  // Auto-delete providers with no taxonomy
  const noTaxProviders = providers.filter(p => !taxNPIs.has(p.npi));
  ruleResults.push({
    rule_id: 'no_taxonomy', rule_name: 'Provider Has No Taxonomy', category: 'completeness',
    total: providers.length, passing: providers.length - noTaxProviders.length, failing: noTaxProviders.length,
    pct: providers.length > 0 ? Math.round(((providers.length - noTaxProviders.length) / providers.length) * 100) : 100,
  });
  if (noTaxProviders.length > 0) {
    for (const p of noTaxProviders) {
      try { await base44.asServiceRole.entities.Provider.delete(p.id); autoDeletedCount++; } catch (e) { console.warn(`[DQ] Auto-delete no-tax provider ${p.npi}: ${e.message}`); }
    }
    alertsToCreate.push({
      rule_id: 'no_taxonomy', rule_name: 'Provider Has No Taxonomy', category: 'completeness',
      severity: 'high', entity_type: 'Provider', status: 'auto_fixed', scan_batch_id: scanBatchId,
      summary: `Auto-deleted ${noTaxProviders.length} providers with no associated taxonomy record`,
      affected_count: noTaxProviders.length,
    });
  }

  // Deactivated with locations
  const deactivatedWithLoc = providers.filter(p => p.status === 'Deactivated' && locNPIs.has(p.npi));
  ruleResults.push({
    rule_id: 'deactivated_with_location', rule_name: 'Deactivated Provider With Active Location',
    category: 'consistency',
    total: providers.filter(p => p.status === 'Deactivated').length || 1,
    passing: (providers.filter(p => p.status === 'Deactivated').length || 0) - deactivatedWithLoc.length,
    failing: deactivatedWithLoc.length,
    pct: 100,
  });

  // Duplicate Check & Auto-Merge
  // High confidence: Same NPI (exact duplicate)
  // Medium confidence: Same first+last name + same credential
  const npiMap = {};
  let autoMergedCount = 0;

  for (const p of providers) {
    if (!npiMap[p.npi]) npiMap[p.npi] = [];
    npiMap[p.npi].push(p);
  }

  // Auto-merge exact NPI duplicates (high confidence) — keep the most recently updated
  for (const npi in npiMap) {
    const group = npiMap[npi];
    if (group.length <= 1) continue;
    // Sort: keep newest (by updated_date or created_date)
    group.sort((a, b) => new Date(b.updated_date || b.created_date) - new Date(a.updated_date || a.created_date));
    const keep = group[0];
    for (let i = 1; i < group.length; i++) {
      try {
        // Merge any populated fields from duplicate into keeper before deleting
        const dupeFields = {};
        for (const field of ['email', 'cell_phone', 'website', 'linkedin_url', 'credential']) {
          if (!keep[field] && group[i][field]) dupeFields[field] = group[i][field];
        }
        if (Object.keys(dupeFields).length > 0) {
          await base44.asServiceRole.entities.Provider.update(keep.id, dupeFields);
        }
        await base44.asServiceRole.entities.Provider.delete(group[i].id);
        autoMergedCount++;
      } catch (e) { console.warn(`[DQ] Auto-merge NPI ${npi}: ${e.message}`); }
    }
  }

  // Medium confidence: same name + credential for Individuals
  const nameCredMap = {};
  // Re-fetch surviving providers after NPI merge
  const survivingProviders = providers.filter(p => {
    const group = npiMap[p.npi];
    return group && group[0]?.id === p.id;
  });

  for (const p of survivingProviders) {
    if (p.entity_type !== 'Individual' || !p.last_name || !p.first_name) continue;
    const key = `${p.last_name.toLowerCase().trim()}_${p.first_name.toLowerCase().trim()}_${(p.credential || '').toLowerCase().trim()}`;
    if (!nameCredMap[key]) nameCredMap[key] = [];
    nameCredMap[key].push(p);
  }

  for (const key in nameCredMap) {
    const group = nameCredMap[key];
    if (group.length <= 1) continue;
    // Medium confidence — auto-merge: keep newest
    group.sort((a, b) => new Date(b.updated_date || b.created_date) - new Date(a.updated_date || a.created_date));
    const keep = group[0];
    for (let i = 1; i < group.length; i++) {
      try {
        const dupeFields = {};
        for (const field of ['email', 'cell_phone', 'website', 'linkedin_url']) {
          if (!keep[field] && group[i][field]) dupeFields[field] = group[i][field];
        }
        if (Object.keys(dupeFields).length > 0) {
          await base44.asServiceRole.entities.Provider.update(keep.id, dupeFields);
        }
        await base44.asServiceRole.entities.Provider.delete(group[i].id);
        autoMergedCount++;
      } catch (e) { console.warn(`[DQ] Auto-merge name+cred ${key}: ${e.message}`); }
    }
  }

  ruleResults.push({
    rule_id: 'duplicate_provider', rule_name: 'Potential Duplicate Provider', category: 'duplicate',
    total: providers.length, passing: providers.length - autoMergedCount, failing: autoMergedCount,
    pct: providers.length > 0 ? Math.round(((providers.length - autoMergedCount) / providers.length) * 100) : 100
  });

  if (autoMergedCount > 0) {
    alertsToCreate.push({
      rule_id: 'duplicate_provider', rule_name: 'Potential Duplicate Provider', category: 'duplicate',
      severity: 'high', entity_type: 'Provider', status: 'auto_fixed', scan_batch_id: scanBatchId,
      summary: `Auto-merged ${autoMergedCount} duplicate providers (same NPI or same name+credential)`,
      affected_count: autoMergedCount,
      ai_root_cause: `Merged ${autoMergedCount} records: kept newest, transferred missing contact fields.`
    });
  }

  // Timeliness check
  const completedBatches = batches.filter(b => b.completed_at);
  const daysSinceLatest = completedBatches.length > 0
    ? Math.min(...completedBatches.map(b => Math.floor((Date.now() - new Date(b.completed_at).getTime()) / 86400000)))
    : 999;
  const timeliness = daysSinceLatest <= 1 ? 100 : daysSinceLatest <= 7 ? 85 : daysSinceLatest <= 14 ? 65 : daysSinceLatest <= 30 ? 40 : 10;

  if (daysSinceLatest > 14) {
    alertsToCreate.push({
      rule_id: 'stale_data', rule_name: 'Stale Data Warning', category: 'timeliness',
      severity: daysSinceLatest > 30 ? 'critical' : 'high', entity_type: 'ImportBatch',
      status: 'open', scan_batch_id: scanBatchId,
      summary: `Most recent data import was ${daysSinceLatest} days ago — data may be outdated`,
      affected_count: 1,
    });
  }

  // Calculate scores
  const completenessRules = ruleResults.filter(r => r.category === 'completeness');
  const accuracyRules = ruleResults.filter(r => r.category === 'accuracy');
  const consistencyRules = ruleResults.filter(r => r.category === 'consistency');

  const avg = (arr) => arr.length > 0 ? Math.round(arr.reduce((s, r) => s + r.pct, 0) / arr.length) : 100;

  const scores = {
    completeness: avg(completenessRules),
    accuracy: avg(accuracyRules),
    timeliness,
    consistency: avg(consistencyRules),
    overall: Math.round((avg(completenessRules) + avg(accuracyRules) + timeliness + avg(consistencyRules)) / 4),
  };

  // Generate AI suggestions for sample alerts
  let aiSuggestionsCount = 0;
  const alertsNeedingSuggestions = alertsToCreate.filter(a => a.entity_id && a.current_value && a.category === 'accuracy');

  if (alertsNeedingSuggestions.length > 0) {
    const prompt = `You are a healthcare data quality analyst. For each record below, suggest a corrected value and explain why.
    
Records:
${alertsNeedingSuggestions.map((a, i) => `${i + 1}. Entity: ${a.entity_type}, NPI: ${a.npi}, Field: ${a.field_name}, Current Value: "${a.current_value}", Rule Failed: ${a.rule_name}`).join('\n')}

Return a JSON object with suggestions array, each with index, suggested_value, and reason.`;

    try {
      const aiResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: {
          type: 'object',
          properties: {
            suggestions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  index: { type: 'number' },
                  suggested_value: { type: 'string' },
                  reason: { type: 'string' },
                },
              },
            },
          },
        },
      });

      if (aiResult?.suggestions) {
        for (const suggestion of aiResult.suggestions) {
          const idx = suggestion.index - 1;
          if (idx >= 0 && idx < alertsNeedingSuggestions.length) {
            alertsNeedingSuggestions[idx].suggested_value = suggestion.suggested_value;
            alertsNeedingSuggestions[idx].suggestion_reason = suggestion.reason;
            aiSuggestionsCount++;
          }
        }
      }
    } catch (e) {
      console.error('[DQ Scan] AI suggestion failed:', e.message);
    }
  }

  // Batch-create alerts (max 25 at a time)
  for (let i = 0; i < alertsToCreate.length; i += 25) {
    const chunk = alertsToCreate.slice(i, i + 25);
    await base44.asServiceRole.entities.DataQualityAlert.bulkCreate(chunk);
  }

  // Generate AI summary
  let aiSummary = '';
  try {
    const summaryResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: `Summarize this data quality scan in 2-3 sentences for a healthcare data admin.
Scores: Completeness ${scores.completeness}%, Accuracy ${scores.accuracy}%, Timeliness ${scores.timeliness}%, Consistency ${scores.consistency}%, Overall ${scores.overall}%.
Records scanned: ${providers.length} providers, ${locations.length} locations, ${taxonomies.length} taxonomies.
Alerts generated: ${alertsToCreate.length}.
Key issues: ${ruleResults.filter(r => r.pct < 80).map(r => `${r.rule_name} (${r.pct}%)`).join(', ') || 'None critical'}.`,
    });
    aiSummary = summaryResult || '';
  } catch (e) {
    aiSummary = `Scan complete. Overall score: ${scores.overall}%. ${alertsToCreate.length} alerts generated.`;
  }

  // Update scan record
  await base44.asServiceRole.entities.DataQualityScan.update(scan.id, {
    status: 'completed',
    completed_at: new Date().toISOString(),
    total_records_scanned: providers.length + locations.length + taxonomies.length,
    alerts_generated: alertsToCreate.length,
    ai_suggestions_generated: aiSuggestionsCount,
    scores,
    summary: aiSummary,
    rule_results: ruleResults,
  });

  return Response.json({
    success: true,
    scan_id: scan.id,
    scores,
    alerts_generated: alertsToCreate.length,
    ai_suggestions: aiSuggestionsCount,
    auto_deleted: autoDeletedCount,
    auto_merged: autoMergedCount,
    summary: aiSummary,
    rule_results: ruleResults,
  });
});
