import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Data Quality Auto-Fix Engine
 * 
 * Actions:
 * - auto_fix_eligible: Find and auto-fix low-severity, high-confidence alerts
 * - analyze_patterns: AI root-cause analysis of recurring DQ issues
 * - assistant_query: Conversational AI assistant for DQ questions
 */

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();

  if (user?.role !== 'admin') {
    return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
  }

  const payload = await req.json().catch(() => ({}));
  const { action = 'auto_fix_eligible' } = payload;

  // ---- AUTO-FIX ELIGIBLE ALERTS ----
  if (action === 'auto_fix_eligible') {
    const openAlerts = await base44.asServiceRole.entities.DataQualityAlert.filter(
      { status: 'open' }, '-created_date', 500
    );

    // Eligible = low or medium severity + has suggested_value + has entity_id + has field_name
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

    // Ask AI for confidence assessment on each fix
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

Be conservative - only approve fixes that are clearly correct (e.g., formatting corrections, obvious missing values that can be inferred).`,
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
      console.error('AI confidence check failed:', e.message);
      return Response.json({ success: false, error: 'AI confidence check failed', detail: e.message });
    }

    // Apply only safe, high-confidence fixes
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

    // Group by rule_id
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

    // Get scan history for trend analysis
    const scans = await base44.asServiceRole.entities.DataQualityScan.list('-created_date', 10);
    const scanTrend = scans.map(s => `${s.created_date}: Overall=${s.scores?.overall || 'N/A'}%, Alerts=${s.alerts_generated || 0}`).join('\n');

    const aiRes = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: `You are a healthcare data quality analyst. Perform a root-cause analysis of recurring data quality issues based on alert patterns and scan history.

ALERT PATTERNS (grouped by rule, sorted by frequency):
${patternSummary}

SCAN HISTORY (most recent first):
${scanTrend}

TOTAL ALERTS: ${alerts.length} (Open: ${alerts.filter(a => a.status === 'open').length}, Fixed: ${alerts.filter(a => a.status === 'accepted' || a.status === 'auto_fixed').length})

Provide:
1. Top 5 recurring patterns with root cause analysis (why do they keep happening?)
2. Systemic issues — are there upstream data pipeline problems causing multiple rule failures?
3. Trend analysis — is data quality improving or degrading over time?
4. Prioritized action plan: what should the admin fix FIRST for maximum impact?
5. Prediction: which issues are likely to worsen if not addressed?`,
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

    // Gather context
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

    // Group open alerts by category
    const catCounts = {};
    openAlerts.forEach(a => { catCounts[a.category] = (catCounts[a.category] || 0) + 1; });

    // Group by severity
    const sevCounts = {};
    openAlerts.forEach(a => { sevCounts[a.severity] = (sevCounts[a.severity] || 0) + 1; });

    const context = `
DATA QUALITY CONTEXT:
- Total alerts: ${alerts.length} (Open: ${openAlerts.length})
- Auto-fixable (low/medium + suggested value): ${autoFixable.length}
- By category: ${Object.entries(catCounts).map(([k,v]) => `${k}:${v}`).join(', ')}
- By severity: ${Object.entries(sevCounts).map(([k,v]) => `${k}:${v}`).join(', ')}
- Latest scan: ${latestScan ? `Overall ${latestScan.scores?.overall || 'N/A'}%, ${latestScan.alerts_generated || 0} alerts, ${latestScan.completed_at || 'running'}` : 'No scans yet'}
- Database: ${providers.length} providers, ${locations.length} locations, ${taxonomies.length} taxonomies
- Top open issues: ${openAlerts.slice(0, 5).map(a => a.summary).join('; ')}
`;

    const aiRes = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: `You are CareMetric's AI Data Quality Assistant. You help healthcare data administrators understand and fix data quality issues.

${context}

USER QUESTION: ${question}

Respond helpfully. If the user asks to fix something, explain what CAN be auto-fixed vs what needs manual review. Reference specific alert counts, categories, and scan scores. Be concise and actionable. If suggesting an action, reference the specific UI buttons/tabs they should use.`,
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

  return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
});