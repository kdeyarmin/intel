// Location search over the ~12M-row provider_locations table. Understands an
// NPI, a ZIP (5 or ZIP+4), "City, ST" / "City ST", or a bare state, and only
// issues queries an index can answer. A city without a state can't be served
// by an index, so it asks for the state instead of scanning.
import { SEARCH_EXPR as E } from "./searchIndexes";
import { escapeLike, normalizeStateFilter, type SqlQuery } from "./providerSearch";
import { US_STATE_CODES } from "./usStates";

export type LocationInterpretation = "npi" | "zip" | "city_state" | "state";

export interface LocationSearchPlan extends SqlQuery {
  interpretation: LocationInterpretation;
  label: string;
  cap: number;
}

export interface LocationSearchInput {
  q?: string;
  state?: string | null;
  locationType?: string | null;
  limit?: number;
}

const COLUMNS = "id, npi, location_type, address_1, address_2, city, state, zip, phone, fax, created_date";
const MAX_LIMIT = 500;

export function clampLocationLimit(limit: unknown): number {
  return Math.min(Math.max(Math.floor(Number(limit)) || 200, 1), MAX_LIMIT);
}

/** "Pittsburgh, PA", "pittsburgh pa", "New Castle DE" → { city, state }. */
export function parseCityState(q: string): { city: string; state: string } | null {
  const m = q.match(/^(.+?)[,\s]+([A-Za-z]{2})$/);
  if (!m) return null;
  const state = m[2].toUpperCase();
  if (!US_STATE_CODES.has(state)) return null;
  const city = m[1].replace(/,$/, "").trim();
  return city.length >= 2 ? { city, state } : null;
}

export type LocationPlanResult = LocationSearchPlan | { needsState: true; message: string } | null;

export function buildLocationSearchPlan(input: LocationSearchInput): LocationPlanResult {
  const q = (input.q || "").trim().replace(/\s+/g, " ");
  const stateFilter = normalizeStateFilter(input.state);
  const cap = clampLocationLimit(input.limit) + 1;
  const values: unknown[] = [];
  const p = (v: unknown) => {
    values.push(v);
    return `$${values.length}`;
  };
  const extra = () => {
    const parts: string[] = [];
    if (input.locationType === "Practice" || input.locationType === "Mailing") parts.push(`location_type = ${p(input.locationType)}`);
    return parts.length ? ` AND ${parts.join(" AND ")}` : "";
  };
  const finish = (interpretation: LocationInterpretation, label: string, where: string, order = "") => ({
    interpretation,
    label,
    cap,
    text: `SELECT ${COLUMNS} FROM provider_locations WHERE ${where}${extra()}${order} LIMIT ${p(cap)}`,
    values,
  });

  const digits = q.replace(/[\s-]/g, "");
  if (/^\d{10}$/.test(digits) && !/^\d{5}-?\d{4}$/.test(q)) {
    // The state filter applies here too (the page sends it with every search).
    return finish("npi", `NPI ${digits}`, `npi = ${p(digits)}${stateFilter ? ` AND state = ${p(stateFilter)}` : ""}`);
  }
  const zip = q.match(/^(\d{5})(?:-?(\d{4}))?$/);
  if (zip) {
    const where = `${E.zip5} = ${p(zip[1])}${stateFilter ? ` AND state = ${p(stateFilter)}` : ""}`;
    // A ZIP+4 puts exact matches first before the cap applies (sorting just
    // that ZIP's rows, which the ZIP5 index finds), so none can be cut off.
    const order = zip[2] ? ` ORDER BY (regexp_replace(coalesce(zip, ''), '[^0-9]', '', 'g') = ${p(`${zip[1]}${zip[2]}`)}) DESC, id` : "";
    return finish("zip", `ZIP ${zip[2] ? `${zip[1]}-${zip[2]}` : zip[1]}`, where, order);
  }
  const cityState = parseCityState(q);
  if (cityState || (q && stateFilter)) {
    const city = cityState ? cityState.city : q;
    const state = cityState ? cityState.state : stateFilter!;
    const where = `state = ${p(state)} AND ${E.cityUpper} LIKE ${p(`${escapeLike(city.toUpperCase())}%`)}`;
    return finish("city_state", `${city}, ${state}`, where, ` ORDER BY ${E.cityUpper}`);
  }
  if (!q && stateFilter) return finish("state", `Locations in ${stateFilter}`, `state = ${p(stateFilter)}`);
  if (/^[A-Za-z]{2}$/.test(q) && US_STATE_CODES.has(q.toUpperCase())) {
    return finish("state", `Locations in ${q.toUpperCase()}`, `state = ${p(q.toUpperCase())}`);
  }
  if (q) {
    return { needsState: true, message: `Add a state to search by city, e.g. "${q}, PA", or pick a state.` };
  }
  return null;
}

/** Sorts exact ZIP+4 matches first when one was given. */
export function rankLocations(rows: any[], q: string): any[] {
  const zip4 = (q || "").trim().match(/^(\d{5})-?(\d{4})$/);
  if (!zip4) return rows;
  const full = `${zip4[1]}${zip4[2]}`;
  const exact = (r: any) => String(r.zip || "").replace(/\D/g, "") === full;
  return [...rows].sort((a, b) => Number(exact(b)) - Number(exact(a)));
}
