// getCMSAnalytics: Medicare utilization, referral and facility summaries,
// read from the background rollups (server/lib/rollups) so the page never
// aggregates the big tables itself. Each section says when it was computed.
import { rollupStatus } from "../lib/rollups/runner";
import { ALL_SERVICE_TYPES } from "../lib/rollups/core";

// Facility "datasets" that are aggregate files rather than facilities.
export const AGGREGATE_DATASETS = [
  "market_saturation_county",
  "market_saturation_cbsa",
  "medicare_fee_for_service_enrollment",
  "medicare_monthly_enrollment",
  "nppes_registry",
  "provider_taxonomy_crosswalk",
];

const CACHE_MS = 2 * 60 * 1000;
// Keyed by the rollups' state, so a refresh that finishes (on any instance)
// is served at once instead of after the cache expires.
let cache: { at: number; version: string; body: any } | null = null;

async function rollupVersion(pool: any): Promise<string> {
  const { rows } = await pool.query(
    "SELECT coalesce(string_agg(job || ':' || status || ':' || coalesce(last_success_at::text, ''), ',' ORDER BY job), '') AS v FROM rollup_runs",
  ).catch(() => ({ rows: [] as any[] }));
  return String(rows[0]?.v ?? "");
}

export function clearCmsAnalyticsCache() {
  cache = null;
}

function personName(p: any): string | null {
  if (!p) return null;
  if (p.organization_name) return p.organization_name;
  const n = [p.first_name, p.last_name].filter(Boolean).join(" ");
  return n ? `${n}${p.credential ? `, ${p.credential}` : ""}` : null;
}

export async function handleGetCMSAnalytics(pool: any) {
  const version = await rollupVersion(pool);
  if (cache && cache.version === version && Date.now() - cache.at < CACHE_MS) return cache.body;
  const q = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows;

  const [jobs, estimates, [{ year: serviceYear } = { year: null }], [{ year: referralYear } = { year: null }], facilityRows] = await Promise.all([
    rollupStatus(pool),
    q(`SELECT relname, reltuples::bigint AS est FROM pg_class
        WHERE relname IN ('provider_service_utilization','cms_referrals','medicare_facilities')`),
    q("SELECT max(data_year) AS year FROM rollup_cms_service_types"),
    q("SELECT max(data_year) AS year FROM rollup_cms_top_referred"),
    q("SELECT facility_type, record_count, state_count, latest_year FROM rollup_facility_types ORDER BY record_count DESC"),
  ]);

  const [services, [summary = {}], referred] = await Promise.all([
    serviceYear ? q(`SELECT service_type, provider_count, total_services, total_payments, total_beneficiaries
                       FROM rollup_cms_service_types WHERE data_year = $1 AND service_type <> $2
                      ORDER BY total_payments DESC LIMIT 20`, [serviceYear, ALL_SERVICE_TYPES]) : [],
    // Distinct providers come from the year's all-types row: summing the
    // per-type counts would count a provider once per service type.
    serviceYear ? q(`SELECT count(*) FILTER (WHERE service_type <> $2)::int AS types,
                            max(provider_count) FILTER (WHERE service_type = $2)::bigint AS providers,
                            sum(total_payments) FILTER (WHERE service_type <> $2) AS payments,
                            sum(total_services) FILTER (WHERE service_type <> $2) AS services
                       FROM rollup_cms_service_types WHERE data_year = $1`, [serviceYear, ALL_SERVICE_TYPES]) : [{}],
    referralYear ? q(`SELECT referred_to_npi, total_referrals, referring_providers FROM rollup_cms_top_referred
                        WHERE data_year = $1 ORDER BY total_referrals DESC LIMIT 15`, [referralYear]) : [],
  ]);
  const names = referred.length
    ? new Map((await q("SELECT npi, first_name, last_name, organization_name, credential FROM providers WHERE npi = ANY($1)",
      [referred.map((r: any) => r.referred_to_npi)])).map((p: any) => [p.npi, personName(p)]))
    : new Map();

  const est: Record<string, number> = {};
  for (const r of estimates) est[r.relname] = Math.max(0, Number(r.est) || 0);
  const job = (name: string) => {
    const j = jobs.find((x: any) => x.job === name) as any;
    return { status: j?.status ?? "never_run", refreshed_at: j?.last_success_at ?? null, error: j?.status === "failed" ? j.error : null };
  };

  const body = {
    utilization: {
      data_year: serviceYear,
      rollup: job("cms_service_types"),
      topServices: services.map((r: any) => ({
        service_type: r.service_type,
        provider_count: Number(r.provider_count) || 0,
        total_services: Number(r.total_services) || 0,
        total_payments: Number(r.total_payments) || 0,
        total_beneficiaries: Number(r.total_beneficiaries) || 0,
      })),
      summary: {
        unique_service_types: Number(summary.types) || 0,
        unique_providers: Number(summary.providers) || 0,
        total_payments: Number(summary.payments) || 0,
        total_services: Number(summary.services) || 0,
      },
    },
    referrals: {
      data_year: referralYear,
      rollup: job("cms_top_referred"),
      topReferred: referred.map((r: any) => ({
        npi: r.referred_to_npi,
        name: names.get(r.referred_to_npi) || null,
        referral_records: Number(r.total_referrals) || 0,
        referring_providers: Number(r.referring_providers) || 0,
      })),
      totalRecords: est.cms_referrals || 0,
    },
    facilities: {
      rollup: job("facility_types"),
      byType: facilityRows
        .filter((r: any) => !AGGREGATE_DATASETS.includes(r.facility_type))
        .slice(0, 15)
        .map((r: any) => ({ type: r.facility_type, count: Number(r.record_count) || 0 })),
    },
    tableCounts: {
      provider_service_utilization: est.provider_service_utilization || 0,
      cms_referrals: est.cms_referrals || 0,
      medicare_facilities: est.medicare_facilities || 0,
    },
    aggregateDatasets: facilityRows
      .filter((r: any) => AGGREGATE_DATASETS.includes(r.facility_type))
      .map((r: any) => ({
        facility_type: r.facility_type,
        record_count: Number(r.record_count) || 0,
        state_count: Number(r.state_count) || 0,
        latest_year: r.latest_year || null,
      })),
  };
  cache = { at: Date.now(), version, body };
  return body;
}
