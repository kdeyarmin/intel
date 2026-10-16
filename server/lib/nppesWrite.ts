// NPPES dissemination rows → providers / provider_locations /
// provider_taxonomies, written so that re-running a file is idempotent and
// an NPI's locations and taxonomies end up exactly as the file lists them
// (stale addresses are removed; rows that are unchanged keep their ids, so
// provider_location_matches stay valid).
import { isValidNpi } from "./npiValidation";
import { normalizePhone } from "../../src/lib/crmQuality.js";

export interface NppesProviderRecord {
  npi: string;
  entity_type: "Individual" | "Organization" | null;
  first_name: string | null;
  last_name: string | null;
  organization_name: string | null;
  credential: string | null;
  gender: string | null;
  sole_proprietor: string | null;
  enumeration_date: string | null;
  last_updated_date: string | null;
  npi_deactivation_date: string | null;
  npi_reactivation_date: string | null;
  status: "Active" | "Deactivated";
  /** A monthly-file row that only reports a deactivation (no demographics). */
  deactivated_only: boolean;
}

export interface NppesLocationRecord {
  npi: string;
  location_type: "Practice" | "Mailing";
  address_1: string;
  address_2: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone: string;
  fax: string;
}

export interface NppesTaxonomyRecord {
  npi: string;
  taxonomy_code: string;
  is_primary: boolean;
  license_number: string;
  license_state: string;
}

export interface NppesRecords {
  provider: NppesProviderRecord;
  locations: NppesLocationRecord[];
  taxonomies: NppesTaxonomyRecord[];
}

const t = (v: unknown, max = 255): string => String(v ?? "").trim().slice(0, max);
const orNull = (s: string): string | null => (s ? s : null);

/** "MM/DD/YYYY" → "YYYY-MM-DD" (the registry stores dates as text). */
export function nppesDate(v: unknown): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(String(v ?? "").trim());
  return m ? `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : null;
}

function phone(v: unknown): string {
  // Practice and mailing rows in the same file often spell one number two
  // ways ("412-555-1212" and "4125551212"). Store one format. A fragment
  // shorter than 10 digits (a fax cell of "555") is not a number we can dial.
  const normalized = normalizePhone(t(v, 50));
  if (!normalized) return "";
  return normalized.replace(/\D/g, "").length === 10 ? normalized : "";
}

/** Pure: one npidata_pfile row → the records to write, or null for an invalid NPI. */
export function nppesRowToRecords(row: Record<string, string>): NppesRecords | null {
  const npi = t(row["NPI"], 20);
  if (!isValidNpi(npi)) return null;
  const entityCode = t(row["Entity Type Code"], 2);
  const deactivation = nppesDate(row["NPI Deactivation Date"]);
  const reactivation = nppesDate(row["NPI Reactivation Date"]);
  const deactivatedOnly = !entityCode && !!deactivation;
  const isIndividual = entityCode === "1";
  const deactivated = !!deactivation && (!reactivation || reactivation < deactivation);
  const gender = t(row["Provider Sex Code"] ?? row["Provider Gender Code"], 10);

  const provider: NppesProviderRecord = {
    npi,
    entity_type: deactivatedOnly ? null : isIndividual ? "Individual" : "Organization",
    first_name: isIndividual ? orNull(t(row["Provider First Name"])) : null,
    last_name: isIndividual ? orNull(t(row["Provider Last Name (Legal Name)"])) : null,
    organization_name: !isIndividual && !deactivatedOnly ? orNull(t(row["Provider Organization Name (Legal Business Name)"], 1000)) : null,
    credential: isIndividual ? orNull(t(row["Provider Credential Text"], 100)) : null,
    gender: gender === "M" || gender === "F" ? gender : null,
    sole_proprietor: orNull(t(row["Is Sole Proprietor"], 5)),
    enumeration_date: nppesDate(row["Provider Enumeration Date"]),
    last_updated_date: nppesDate(row["Last Update Date"]),
    npi_deactivation_date: deactivation,
    npi_reactivation_date: reactivation,
    status: deactivated ? "Deactivated" : "Active",
    deactivated_only: deactivatedOnly,
  };

  const locations: NppesLocationRecord[] = [];
  if (!deactivatedOnly) {
    const addr = (prefix: string, type: "Practice" | "Mailing"): NppesLocationRecord | null => {
      const a1 = t(row[`Provider First Line Business ${prefix} Address`], 1000);
      const city = t(row[`Provider Business ${prefix} Address City Name`]);
      if (!a1 && !city) return null;
      return {
        npi, location_type: type,
        address_1: a1,
        address_2: t(row[`Provider Second Line Business ${prefix} Address`], 1000),
        city, state: t(row[`Provider Business ${prefix} Address State Name`], 10),
        zip: t(row[`Provider Business ${prefix} Address Postal Code`], 20),
        country: t(row[`Provider Business ${prefix} Address Country Code (If outside U.S.)`], 10),
        phone: phone(row[`Provider Business ${prefix} Address Telephone Number`]),
        fax: phone(row[`Provider Business ${prefix} Address Fax Number`]),
      };
    };
    const practice = addr("Practice Location", "Practice");
    const mailing = addr("Mailing", "Mailing");
    if (practice) locations.push(practice);
    if (mailing) locations.push(mailing);
  }

  const taxonomies: NppesTaxonomyRecord[] = [];
  if (!deactivatedOnly) {
    const byCode = new Map<string, NppesTaxonomyRecord>();
    for (let i = 1; i <= 15; i++) {
      const code = t(row[`Healthcare Provider Taxonomy Code_${i}`], 50);
      if (!code) continue;
      const primary = t(row[`Healthcare Provider Primary Taxonomy Switch_${i}`], 2).toUpperCase() === "Y";
      const licenseNumber = t(row[`Provider License Number_${i}`], 100);
      const licenseState = t(row[`Provider License Number State Code_${i}`], 10);
      const listed = byCode.get(code);
      if (listed) {
        // The same code in two slots (one per license) is one row: primary if
        // either slot says so, with the first license that has a number.
        listed.is_primary = listed.is_primary || primary;
        if (!listed.license_number && licenseNumber) { listed.license_number = licenseNumber; listed.license_state = licenseState; }
        continue;
      }
      const rec: NppesTaxonomyRecord = { npi, taxonomy_code: code, is_primary: primary, license_number: licenseNumber, license_state: licenseState };
      byCode.set(code, rec);
      taxonomies.push(rec);
    }
    // Exactly one primary: the first slot flagged Y, else the first listed.
    const primary = taxonomies.find((x) => x.is_primary) ?? taxonomies[0];
    for (const x of taxonomies) x.is_primary = x === primary;
  }
  return { provider, locations, taxonomies };
}

export interface WriteStats {
  /** Providers inserted or updated. */
  providers: number;
  /** Full rows ignored because the stored record was updated more recently than the file's. */
  providers_stale: number;
  /** Deactivation-only rows for NPIs we don't hold (there is nothing to deactivate, and no stub is created). */
  deactivations_unmatched: number;
  locations: number;
  locations_removed: number;
  taxonomies: number;
  taxonomies_removed: number;
}

/**
 * The location and taxonomy upserts conflict on these unique indexes
 * (server/lib/bootIndexes.ts), which the server builds in the background after
 * start-up and which stay invalid while duplicate rows exist.
 */
export const NPPES_REQUIRED_INDEXES = ["uq_prov_loc_natural", "uq_prov_tax_natural"] as const;

/** The required indexes that are missing or not (yet) valid, so an import can say so before it starts. */
export async function missingNppesIndexes(db: { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> }): Promise<string[]> {
  const { rows } = await db.query(
    `SELECT c.relname FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
      WHERE c.relname = ANY($1::text[]) AND i.indisvalid AND i.indisunique`,
    [NPPES_REQUIRED_INDEXES as unknown as string[]],
  );
  const have = new Set(rows.map((r) => String(r.relname)));
  return NPPES_REQUIRED_INDEXES.filter((name) => !have.has(name));
}

/**
 * Write a chunk of records with one connection. A full row upserts its provider
 * (blank fields never overwrite stored ones) unless the stored record was
 * updated more recently than the file's, so an older monthly file applied after
 * a weekly one can't revert it; only the NPIs that were applied then get their
 * locations and taxonomies upserted on their natural keys, with any rows the
 * file no longer lists removed. A deactivation-only row changes just the status
 * and dates of a provider we already hold (a later reactivation wins).
 */
export async function writeNppesRecords(
  client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }> },
  records: NppesRecords[],
  opts: { source?: string; describeTaxonomy?: (code: string) => string | null | undefined } = {},
): Promise<WriteStats> {
  const source = opts.source ?? "nppes_file";
  const describe = opts.describeTaxonomy ?? (() => null);
  const stats: WriteStats = { providers: 0, providers_stale: 0, deactivations_unmatched: 0, locations: 0, locations_removed: 0, taxonomies: 0, taxonomies_removed: 0 };
  if (records.length === 0) return stats;
  const now = new Date();

  const full = records.filter((r) => !r.provider.deactivated_only);
  const deactivations = records.filter((r) => r.provider.deactivated_only);

  let applied: NppesRecords[] = [];
  if (full.length) {
    const p = full.map((r) => r.provider);
    const { rows } = await client.query(
      `INSERT INTO providers (npi, entity_type, first_name, last_name, organization_name, credential, gender, sole_proprietor,
          enumeration_date, last_updated_date, npi_deactivation_date, npi_reactivation_date, status, source, updated_date)
       SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[],
          $9::text[], $10::text[], $11::text[], $12::text[], $13::text[], $14::text[], $15::timestamp[])
       ON CONFLICT (npi) DO UPDATE SET
         entity_type = COALESCE(excluded.entity_type, providers.entity_type),
         first_name = COALESCE(excluded.first_name, providers.first_name),
         last_name = COALESCE(excluded.last_name, providers.last_name),
         organization_name = COALESCE(excluded.organization_name, providers.organization_name),
         credential = COALESCE(excluded.credential, providers.credential),
         gender = COALESCE(excluded.gender, providers.gender),
         sole_proprietor = COALESCE(excluded.sole_proprietor, providers.sole_proprietor),
         enumeration_date = COALESCE(excluded.enumeration_date, providers.enumeration_date),
         last_updated_date = COALESCE(excluded.last_updated_date, providers.last_updated_date),
         npi_deactivation_date = COALESCE(excluded.npi_deactivation_date, providers.npi_deactivation_date),
         npi_reactivation_date = COALESCE(excluded.npi_reactivation_date, providers.npi_reactivation_date),
         status = excluded.status,
         source = excluded.source,
         updated_date = excluded.updated_date
       WHERE excluded.last_updated_date IS NULL OR providers.last_updated_date IS NULL
          OR excluded.last_updated_date >= providers.last_updated_date
       RETURNING npi`,
      [
        p.map((x) => x.npi), p.map((x) => x.entity_type), p.map((x) => x.first_name), p.map((x) => x.last_name),
        p.map((x) => x.organization_name), p.map((x) => x.credential), p.map((x) => x.gender), p.map((x) => x.sole_proprietor),
        p.map((x) => x.enumeration_date), p.map((x) => x.last_updated_date), p.map((x) => x.npi_deactivation_date),
        p.map((x) => x.npi_reactivation_date), p.map((x) => x.status), p.map(() => source), p.map(() => now),
      ],
    );
    const written = new Set(rows.map((r) => String(r.npi)));
    applied = full.filter((r) => written.has(r.provider.npi));
    stats.providers += applied.length;
    stats.providers_stale = full.length - applied.length;
  }

  if (deactivations.length) {
    const d = deactivations.map((r) => r.provider);
    const res = await client.query(
      `UPDATE providers AS pr SET
         status = CASE WHEN pr.npi_reactivation_date IS NOT NULL AND pr.npi_reactivation_date >= v.dd THEN pr.status ELSE v.status END,
         npi_deactivation_date = COALESCE(v.dd, pr.npi_deactivation_date),
         npi_reactivation_date = COALESCE(v.rd, pr.npi_reactivation_date),
         last_updated_date = COALESCE(v.lud, pr.last_updated_date),
         source = v.source,
         updated_date = v.ts
       FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::timestamp[]) AS v(npi, status, dd, rd, lud, source, ts)
       WHERE pr.npi = v.npi`,
      [
        d.map((x) => x.npi), d.map((x) => x.status), d.map((x) => x.npi_deactivation_date), d.map((x) => x.npi_reactivation_date),
        d.map((x) => x.last_updated_date), d.map(() => source), d.map(() => now),
      ],
    );
    const matched = res.rowCount || 0;
    stats.providers += matched;
    stats.deactivations_unmatched = Math.max(0, deactivations.length - matched);
  }

  const npis = applied.map((r) => r.provider.npi);
  if (npis.length === 0) return stats;

  const locs = applied.flatMap((r) => r.locations);
  let keptLocationIds: number[] = [];
  if (locs.length) {
    const { rows } = await client.query(
      `INSERT INTO provider_locations (npi, location_type, address_1, address_2, city, state, zip, country, phone, fax, source, updated_date)
       SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[], $9::text[], $10::text[], $11::text[], $12::timestamp[])
       ON CONFLICT (npi, COALESCE(location_type,''), left(coalesce(zip,''),5), md5(lower(btrim(coalesce(address_1,''))))) DO UPDATE SET
         address_2 = excluded.address_2, city = excluded.city, state = excluded.state, zip = excluded.zip, country = excluded.country,
         phone = excluded.phone, fax = excluded.fax, source = excluded.source, updated_date = excluded.updated_date
       RETURNING id`,
      [
        locs.map((l) => l.npi), locs.map((l) => l.location_type), locs.map((l) => l.address_1), locs.map((l) => l.address_2),
        locs.map((l) => l.city), locs.map((l) => l.state), locs.map((l) => l.zip), locs.map((l) => l.country),
        locs.map((l) => l.phone), locs.map((l) => l.fax), locs.map(() => source), locs.map(() => now),
      ],
    );
    keptLocationIds = rows.map((r) => Number(r.id));
    stats.locations = rows.length;
  }
  const removedLocs = await client.query(
    "DELETE FROM provider_locations WHERE npi = ANY($1::text[]) AND NOT (id = ANY($2::int[]))",
    [npis, keptLocationIds],
  );
  stats.locations_removed = removedLocs.rowCount || 0;

  const taxes = applied.flatMap((r) => r.taxonomies);
  let keptTaxIds: number[] = [];
  if (taxes.length) {
    const { rows } = await client.query(
      `INSERT INTO provider_taxonomies (npi, taxonomy_code, taxonomy_description, is_primary, license_number, license_state)
       SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::boolean[], $5::text[], $6::text[])
       ON CONFLICT (npi, COALESCE(taxonomy_code,'')) DO UPDATE SET
         taxonomy_description = COALESCE(excluded.taxonomy_description, provider_taxonomies.taxonomy_description),
         is_primary = excluded.is_primary, license_number = excluded.license_number, license_state = excluded.license_state
       RETURNING id`,
      [taxes.map((x) => x.npi), taxes.map((x) => x.taxonomy_code), taxes.map((x) => describe(x.taxonomy_code) ?? null), taxes.map((x) => x.is_primary), taxes.map((x) => x.license_number), taxes.map((x) => x.license_state)],
    );
    keptTaxIds = rows.map((r) => Number(r.id));
    stats.taxonomies = rows.length;
  }
  const removedTax = await client.query(
    "DELETE FROM provider_taxonomies WHERE npi = ANY($1::text[]) AND NOT (id = ANY($2::int[]))",
    [npis, keptTaxIds],
  );
  stats.taxonomies_removed = removedTax.rowCount || 0;
  return stats;
}
