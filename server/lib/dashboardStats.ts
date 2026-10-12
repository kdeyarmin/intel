// Dashboard headline numbers, shared by the getDashboardStats function and the
// assistant's get_dashboard_stats tool. Totals are pg_class estimates and the
// email/phone figures are extrapolated from small samples, so nothing here scans
// the big tables. Cached for 5 minutes.
import { pool } from "../db";

let dashboardStatsCache: { data: any; timestamp: number } | null = null;
const DASHBOARD_CACHE_TTL = 5 * 60 * 1000;
// Sample size for the dashboard's no-phone extrapolation. Used for both the
// LIMIT and the scale-up divisor so the two can never drift apart.
const PHONE_SAMPLE_SIZE = 2000;

export async function getDashboardStats(): Promise<any> {
  if (dashboardStatsCache && (Date.now() - dashboardStatsCache.timestamp < DASHBOARD_CACHE_TTL)) {
    return dashboardStatsCache.data;
  }
  const client = await pool.connect();
  try {
    await client.query("SET statement_timeout = '5s'");

    const fastCounts = await client.query(`
      SELECT
        (SELECT reltuples::bigint FROM pg_class WHERE relname = 'providers') AS providers,
        (SELECT reltuples::bigint FROM pg_class WHERE relname = 'provider_locations') AS locations,
        (SELECT reltuples::bigint FROM pg_class WHERE relname = 'cms_referrals') AS referrals,
        (SELECT reltuples::bigint FROM pg_class WHERE relname = 'provider_service_utilization') AS utilization,
        (SELECT reltuples::bigint FROM pg_class WHERE relname = 'provider_taxonomies') AS taxonomies,
        (SELECT reltuples::bigint FROM pg_class WHERE relname = 'medicare_facilities') AS facilities
    `);
    const est = fastCounts.rows[0] || {};
    // pg_class.reltuples is -1 for a never-ANALYZEd table (PG14+); clamp
    // to 0 so counts/scale factors never go negative.
    const totalProviders = Math.max(0, Number(est.providers) || 0);
    const totalLocations = Math.max(0, Number(est.locations) || 0);
    const totalReferrals = Math.max(0, Number(est.referrals) || 0);
    const totalUtilization = Math.max(0, Number(est.utilization) || 0);
    const totalTaxonomies = Math.max(0, Number(est.taxonomies) || 0);
    const totalFacilities = Math.max(0, Number(est.facilities) || 0);

    const safeQ = async (text: string) => {
      try { return (await client.query(text)).rows; }
      catch (e: any) { console.warn(`[getDashboardStats] query failed: ${e.message?.substring(0, 80)}`); return []; }
    };

    const emailSample = await safeQ(`
      SELECT count(*) AS total_sample,
        count(*) FILTER (WHERE email IS NOT NULL) AS with_email,
        count(*) FILTER (WHERE email IS NULL) AS without_email,
        count(*) FILTER (WHERE email_searched_at IS NOT NULL) AS searched,
        count(*) FILTER (WHERE email_validation_status = 'valid') AS valid_email,
        count(*) FILTER (WHERE email_validation_status = 'risky') AS risky_email,
        count(*) FILTER (WHERE email_validation_status = 'invalid') AS invalid_email,
        count(*) FILTER (WHERE (first_name IS NULL OR first_name = '') AND (organization_name IS NULL OR organization_name = '')) AS needs_enrichment,
        count(*) FILTER (WHERE status = 'Deactivated') AS deactivated
      FROM (SELECT email, email_searched_at, email_validation_status, first_name, organization_name, status
        FROM providers LIMIT 2000) s
    `);
    const topStatesRows = await safeQ(`
      SELECT state, count(*) AS count
      FROM (SELECT state FROM provider_locations WHERE state IS NOT NULL LIMIT 10000) s
      GROUP BY state ORDER BY count DESC LIMIT 5
    `);
    const importRows = await safeQ(`SELECT count(*) FILTER (WHERE status IN ('processing','validating','pending')) AS active,
      count(*) FILTER (WHERE status = 'completed') AS completed,
      count(*) FILTER (WHERE status = 'failed') AS failed FROM import_batches`);
    const alertRows = await safeQ(`SELECT count(*) AS count FROM data_quality_alerts WHERE status = 'new'`);
    // The scan that finished last: one still running (or one that failed) has no scores to show, and scans can
    // overlap, so the newest to start is not always the newest to finish (getDataHealthMetrics orders the same way).
    const scanRows = await safeQ(`SELECT results_summary FROM data_quality_scans WHERE status = 'completed' ORDER BY completed_at DESC NULLS LAST, created_date DESC LIMIT 1`);
    const batchRows = await safeQ(`SELECT created_date FROM import_batches WHERE status = 'completed' ORDER BY created_date DESC LIMIT 1`);
    const phoneSample = await safeQ(`
      SELECT count(*) AS count
      FROM (SELECT phone FROM provider_locations LIMIT ${PHONE_SAMPLE_SIZE}) s
      WHERE phone IS NULL OR phone = ''
    `);
    const utilYearRows = await safeQ(`
      SELECT data_year FROM provider_service_utilization ORDER BY id DESC LIMIT 1
    `);

    const ps = emailSample[0] || {};
    const sampleSize = Number(ps.total_sample || 1);
    const scaleFactor = sampleSize > 0 ? totalProviders / sampleSize : 1;
    const scaleUp = (v: any) => Math.round(Number(v || 0) * scaleFactor);
    const withEmail = scaleUp(ps.with_email);
    const withoutEmail = scaleUp(ps.without_email);

    const topStates = topStatesRows.map((r: any) => [r.state, Number(r.count)]);

    const icRow = importRows[0] || {};
    const lastRefresh = batchRows.length > 0 ? batchRows[0].created_date : null;

    // The scan's own overall score (runDataQualityScan stores { scores: { completeness, accuracy, timeliness,
    // consistency, overall }, ... }). There is no other honest number: the share of "records" without an alert is
    // ~100% whenever a few dozen rules fail over millions of rows, whatever the data looks like.
    const overall = (scanRows[0] as any)?.results_summary?.scores?.overall;
    const dataQuality = typeof overall === "number" && Number.isFinite(overall) ? { score: Math.round(overall) } : null;

    const phoneSampleCount = Number(phoneSample[0]?.count || 0);
    // Extrapolate the no-phone count from the sampled rows. The divisor
    // MUST match the sample LIMIT above — previously hardcoded to 5000
    // while the sample was 2000, under-estimating by 2.5x.
    const phoneScale = totalLocations / PHONE_SAMPLE_SIZE;
    const uyRow = utilYearRows[0] || {};

    const result = {
      totalProviders,
      totalLocations,
      totalReferrals,
      totalUtilization,
      totalTaxonomies,
      totalFacilities,
      emailStats: {
        withEmail,
        needsEnrichment: withoutEmail,
        searched: scaleUp(ps.searched),
        isEstimated: scaleFactor > 1.5,
        valid: scaleUp(ps.valid_email),
        risky: scaleUp(ps.risky_email),
        invalid: scaleUp(ps.invalid_email),
      },
      topStates,
      imports: {
        active: Number(icRow.active || 0),
        completed: Number(icRow.completed || 0),
        failed: Number(icRow.failed || 0),
      },
      openAlerts: Number(alertRows[0]?.count || 0),
      dataQuality,
      lastRefresh,
      proactiveInsights: {
        needsEnrichment: scaleUp(ps.needs_enrichment),
        deactivatedProviders: scaleUp(ps.deactivated),
        noPhoneLocations: Math.round(phoneSampleCount * phoneScale),
        latestUtilYear: Number(uyRow.data_year || 0),
      },
      samples: {
        providers: [],
        utilizations: [],
        referrals: [],
        locations: [],
      },
      isEstimatedCounts: scaleFactor > 1.5,
    };

    dashboardStatsCache = { data: result, timestamp: Date.now() };
    return result;
  } finally {
    try { await client.query("RESET statement_timeout"); } catch {}
    client.release();
  }
}
