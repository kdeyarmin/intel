// Deterministic synthetic data for local end-to-end testing: providers with
// practice locations and specialties in PA/OH/WV, referral edges, Medicare
// utilization, lead scores, facilities and a lead list. Rows are tagged
// 'demo-seed' (source / import_batch_id / created_by, or via their provider's
// NPI) and re-running replaces them. Demo NPIs that other providers use are
// skipped; rows for a demo NPI with no provider row stop the seed.
//
// Refuses to run against anything but a local database.
// Usage: npm run db:seed-demo
import { pool } from "../../server/db";
import { isValidNpi } from "../../server/lib/npiValidation";

const TAG = "demo-seed";

function assertLocal() {
  const url = new URL(process.env.DATABASE_URL || "postgres://invalid");
  // URL keeps the brackets on an IPv6 host: postgres://[::1]/db has hostname "[::1]".
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    console.error(`[seed-demo] Refusing to seed ${url.hostname}: only local databases are allowed.`);
    process.exit(1);
  }
}

// Small deterministic PRNG (mulberry32) so every run produces the same data.
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20261010);
const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];

/** A valid NPI (Luhn check digit with the 80840 prefix) from a 9-digit base. */
export function npiFrom(base9: number): string {
  const body = String(base9).padStart(9, "0");
  for (let d = 0; d <= 9; d += 1) if (isValidNpi(`${body}${d}`)) return `${body}${d}`;
  throw new Error("unreachable");
}

const CITIES = [
  { city: "Pittsburgh", state: "PA", zips: ["15213", "15222", "15232", "15212"] },
  { city: "Philadelphia", state: "PA", zips: ["19104", "19107", "19146"] },
  { city: "Erie", state: "PA", zips: ["16501", "16502"] },
  { city: "Columbus", state: "OH", zips: ["43210", "43215"] },
  { city: "Wheeling", state: "WV", zips: ["26003"] },
];
const SPECIALTIES = [
  { code: "207Q00000X", desc: "Family Medicine", refers: true },
  { code: "207R00000X", desc: "Internal Medicine", refers: true },
  { code: "207RC0000X", desc: "Internal Medicine, Cardiovascular Disease" },
  { code: "2084P0800X", desc: "Psychiatry & Neurology, Psychiatry" },
  { code: "207X00000X", desc: "Orthopaedic Surgery" },
  { code: "207RG0300X", desc: "Internal Medicine, Geriatric Medicine" },
  { code: "207RH0003X", desc: "Internal Medicine, Hematology & Oncology" },
  { code: "363L00000X", desc: "Nurse Practitioner", refers: true },
  { code: "225100000X", desc: "Physical Therapist" },
];
const FIRST = ["Ann", "Ben", "Cara", "Dev", "Eli", "Fay", "Gus", "Hana", "Ian", "Jo", "Kai", "Lena", "Max", "Nia", "Omar", "Pia", "Quinn", "Rosa", "Sam", "Tara"];
const LAST = ["Abbott", "Baker", "Chen", "Diaz", "Evans", "Foster", "Garcia", "Hughes", "Iyer", "Jones", "Khan", "Lopez", "Miller", "Nguyen", "Owens", "Patel", "Reed", "Singh", "Turner", "Walsh"];
const ORG_WORDS = ["Allegheny", "Riverside", "Three Rivers", "Lakeview", "Keystone", "Valley", "Summit", "Harbor"];
const ORG_KINDS = ["Medical Group", "Family Practice", "Heart Clinic", "Orthopedic Associates", "Behavioral Health", "Hospital"];
const FACILITY_TYPES = [
  { type: "hospital_general_info", label: "Hospital" },
  { type: "nursing_home_providers", label: "Nursing Center" },
  { type: "hospice_general_info", label: "Hospice" },
  { type: "home_health_agencies", label: "Home Health" },
];

const DEMO_NPI_BASE = 199_000_000;
const DEMO_PROVIDERS = 160;
const DEMO_NPI_POOL = 400; // room to skip NPIs other local rows already use

async function insertRows(client: any, table: string, cols: string[], rows: unknown[][]) {
  for (let i = 0; i < rows.length; i += 500) {
    const part = rows.slice(i, i + 500);
    const values: unknown[] = [];
    const tuples = part.map((r, j) => {
      values.push(...r);
      return `(${cols.map((_, k) => `$${j * cols.length + k + 1}`).join(", ")})`;
    });
    await client.query(`INSERT INTO ${table} (${cols.join(", ")}) VALUES ${tuples.join(", ")}`, values);
  }
}

/**
 * Demo child rows are found by their provider's NPI. Rows for a pool NPI with
 * no provider row may not be demo data, and the seed could take that NPI for
 * a demo provider and delete them on its next run, so stop before changing anything.
 */
async function assertNoOrphanRowsInPool() {
  const npiPool = Array.from({ length: DEMO_NPI_POOL }, (_, k) => npiFrom(DEMO_NPI_BASE + k));
  const { rows } = await pool.query("SELECT npi FROM providers WHERE npi = ANY($1)", [npiPool]);
  const withProvider = new Set(rows.map((r: any) => r.npi));
  const bare = npiPool.filter((n) => !withProvider.has(n));
  const found: string[] = [];
  for (const t of ["lead_scores", "provider_taxonomies", "provider_locations", "provider_service_utilization"]) {
    const { rows: hits } = await pool.query(`SELECT npi FROM ${t} WHERE npi = ANY($1) LIMIT 5`, [bare]);
    found.push(...hits.map((r: any) => `${r.npi} (${t})`));
  }
  if (found.length) {
    throw new Error(
      `found rows for demo NPIs that have no provider row: ${found.join(", ")}. ` +
        "The seed can't tell whether they are demo data, so it changed nothing; remove them and run it again.",
    );
  }
}

async function main() {
  assertLocal();
  await assertNoOrphanRowsInPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Replace earlier demo rows. Demo NPIs come from a fixed pool and facility
    // ids are DEMO0001…, so every lookup and delete goes through an indexed key
    // (npi, provider_id) rather than scanning the big tables for the batch tag.
    const npiPool = Array.from({ length: DEMO_NPI_POOL }, (_, k) => npiFrom(DEMO_NPI_BASE + k));
    const { rows: old } = await client.query("SELECT npi FROM providers WHERE npi = ANY($1) AND source = $2", [npiPool, TAG]);
    const oldNpis = old.map((r: any) => r.npi);
    await client.query("DELETE FROM lead_list_members WHERE list_id IN (SELECT id FROM lead_lists WHERE created_by = $1)", [TAG]);
    await client.query("DELETE FROM lead_lists WHERE created_by = $1", [TAG]);
    // provider_service_utilization has no batch column; its rows go with their providers.
    for (const t of ["lead_scores", "provider_taxonomies", "provider_locations", "provider_service_utilization"]) {
      await client.query(`DELETE FROM ${t} WHERE npi = ANY($1)`, [oldNpis]);
    }
    await client.query("DELETE FROM providers WHERE npi = ANY($1) AND source = $2", [oldNpis, TAG]);
    await client.query("DELETE FROM cms_referrals WHERE npi = ANY($1) AND import_batch_id = $2", [oldNpis, TAG]);
    // Demo facilities are DEMO0001…; the range uses idx_medfac_provider_id.
    await client.query(
      "DELETE FROM medicare_facilities WHERE provider_id >= 'DEMO' AND provider_id < 'DEMP' AND import_batch_id = $1",
      [TAG],
    );

    const providers: unknown[][] = [];
    const locations: unknown[][] = [];
    const taxonomies: unknown[][] = [];
    const people: Array<{ npi: string; spec: (typeof SPECIALTIES)[number]; city: (typeof CITIES)[number] }> = [];
    // Skip NPIs another local dataset already uses (the demo rows were deleted above).
    const { rows: taken } = await client.query("SELECT npi FROM providers WHERE npi = ANY($1)", [npiPool]);
    const takenSet = new Set(taken.map((r: any) => r.npi));
    const free = npiPool.filter((n) => !takenSet.has(n));
    if (free.length < DEMO_PROVIDERS) throw new Error("Too many demo NPIs are already in use by other rows.");

    for (let i = 0; i < DEMO_PROVIDERS; i += 1) {
      const npi = free[i];
      const city = CITIES[i % CITIES.length];
      const zip = pick(city.zips);
      const isOrg = i % 8 === 7;
      const spec = SPECIALTIES[i % SPECIALTIES.length];
      if (isOrg) {
        providers.push([npi, "Organization", null, null, `${pick(ORG_WORDS)} ${pick(ORG_KINDS)}`, null, "Active", TAG,
          i % 3 === 0 ? `info@${npi}.demo-clinic.org` : null, `412555${String(1000 + i).slice(-4)}`]);
      } else {
        providers.push([npi, "Individual", pick(FIRST), pick(LAST), null, spec.code.startsWith("36") ? "NP" : "MD", "Active", TAG,
          i % 4 === 0 ? `dr${i}@demo-clinic.org` : null, null]);
        people.push({ npi, spec, city });
      }
      locations.push([npi, "Practice", `${100 + i} ${pick(["Main St", "Forbes Ave", "Penn Ave", "High St"])}`, city.city, city.state, zip, `412555${String(2000 + i).slice(-4)}`, TAG]);
      locations.push([npi, "Mailing", `PO Box ${1000 + i}`, city.city, city.state, zip, null, TAG]);
      taxonomies.push([npi, spec.code, spec.desc, true, TAG]);
    }
    await insertRows(client, "providers", ["npi", "entity_type", "first_name", "last_name", "organization_name", "credential", "status", "source", "email", "phone"], providers);
    await insertRows(client, "provider_locations", ["npi", "location_type", "address_1", "city", "state", "zip", "phone", "source"], locations);
    await insertRows(client, "provider_taxonomies", ["npi", "taxonomy_code", "taxonomy_description", "is_primary", "source"], taxonomies);

    // Referrals: primary-care providers refer to specialists in the same state, two data years.
    const referrals: unknown[][] = [];
    const seen = new Set<string>();
    for (const p of people.filter((x) => x.spec.refers)) {
      const targets = people.filter((x) => !x.spec.refers && x.city.state === p.city.state);
      for (let k = 0; k < 4 && targets.length; k += 1) {
        const t = pick(targets);
        const key = `${p.npi}>${t.npi}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const volume = 11 + Math.floor(rand() * 200);
        for (const year of ["2022", "2023"]) {
          referrals.push([p.npi, t.npi, Math.round(volume * (year === "2023" ? 1 : 0.8)), Math.round(volume * 0.6), year, TAG]);
        }
      }
    }
    await insertRows(client, "cms_referrals", ["npi", "referred_to_npi", "total_referrals", "total_beneficiaries", "data_year", "import_batch_id"], referrals);

    // Medicare utilization: three service lines per individual provider (money as text, as imported).
    const services: unknown[][] = [];
    const HCPCS = [["99213", "Office visit, established patient"], ["99214", "Office visit, moderate complexity"], ["93306", "Echocardiogram"], ["97110", "Therapeutic exercise"]];
    for (const p of people) {
      for (const [code, desc] of HCPCS.slice(0, 3)) {
        const benes = 20 + Math.floor(rand() * 300);
        const svc = benes * (1 + Math.floor(rand() * 4));
        services.push([p.npi, p.spec.desc, code, desc, "O", String(svc), String(benes), (svc * (40 + rand() * 80)).toFixed(2), "2023"]);
      }
    }
    await insertRows(client, "provider_service_utilization",
      ["npi", "service_type", "hcpcs_code", "hcpcs_description", "place_of_service", "total_services", "total_unique_benes", "total_medicare_payment_amt", "data_year"], services);

    // Lead scores for most providers.
    const scores = people.filter((_, i) => i % 5 !== 0).map((p) => [p.npi, Math.round(20 + rand() * 80), Math.round(rand() * 100), Math.round(rand() * 100), new Date()]);
    await insertRows(client, "lead_scores", ["npi", "score", "outreach_potential", "referral_likelihood", "last_calculated"], scores);

    // Facilities in each city.
    const facilities: unknown[][] = [];
    let ccn = 0;
    for (const city of CITIES) {
      for (const f of FACILITY_TYPES) {
        ccn += 1;
        facilities.push([f.type, `DEMO${String(ccn).padStart(4, "0")}`, `${city.city} ${pick(ORG_WORDS)} ${f.label}`, `${ccn * 10} Health Way`, city.city.toUpperCase(), city.state, city.zips[0], "2023", TAG]);
      }
    }
    await insertRows(client, "medicare_facilities", ["facility_type", "provider_id", "facility_name", "address", "city", "state", "zip", "data_year", "import_batch_id"], facilities);

    // A lead list of Pittsburgh cardiologists and family doctors.
    const listNpis = people.filter((p) => p.city.city === "Pittsburgh").slice(0, 15).map((p) => p.npi);
    const { rows: [list] } = await client.query(
      "INSERT INTO lead_lists (name, description, member_count, created_by) VALUES ($1, $2, $3, $4) RETURNING id",
      ["Demo: Pittsburgh providers", "Synthetic demo data", listNpis.length, TAG],
    );
    await insertRows(client, "lead_list_members", ["list_id", "npi"], listNpis.map((n) => [list.id, n]));

    await client.query("COMMIT");
    console.log(`[seed-demo] ${providers.length} providers, ${locations.length} locations, ${referrals.length} referral rows, ${services.length} utilization rows, ${facilities.length} facilities, lead list #${list.id}`);
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error("[seed-demo] Failed:", e?.message || e);
  process.exit(1);
});
