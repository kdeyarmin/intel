// NPPES dissemination rows → providers / provider_locations /
// provider_taxonomies, written so that re-running a file is idempotent and
// an NPI's locations and taxonomies end up exactly as the file lists them
// (stale addresses are removed; rows that are unchanged keep their ids, so
// provider_location_matches stay valid).
import { isValidNpi } from "./npiValidation";

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
  const s = t(v, 50);
  return s.replace(/[^0-9]/g, "").length < 10 ? "" : s;
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
  const seen = new Set<string>();
  if (!deactivatedOnly) {
    for (let i = 1; i <= 15; i++) {
      const code = t(row[`Healthcare Provider Taxonomy Code_${i}`], 50);
      if (!code || seen.has(code)) continue;
      seen.add(code);
      taxonomies.push({
        npi, taxonomy_code: code,
        is_primary: t(row[`Healthcare Provider Primary Taxonomy Switch_${i}`], 2).toUpperCase() === "Y",
        license_number: t(row[`Provider License Number_${i}`], 100),
        license_state: t(row[`Provider License Number State Code_${i}`], 10),
      });
    }
    if (taxonomies.length && !taxonomies.some((x) => x.is_primary)) taxonomies[0].is_primary = true;
  }
  return { provider, locations, taxonomies };
}

export interface WriteStats { providers: number; locations: number; locations_removed: number; taxonomies: number; taxonomies_removed: number }

/**
 * Write a chunk of records with one connection: providers upserted (blank
 * fields never overwrite stored ones; a deactivation-only row changes only
 * status and dates), then each NPI's locations and taxonomies upserted on
 * their natural keys and any rows the file no longer lists removed.
 */
export async function writeNppesRecords(
  client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }> },
  records: NppesRecords[],
  opts: { source?: string; describeTaxonomy?: (code: string) => string | null | undefined } = {},
): Promise<WriteStats> {
  const source = opts.source ?? "nppes_file";
  const describe = opts.describeTaxonomy ?? (() => null);
  const stats: WriteStats = { providers: 0, locations: 0, locations_removed: 0, taxonomies: 0, taxonomies_removed: 0 };
  if (records.length === 0) return stats;
  const p = records.map((r) => r.provider);
  await client.query(
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
       updated_date = excluded.updated_date`,
    [
      p.map((x) => x.npi), p.map((x) => x.entity_type), p.map((x) => x.first_name), p.map((x) => x.last_name),
      p.map((x) => x.organization_name), p.map((x) => x.credential), p.map((x) => x.gender), p.map((x) => x.sole_proprietor),
      p.map((x) => x.enumeration_date), p.map((x) => x.last_updated_date), p.map((x) => x.npi_deactivation_date),
      p.map((x) => x.npi_reactivation_date), p.map((x) => x.status), p.map(() => source), p.map(() => new Date()),
    ],
  );
  stats.providers = p.length;

  // Only NPIs whose row carries demographics get their addresses and
  // taxonomies replaced; a deactivation-only row leaves them alone.
  const full = records.filter((r) => !r.provider.deactivated_only);
  const npis = full.map((r) => r.provider.npi);
  if (npis.length === 0) return stats;

  const locs = full.flatMap((r) => r.locations);
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
        locs.map((l) => l.phone), locs.map((l) => l.fax), locs.map(() => source), locs.map(() => new Date()),
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

  const taxes = full.flatMap((r) => r.taxonomies);
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
