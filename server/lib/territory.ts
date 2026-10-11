// Pure helpers for the Territory and County Intel handlers.
import { parseMoney } from "./rollups/core";
import { US_STATE_CODES } from "./usStates";
import type { GeoIndex } from "./geo";

/**
 * Approximate provider-location counts per state from the planner's
 * statistics (pg_stats most-common values × the table's row estimate), so
 * the state list never needs a GROUP BY over 12M rows.
 */
export function stateCountsFromStats(stats: { most_common_vals: unknown; most_common_freqs: unknown } | null, reltuples: number): Array<{ state: string; approx: number | null }> {
  const parseArray = (v: unknown): string[] => {
    if (Array.isArray(v)) return v.map(String);
    const s = String(v ?? "").replace(/^\{|\}$/g, "");
    return s ? s.split(",").map((x) => x.replace(/^"|"$/g, "")) : [];
  };
  const vals = stats ? parseArray(stats.most_common_vals) : [];
  const freqs = stats ? parseArray(stats.most_common_freqs).map(Number) : [];
  const approx = new Map<string, number>();
  vals.forEach((v, i) => {
    const st = v.trim().toUpperCase();
    if (US_STATE_CODES.has(st) && Number.isFinite(freqs[i])) approx.set(st, Math.round(freqs[i] * Math.max(0, reltuples)));
  });
  return [...US_STATE_CODES]
    .map((state) => ({ state, approx: approx.has(state) ? approx.get(state)! : null }))
    .sort((a, b) => (b.approx ?? -1) - (a.approx ?? -1) || a.state.localeCompare(b.state));
}

/** A provider's score: its lead score, else its AI outreach score, else none ("Unscored", never 0). */
export function pickScore(leadScore: unknown, aiScore: unknown): { score: number | null; scoreSource: "lead_score" | "ai_outreach" | null } {
  const l = Number(leadScore);
  if (leadScore != null && Number.isFinite(l)) return { score: Math.round(l), scoreSource: "lead_score" };
  const a = Number(aiScore);
  if (aiScore != null && Number.isFinite(a)) return { score: Math.round(a), scoreSource: "ai_outreach" };
  return { score: null, scoreSource: null };
}

export interface UtilizationTotals {
  services: number;
  beneficiaries: number;
  payments: number;
  dataYear: string | null;
}

/** Per-NPI Medicare totals for each provider's latest data year (money stored as text is parsed safely). */
export function utilizationByNpi(rows: Array<Record<string, any>>): Map<string, UtilizationTotals> {
  const latest = new Map<string, string>();
  for (const r of rows) {
    const y = String(r.data_year || "");
    if (!latest.has(r.npi) || y > latest.get(r.npi)!) latest.set(r.npi, y);
  }
  const out = new Map<string, UtilizationTotals>();
  for (const r of rows) {
    if (String(r.data_year || "") !== latest.get(r.npi)) continue;
    const t = out.get(r.npi) || { services: 0, beneficiaries: 0, payments: 0, dataYear: latest.get(r.npi) || null };
    const services = parseMoney(r.total_services) ?? 0;
    const total = parseMoney(r.total_medicare_payment_amt);
    const avg = parseMoney(r.average_medicare_payment_amt);
    t.services += services;
    t.beneficiaries += parseMoney(r.total_unique_benes) ?? 0;
    t.payments += total ?? (avg != null ? avg * services : 0);
    out.set(r.npi, t);
  }
  for (const t of out.values()) t.payments = Math.round(t.payments * 100) / 100;
  return out;
}

/** Practice locations per county in a state, from the ZIP rollup and the ZCTA → county map. */
export function countyDensity(index: GeoIndex, state: string, zipCounts: Array<{ zip5: string; practice_locations: number }>) {
  const byCounty = new Map<string, number>();
  for (const z of zipCounts) {
    const zcta = index.zctas.get(z.zip5);
    if (!zcta?.county || zcta.state !== state) continue;
    byCounty.set(zcta.county, (byCounty.get(zcta.county) || 0) + (Number(z.practice_locations) || 0));
  }
  return (index.countiesByState.get(state) || [])
    .map((c) => ({ fips: c.fips, name: c.name, practice_locations: byCounty.get(c.fips) || 0 }))
    .sort((a, b) => b.practice_locations - a.practice_locations || a.name.localeCompare(b.name));
}

/** Providers' display name from a providers row. */
export function providerName(p: { first_name?: string | null; last_name?: string | null; organization_name?: string | null; credential?: string | null } | null | undefined, fallback: string): string {
  if (!p) return fallback;
  const person = [p.first_name, p.last_name].filter(Boolean).join(" ");
  if (person) return `${person}${p.credential ? `, ${p.credential}` : ""}`;
  return p.organization_name || fallback;
}
