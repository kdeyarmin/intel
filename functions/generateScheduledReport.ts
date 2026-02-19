import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Dataset entity mapping
const DATASET_ENTITY_MAP = {
  cms_utilization: 'CMSUtilization',
  cms_referrals: 'CMSReferral',
  ma_inpatient: 'MedicareMAInpatient',
  hha_stats: 'MedicareHHAStats',
  inpatient_drg: 'InpatientDRG',
  part_d_stats: 'MedicarePartDStats',
  snf_stats: 'MedicareSNFStats',
  providers: 'Provider',
  locations: 'ProviderLocation',
};

const DATASET_LABELS = {
  cms_utilization: 'CMS Provider Utilization',
  cms_referrals: 'CMS Referral Patterns',
  ma_inpatient: 'MA Inpatient Hospital',
  hha_stats: 'Home Health Agency Stats',
  inpatient_drg: 'Inpatient DRG',
  part_d_stats: 'Medicare Part D',
  snf_stats: 'Medicare SNF',
  providers: 'Providers',
  locations: 'Provider Locations',
};

function buildFilterQuery(filters) {
  const query = {};
  if (!filters) return query;
  if (filters.year) query.data_year = parseInt(filters.year);
  if (filters.state) query.state = filters.state;
  if (filters.hospital_type) query.hospital_type = filters.hospital_type;
  if (filters.table_name) query.table_name = filters.table_name;
  return query;
}

function aggregateData(rows, metrics, groupBy) {
  if (!groupBy || !metrics.length) return [];
  const groups = {};
  for (const row of rows) {
    const key = String(row[groupBy] || 'Unknown');
    if (!groups[key]) {
      groups[key] = { _group: key, _count: 0 };
      for (const m of metrics) groups[key][m] = 0;
    }
    groups[key]._count++;
    for (const m of metrics) {
      const val = parseFloat(row[m]);
      if (!isNaN(val)) groups[key][m] += val;
    }
  }
  return Object.values(groups).sort((a, b) => b._count - a._count);
}

function formatNumber(n) {
  if (n == null || isNaN(n)) return '0';
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return Number(n).toFixed(n % 1 === 0 ? 0 : 2);
}

function buildCSV(data, metrics, groupBy) {
  const headers = [groupBy, 'Count', ...metrics];
  const lines = [headers.join(',')];
  for (const row of data) {
    const vals = [
      `"${(row._group || '').replace(/"/g, '""')}"`,
      row._count,
      ...metrics.map(m => row[m] ?? 0),
    ];
    lines.push(vals.join(','));
  }
  return lines.join('\n');
}

function buildHTMLTable(data, metrics, groupBy) {
  let html = '<table style="border-collapse:collapse;width:100%;font-family:Arial,sans-serif;font-size:13px;">';
  html += '<thead><tr style="background:#f1f5f9;">';
  html += `<th style="border:1px solid #e2e8f0;padding:8px 12px;text-align:left;">${groupBy}</th>`;
  html += '<th style="border:1px solid #e2e8f0;padding:8px 12px;text-align:right;">Count</th>';
  for (const m of metrics) {
    html += `<th style="border:1px solid #e2e8f0;padding:8px 12px;text-align:right;">${m.replace(/_/g, ' ')}</th>`;
  }
  html += '</tr></thead><tbody>';
  for (const row of data.slice(0, 50)) {
    html += '<tr>';
    html += `<td style="border:1px solid #e2e8f0;padding:6px 12px;">${row._group || ''}</td>`;
    html += `<td style="border:1px solid #e2e8f0;padding:6px 12px;text-align:right;">${row._count}</td>`;
    for (const m of metrics) {
      html += `<td style="border:1px solid #e2e8f0;padding:6px 12px;text-align:right;">${formatNumber(row[m])}</td>`;
    }
    html += '</tr>';
  }
  html += '</tbody></table>';
  if (data.length > 50) html += `<p style="color:#64748b;font-size:12px;">Showing top 50 of ${data.length} groups</p>`;
  return html;
}

function buildEmailBody(report, data, metrics, summary) {
  const datasetLabel = DATASET_LABELS[report.dataset] || report.dataset;
  const now = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  let html = `
    <div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;">
      <div style="background:linear-gradient(135deg,#1e40af,#3b82f6);padding:24px 32px;border-radius:12px 12px 0 0;">
        <h1 style="color:white;margin:0;font-size:22px;">📊 ${report.name}</h1>
        <p style="color:#bfdbfe;margin:4px 0 0;font-size:13px;">${datasetLabel} • ${now}</p>
      </div>
      <div style="background:white;padding:24px 32px;border:1px solid #e2e8f0;border-top:none;">
  `;

  if (report.description) {
    html += `<p style="color:#475569;font-size:14px;margin-bottom:16px;">${report.description}</p>`;
  }

  // Summary stats
  html += `<div style="display:flex;gap:12px;margin-bottom:20px;">`;
  html += `<div style="background:#f0f9ff;padding:12px 16px;border-radius:8px;flex:1;text-align:center;">
    <div style="color:#0369a1;font-size:20px;font-weight:bold;">${data.length}</div>
    <div style="color:#64748b;font-size:11px;">Groups</div>
  </div>`;
  for (const m of metrics.slice(0, 3)) {
    const total = data.reduce((s, r) => s + (r[m] || 0), 0);
    html += `<div style="background:#f0fdf4;padding:12px 16px;border-radius:8px;flex:1;text-align:center;">
      <div style="color:#15803d;font-size:20px;font-weight:bold;">${formatNumber(total)}</div>
      <div style="color:#64748b;font-size:11px;">${m.replace(/_/g, ' ')}</div>
    </div>`;
  }
  html += `</div>`;

  if (summary) {
    html += `<div style="background:#fefce8;border-left:4px solid #f59e0b;padding:12px 16px;margin-bottom:20px;border-radius:0 8px 8px 0;">
      <strong style="color:#92400e;font-size:12px;">AI SUMMARY</strong>
      <p style="color:#78350f;font-size:13px;margin:4px 0 0;">${summary}</p>
    </div>`;
  }

  html += buildHTMLTable(data, metrics, report.group_by || 'category');
  html += `</div>
      <div style="background:#f8fafc;padding:16px 32px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:none;">
        <p style="color:#94a3b8;font-size:11px;margin:0;text-align:center;">
          Generated by CareMetric AI • ${report.frequency} scheduled report
        </p>
      </div>
    </div>`;
  return html;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await req.json();
    const { action = 'run_single', report_id, run_all_due } = payload;

    // --- RUN ALL DUE (called by scheduler) ---
    if (action === 'run_all_due') {
      if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

      const allReports = await base44.asServiceRole.entities.ScheduledReport.filter({ is_active: true });
      const now = new Date();
      const results = [];

      for (const report of allReports) {
        const shouldRun = checkIfDue(report, now);
        if (!shouldRun) continue;

        try {
          const result = await executeReport(base44, report);
          results.push({ id: report.id, name: report.name, status: 'success', ...result });
        } catch (err) {
          await base44.asServiceRole.entities.ScheduledReport.update(report.id, {
            last_run_at: now.toISOString(),
            last_run_status: 'failed',
            last_run_summary: err.message,
          });
          results.push({ id: report.id, name: report.name, status: 'failed', error: err.message });
        }
      }

      return Response.json({ success: true, reports_checked: allReports.length, reports_run: results.length, results });
    }

    // --- RUN SINGLE ---
    if (!report_id) return Response.json({ error: 'report_id required' }, { status: 400 });

    const report = await base44.asServiceRole.entities.ScheduledReport.filter({ id: report_id });
    if (!report.length) return Response.json({ error: 'Report not found' }, { status: 404 });

    const result = await executeReport(base44, report[0]);
    return Response.json({ success: true, ...result });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function checkIfDue(report, now) {
  if (!report.last_run_at) return true;
  const lastRun = new Date(report.last_run_at);
  const hoursSince = (now - lastRun) / (1000 * 60 * 60);

  if (report.frequency === 'daily') return hoursSince >= 20;
  if (report.frequency === 'weekly') return hoursSince >= 144;
  if (report.frequency === 'monthly') return hoursSince >= 648;
  return false;
}

async function executeReport(base44, report) {
  const entityName = DATASET_ENTITY_MAP[report.dataset];
  if (!entityName) throw new Error(`Unknown dataset: ${report.dataset}`);

  const filterQuery = buildFilterQuery(report.filters);
  const maxRows = report.max_rows || 500;

  let rawData;
  if (Object.keys(filterQuery).length > 0) {
    rawData = await base44.asServiceRole.entities[entityName].filter(filterQuery, '-created_date', maxRows);
  } else {
    rawData = await base44.asServiceRole.entities[entityName].list('-created_date', maxRows);
  }

  const metrics = report.metrics || [];
  const groupBy = report.group_by || 'category';
  const aggregated = aggregateData(rawData, metrics, groupBy);

  // Generate AI summary if enabled
  let summary = null;
  if (report.include_summary && aggregated.length > 0) {
    try {
      const topGroups = aggregated.slice(0, 10).map(r => `${r._group}: ${metrics.map(m => `${m}=${formatNumber(r[m])}`).join(', ')}`).join('\n');
      summary = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt: `Summarize this healthcare data report in 2-3 sentences. Report: "${report.name}" (${DATASET_LABELS[report.dataset]}). Data grouped by ${groupBy}:\n${topGroups}\nTotal records: ${rawData.length}. Focus on key trends and notable values.`,
      });
    } catch (e) {
      console.warn('AI summary failed:', e.message);
    }
  }

  // Build email
  const emailBody = buildEmailBody(report, aggregated, metrics, summary);

  // Send to all recipients
  const recipients = report.recipients || [];
  let sentCount = 0;
  for (const email of recipients) {
    try {
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: email,
        subject: `📊 ${report.name} — ${report.frequency} Report`,
        body: emailBody,
      });
      sentCount++;
    } catch (e) {
      console.error(`Failed to send to ${email}:`, e.message);
    }
  }

  // Update report status
  await base44.asServiceRole.entities.ScheduledReport.update(report.id, {
    last_run_at: new Date().toISOString(),
    last_run_status: 'success',
    last_run_summary: `Sent to ${sentCount}/${recipients.length} recipients. ${rawData.length} rows, ${aggregated.length} groups.`,
  });

  return {
    rows_fetched: rawData.length,
    groups: aggregated.length,
    emails_sent: sentCount,
    total_recipients: recipients.length,
  };
}