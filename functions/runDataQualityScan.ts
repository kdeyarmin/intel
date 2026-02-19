import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Data Quality Rules Engine
const QUALITY_RULES = [
  // Completeness rules
  { id: 'missing_name', name: 'Missing Provider Name', category: 'completeness', severity: 'high',
    check: (p) => !((p.first_name && p.last_name) || p.organization_name),
    field: 'first_name/last_name', entityType: 'Provider' },
  { id: 'missing_credential', name: 'Missing Credential', category: 'completeness', severity: 'medium',
    check: (p) => p.entity_type === 'Individual' && (!p.credential || p.credential.trim() === ''),
    field: 'credential', entityType: 'Provider' },
  { id: 'missing_gender', name: 'Missing Gender', category: 'completeness', severity: 'low',
    check: (p) => p.entity_type === 'Individual' && (!p.gender || p.gender === ''),
    field: 'gender', entityType: 'Provider' },
  { id: 'missing_enum_date', name: 'Missing Enumeration Date', category: 'completeness', severity: 'medium',
    check: (p) => !p.enumeration_date, field: 'enumeration_date', entityType: 'Provider' },
  { id: 'no_location', name: 'Provider Has No Location', category: 'completeness', severity: 'high',
    entityType: 'Provider', aggregate: true },
  { id: 'no_taxonomy', name: 'Provider Has No Taxonomy', category: 'completeness', severity: 'high',
    entityType: 'Provider', aggregate: true },

  // Accuracy rules
  { id: 'invalid_npi', name: 'Invalid NPI Format', category: 'accuracy', severity: 'critical',
    check: (p) => { const c = String(p.npi || '').replace(/\D/g, ''); return c.length !== 10; },
    field: 'npi', entityType: 'Provider' },
  { id: 'invalid_zip', name: 'Invalid ZIP Code Format', category: 'accuracy', severity: 'medium',
    check: (l) => l.zip && !/^\d{5}(-\d{4})?$/.test(l.zip.trim()),
    field: 'zip', entityType: 'ProviderLocation' },
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
  for (const rule of QUALITY_RULES) {
    if (rule.aggregate) continue;
    const records = rule.entityType === 'Provider' ? providers : locations;
    const failing = records.filter(r => rule.check(r));
    ruleResults.push({
      rule_id: rule.id, rule_name: rule.name, category: rule.category,
      total: records.length, passing: records.length - failing.length, failing: failing.length,
      pct: records.length > 0 ? Math.round(((records.length - failing.length) / records.length) * 100) : 100,
    });

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

  // Aggregate checks
  const noLocProviders = providers.filter(p => !locNPIs.has(p.npi));
  ruleResults.push({
    rule_id: 'no_location', rule_name: 'Provider Has No Location', category: 'completeness',
    total: providers.length, passing: providers.length - noLocProviders.length, failing: noLocProviders.length,
    pct: providers.length > 0 ? Math.round(((providers.length - noLocProviders.length) / providers.length) * 100) : 100,
  });
  if (noLocProviders.length > 0) {
    alertsToCreate.push({
      rule_id: 'no_location', rule_name: 'Provider Has No Location', category: 'completeness',
      severity: 'high', entity_type: 'Provider', status: 'open', scan_batch_id: scanBatchId,
      summary: `${noLocProviders.length} providers have no associated location record`,
      affected_count: noLocProviders.length,
    });
  }

  const noTaxProviders = providers.filter(p => !taxNPIs.has(p.npi));
  ruleResults.push({
    rule_id: 'no_taxonomy', rule_name: 'Provider Has No Taxonomy', category: 'completeness',
    total: providers.length, passing: providers.length - noTaxProviders.length, failing: noTaxProviders.length,
    pct: providers.length > 0 ? Math.round(((providers.length - noTaxProviders.length) / providers.length) * 100) : 100,
  });
  if (noTaxProviders.length > 0) {
    alertsToCreate.push({
      rule_id: 'no_taxonomy', rule_name: 'Provider Has No Taxonomy', category: 'completeness',
      severity: 'high', entity_type: 'Provider', status: 'open', scan_batch_id: scanBatchId,
      summary: `${noTaxProviders.length} providers have no associated taxonomy record`,
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
    summary: aiSummary,
    rule_results: ruleResults,
  });
});