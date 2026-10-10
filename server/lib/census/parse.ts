// Parsers for the Census Bureau's 2020 Gazetteer and ZCTA↔county
// relationship files, and for the compact CSVs we bundle from them
// (server/data/census). Pure: used by the builder script, the loader and tests.

export interface CountyRow {
  fips: string;
  state: string;
  name: string;
  lat: number;
  lng: number;
}

export interface ZctaGazRow {
  zcta: string;
  aland: number;
  landSqmi: number;
  lat: number;
  lng: number;
}

export interface RelationshipRow {
  zcta: string;
  countyFips: string;
  /** Land area of the ZCTA–county intersection (m²). */
  landPart: number;
  /** Land area of the whole ZCTA (m²). */
  zctaLand: number;
  /** The county's name ("St. Croix Island"); used for territories the county Gazetteer lacks. */
  countyName?: string;
}

export interface ZctaRow {
  zcta: string;
  lat: number;
  lng: number;
  land_sqmi: number;
  primary_county_fips: string | null;
  state: string | null;
}

export interface ZctaCountyRow {
  zcta: string;
  county_fips: string;
  land_share: number;
}

// Territories the county Gazetteer leaves out (Puerto Rico is included).
const TERRITORY_BY_STATE_FIPS: Record<string, string> = { "60": "AS", "66": "GU", "69": "MP", "78": "VI" };

function lines(text: string): string[] {
  return text.replace(/^﻿/, "").split(/\r?\n/).map((l) => l.replace(/\s+$/, "")).filter((l) => l.length > 0);
}

/** Splits a header + rows table and returns rows as objects keyed by (trimmed) header names. */
function table(text: string, sep: string | RegExp): Array<Record<string, string>> {
  const [header, ...rows] = lines(text);
  if (!header) return [];
  const cols = header.split(sep).map((c) => c.trim());
  return rows.map((r) => {
    const cells = r.split(sep);
    const o: Record<string, string> = {};
    cols.forEach((c, i) => {
      o[c] = (cells[i] ?? "").trim();
    });
    return o;
  });
}

function need(row: Record<string, string>, col: string): string {
  if (!(col in row)) throw new Error(`Census file is missing the ${col} column`);
  return row[col];
}

const num = (v: string) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};

/** 2020_Gaz_counties_national.txt (tab-separated). */
export function parseCountyGazetteer(text: string): CountyRow[] {
  return table(text, "\t").map((r) => ({
    fips: need(r, "GEOID").padStart(5, "0"),
    state: need(r, "USPS").toUpperCase(),
    name: need(r, "NAME"),
    lat: num(need(r, "INTPTLAT")),
    lng: num(need(r, "INTPTLONG")),
  })).filter((r) => /^\d{5}$/.test(r.fips) && Number.isFinite(r.lat) && Number.isFinite(r.lng));
}

/** 2020_Gaz_zcta_national.txt (tab-separated, rows padded with trailing spaces). */
export function parseZctaGazetteer(text: string): ZctaGazRow[] {
  return table(text, "\t").map((r) => ({
    zcta: need(r, "GEOID").padStart(5, "0"),
    aland: num(need(r, "ALAND")),
    landSqmi: num(need(r, "ALAND_SQMI")),
    lat: num(need(r, "INTPTLAT")),
    lng: num(need(r, "INTPTLONG")),
  })).filter((r) => /^\d{5}$/.test(r.zcta) && Number.isFinite(r.lat) && Number.isFinite(r.lng));
}

/**
 * tab20_zcta520_county20_natl.txt (pipe-separated, UTF-8 with a BOM). Rows
 * for county land outside any ZCTA have a blank ZCTA and are skipped.
 */
export function parseZctaCountyRelationship(text: string): RelationshipRow[] {
  return table(text, "|")
    .map((r) => ({
      zcta: need(r, "GEOID_ZCTA5_20"),
      countyFips: need(r, "GEOID_COUNTY_20"),
      landPart: num(need(r, "AREALAND_PART")),
      zctaLand: num(need(r, "AREALAND_ZCTA5_20")),
      countyName: r.NAMELSAD_COUNTY_20 || undefined,
    }))
    .filter((r) => /^\d{5}$/.test(r.zcta) && /^\d{5}$/.test(r.countyFips));
}

/**
 * County equivalents of American Samoa, Guam, the Northern Mariana Islands and
 * the Virgin Islands, which the county Gazetteer leaves out but ZCTAs point at.
 * Each one that is some ZCTA's main county is added, named from the
 * relationship file and placed at the land-weighted centroid of those ZCTAs,
 * so every ZIP resolves to a county with a real position. The rest (e.g.
 * American Samoa's smaller districts, which only share a ZCTA with a bigger
 * one) have nothing of their own to place them by and are left out.
 */
function territoryCounties(
  input: { counties: CountyRow[]; zctas: ZctaGazRow[]; relationships: RelationshipRow[] },
  primary: Map<string, string>,
): CountyRow[] {
  const known = new Set(input.counties.map((c) => c.fips));
  const names = new Map(input.relationships.map((r) => [r.countyFips, r.countyName]));
  const acc = new Map<string, { w: number; lat: number; lng: number }>();
  for (const z of input.zctas) {
    const fips = primary.get(z.zcta);
    if (!fips || known.has(fips) || !TERRITORY_BY_STATE_FIPS[fips.slice(0, 2)]) continue;
    const w = z.aland > 0 ? z.aland : 1;
    const a = acc.get(fips) || { w: 0, lat: 0, lng: 0 };
    a.w += w;
    a.lat += z.lat * w;
    a.lng += z.lng * w;
    acc.set(fips, a);
  }
  const round = (v: number) => Math.round(v * 1e6) / 1e6;
  return [...acc].map(([fips, a]) => ({
    fips,
    state: TERRITORY_BY_STATE_FIPS[fips.slice(0, 2)],
    name: names.get(fips) || fips,
    lat: round(a.lat / a.w),
    lng: round(a.lng / a.w),
  }));
}

/**
 * ZCTA rows with their main county (largest share of land) and that county's
 * state, plus every ZCTA–county pair with its share of the ZCTA's land.
 * Water-only ZCTAs split evenly between their counties.
 */
export function buildGeoTables(input: { counties: CountyRow[]; zctas: ZctaGazRow[]; relationships: RelationshipRow[] }) {
  const stateByCounty = new Map(input.counties.map((c) => [c.fips, c.state]));
  const byZcta = new Map<string, RelationshipRow[]>();
  for (const r of input.relationships) {
    const list = byZcta.get(r.zcta) || [];
    list.push(r);
    byZcta.set(r.zcta, list);
  }

  const zctaCounties: ZctaCountyRow[] = [];
  const primary = new Map<string, string>();
  for (const [zcta, parts] of byZcta) {
    const total = parts.reduce((s, p) => s + (p.landPart > 0 ? p.landPart : 0), 0);
    let best: { fips: string; share: number } | null = null;
    for (const p of parts) {
      const share = total > 0 ? Math.max(0, p.landPart) / total : 1 / parts.length;
      zctaCounties.push({ zcta, county_fips: p.countyFips, land_share: Math.round(share * 1e6) / 1e6 });
      if (!best || share > best.share || (share === best.share && p.countyFips < best.fips)) best = { fips: p.countyFips, share };
    }
    if (best) primary.set(zcta, best.fips);
  }

  const stateOf = (county: string | null) =>
    county ? stateByCounty.get(county) ?? TERRITORY_BY_STATE_FIPS[county.slice(0, 2)] ?? null : null;

  const zctas: ZctaRow[] = input.zctas.map((z) => {
    const county = primary.get(z.zcta) ?? null;
    return {
      zcta: z.zcta,
      lat: z.lat,
      lng: z.lng,
      land_sqmi: z.landSqmi,
      primary_county_fips: county,
      state: stateOf(county),
    };
  });

  // A few hundred Gazetteer ZCTAs (mostly tiny PO-box areas) have no rows in
  // the relationship file; give them the county of the nearest ZCTA that has one.
  const located = zctas.filter((z) => z.primary_county_fips);
  let inferred = 0;
  for (const z of zctas) {
    if (z.primary_county_fips || located.length === 0) continue;
    const cos = Math.cos((z.lat * Math.PI) / 180);
    let best = located[0];
    let bestD = Infinity;
    for (const o of located) {
      const dLat = o.lat - z.lat;
      const dLng = (o.lng - z.lng) * cos;
      const d = dLat * dLat + dLng * dLng;
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    }
    z.primary_county_fips = best.primary_county_fips;
    z.state = best.state;
    inferred += 1;
  }
  zctas.sort((a, b) => a.zcta.localeCompare(b.zcta));
  zctaCounties.sort((a, b) => a.zcta.localeCompare(b.zcta) || a.county_fips.localeCompare(b.county_fips));
  const counties = [...input.counties, ...territoryCounties(input, primary)].sort((a, b) => a.fips.localeCompare(b.fips));
  return { counties, zctas, zctaCounties, inferredCounties: inferred };
}

// ─── Compact CSV (what we bundle) ────────────────────────────────────────────

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(columns: string[], rows: Array<Record<string, unknown>>): string {
  return [columns.join(","), ...rows.map((r) => columns.map((c) => csvCell(r[c])).join(","))].join("\n") + "\n";
}

/** Parses the bundled CSVs (RFC 4180 quoting, no embedded newlines). */
export function fromCsv(text: string): Array<Record<string, string>> {
  const rows = lines(text);
  const parseLine = (line: string) => {
    const out: string[] = [];
    let cur = "";
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (quoted) {
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else if (ch === '"') quoted = false;
        else cur += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ",") {
        out.push(cur);
        cur = "";
      } else cur += ch;
    }
    out.push(cur);
    return out;
  };
  const [header, ...body] = rows;
  if (!header) return [];
  const cols = parseLine(header);
  return body.map((l) => {
    const cells = parseLine(l);
    return Object.fromEntries(cols.map((c, i) => [c, cells[i] ?? ""]));
  });
}

export const COUNTY_COLUMNS = ["fips", "state", "name", "lat", "lng"];
export const ZCTA_COLUMNS = ["zcta", "lat", "lng", "land_sqmi", "primary_county_fips", "state"];
export const ZCTA_COUNTY_COLUMNS = ["zcta", "county_fips", "land_share"];
