// Row-mapping helpers for triggerImport: pure functions that turn raw CMS
// file rows into typed table rows, plus the row filters and star-rating
// lookups the import pipeline applies. Extracted from triggerImport.ts;
// that module re-exports the public names so existing imports keep working.
import { createHash } from "crypto";
import { and } from "drizzle-orm";
import { int, num } from "./cmsTypedTables";
import { stateCodeOf } from "../lib/stateNames";
import { derivedStateOf } from "../lib/rowState";

// CMS Order & Referring: one row per NPI with Y/N flags for the services the
// provider may order or refer. Lands in cms_order_referring (replaced per
// release), never in cms_referrals.
const yesNo = (v: unknown): boolean | null => {
  if (v == null || v === "") return null;
  const s = String(v).trim().toUpperCase();
  if (s === "Y" || s === "YES" || s === "TRUE" || s === "1") return true;
  if (s === "N" || s === "NO" || s === "FALSE" || s === "0") return false;
  return null;
};

export function mapCMSOrderReferringRow(row: any, batchId: number, asOf: string | null) {
  const npi = String(row.NPI || row.npi || "").trim();
  return {
    npi: /^\d{10}$/.test(npi) ? npi : null,
    last_name: row.LAST_NAME || row.last_name || null,
    first_name: row.FIRST_NAME || row.first_name || null,
    partb: yesNo(row.PARTB ?? row.partb),
    dme: yesNo(row.DME ?? row.dme),
    hha: yesNo(row.HHA ?? row.hha),
    pmd: yesNo(row.PMD ?? row.pmd),
    hospice: yesNo(row.HOSPICE ?? row.hospice),
    as_of: asOf,
    import_batch_id: batchId,
    updated_date: new Date(),
  };
}

/**
 * Map a raw CMS provider service utilization record into the normalized provider-service utilization shape used by the importer.
 *
 * @param row - Raw input row from a CMS utilization dataset; accepts variant header names (e.g., `Rndrng_NPI`, `npi`, `Tot_Srvcs`, `tot_srvcs`, `Avg_Mdcr_Pymt_Amt`, etc.)
 * @param year - Data year to assign to the resulting row (stored in `data_year`)
 * @returns An object with the normalized fields:
 * - `npi`: provider NPI or `null`
 * - `service_type`: rendering provider specialty or `null`
 * - `hcpcs_code`: HCPCS/CPT code or `null`
 * - `hcpcs_description`: HCPCS description or `null`
 * - `place_of_service`: place of service or `null`
 * - `total_services`: total service count or `null`
 * - `total_unique_benes`: total unique beneficiaries or `null`
 * - `average_submitted_chrg_amt`: average submitted charge or `null`
 * - `average_medicare_payment_amt`: average Medicare payment per service or `null`
 * - `total_medicare_payment_amt`: derived total Medicare payment (average × services) or `null`
 * - `data_year`: the provided `year` coerced to a string
 */
export function mapCMSUtilizationRow(row: any, year: number, _batchId: number) {
  const avgPayment = row.Avg_Mdcr_Pymt_Amt ?? row.avg_mdcr_pymt_amt ?? null;
  const totalServices = row.Tot_Srvcs ?? row.tot_srvcs ?? null;

  // Derive total payment from average × services
  let totalPayment = null;
  if (avgPayment && totalServices) {
    const avg = parseFloat(avgPayment);
    const count = parseFloat(totalServices);
    if (!isNaN(avg) && !isNaN(count)) {
      totalPayment = (avg * count).toFixed(2);
    }
  }

  return {
    npi: row.Rndrng_NPI || row.npi || null,
    service_type: row.Rndrng_Prvdr_Type || row.Rndrng_prvdr_type || null,
    hcpcs_code: row.HCPCS_Cd || row.hcpcs_cd || null,
    hcpcs_description: row.HCPCS_Desc || row.hcpcs_desc || null,
    place_of_service: row.Place_Of_Srvc || row.place_of_srvc || null,
    total_services: totalServices,
    total_unique_benes: row.Tot_Benes || row.tot_benes || null,
    average_submitted_chrg_amt: row.Avg_Sbmtd_Chrg || row.avg_sbmtd_chrg || null,
    average_medicare_payment_amt: avgPayment,
    total_medicare_payment_amt: totalPayment,
    data_year: String(year),
    raw_data: row,
  };
}

/**
 * Selects the first non-empty value from `row` among a list of candidate keys.
 *
 * @param row - The object to search for values.
 * @param keys - Ordered candidate property names to check on `row`.
 * @returns The first value that is not `undefined`, not `null`, and not an empty string after trimming, or `null` if none are found.
 */
function firstField(row: any, keys: string[]): any {
  for (const k of keys) {
    const v = row?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return null;
}

/**
 * Parse a value into an integer, returning null when an integer cannot be derived.
 *
 * @param v - The input value (number, string, or other) to parse for an integer
 * @returns The parsed integer, or `null` if no integer could be extracted
 */
function toIntOrNull(v: any): number | null {
  if (v === null || v === undefined) return null;
  const cleaned = String(v).replace(/[^0-9-]/g, "");
  if (cleaned === "" || cleaned === "-") return null;
  const n = parseInt(cleaned, 10);
  return Number.isFinite(n) ? n : null;
}

// ── Optional import row filters (npi_filter / state_filter) ─────────────────
// CMS dataset rows carry the provider NPI and state under wildly varying header
// names (data-api caps vs provider-data snake_case, "Rndrng_" vs "Prscrbr_"
// prefixes, etc.). These alias lists let the optional filters extract the
// relevant field regardless of dataset shape.
const FILTER_NPI_FIELDS = [
  "NPI", "npi", "Rndrng_NPI", "rndrng_npi", "Prscrbr_NPI", "PRSCRBR_NPI",
  "Suplr_NPI", "suplr_npi", "Rfrg_NPI", "rfrg_npi", "npi_1", "NPI_1",
  "provider_npi", "PROVIDER_NPI", "org_npi", "ORG_NPI",
  // Shared-patient-pattern (PSPP) source-NPI aliases, matching the keys
  // mapSharedPatientPatternRow reads, so an npi_filter on that dataset works.
  "from_npi", "FROM_NPI", "src_npi", "referring_npi", "provider_1_npi",
  "npi1", "NPI1",
];
const FILTER_STATE_FIELDS = [
  "state", "State", "STATE", "st", "ST", "state_cd", "STATE_CD",
  "Rndrng_Prvdr_State_Abrvtn", "Prvdr_State_Abrvtn", "prvdr_state",
  "Rndrng_Prvdr_State", "Prscrbr_State_Abrvtn", "provider_state",
  "PROVIDER_STATE", "BENE_STATE_ABRVTN", "state_abbreviation",
  "STATE_ABBREVIATION", "Provider State", "State Code", "state_code",
  // Keep in sync with mapMedicareFacilityRow's state field list so a
  // state_filter works for supplier/referring/practice-shaped CMS feeds.
  "Suplr_Prvdr_State_Abrvtn", "Rfrg_Prvdr_State_Abrvtn", "practicestate",
  "ENROLLMENT STATE",
];

// Parse a comma/space/semicolon-separated filter string (or array) into a
// trimmed, de-duplicated list. A state spelled out ("New York", "District of
// Columbia") stays one item instead of being split at its spaces. Exported for
// unit testing.
export function parseFilterList(value: unknown): string[] {
  if (Array.isArray(value)) return [...new Set(value.map((v) => String(v).trim()).filter(Boolean))];
  const items: string[] = [];
  for (const segment of String(value ?? "").split(/[,;\n]+/)) {
    const words = segment.split(/\s+/).filter(Boolean);
    for (let i = 0; i < words.length;) {
      // The longest run of words that names a state (up to "Northern Mariana Islands"), else the word alone.
      let take = 1;
      for (let n = Math.min(3, words.length - i); n >= 2; n -= 1) {
        if (stateCodeOf(words.slice(i, i + n).join(" "))) { take = n; break; }
      }
      items.push(words.slice(i, i + take).join(" "));
      i += take;
    }
  }
  return [...new Set(items)];
}

/**
 * The state a CMS row belongs to: its own state column, else the state its CCN was issued in or its FIPS code
 * names (Hospital Service Area, facility affiliations and Medicare Geographic Variation have no state column).
 * Null when it names none, as in Order & Referring, which is keyed by NPI alone. Exported for unit testing.
 */
export function stateOfRow(row: any): string | null {
  const raw = String(firstField(row, FILTER_STATE_FIELDS) ?? "").trim();
  if (raw) return stateCodeOf(raw) ?? raw.toUpperCase();
  return derivedStateOf(row);
}

// Build a row predicate from the optional npi_filter / state_filter inputs, or
// null when neither is set (so callers can skip filtering entirely). NPIs are
// compared digits-only; states case-insensitively. `stateOptional` is for files
// whose state_filter names the file's own state (a state licensing export has no
// state column): a row that carries a state must match, a row without one takes
// the filter's, instead of every such row being dropped. Exported for unit testing.
export function buildImportRowFilter(
  npiFilter: unknown,
  stateFilter: unknown,
  opts: { stateOptional?: boolean } = {},
): ((row: any) => boolean) | null {
  const npis = new Set(
    parseFilterList(npiFilter).map((s) => s.replace(/\D/g, "")).filter(Boolean),
  );
  // A state may be written as a code or spelled out, in the filter and in the file.
  const states = new Set(parseFilterList(stateFilter).map((s) => stateCodeOf(s) ?? s.toUpperCase()));
  if (npis.size === 0 && states.size === 0) return null;
  return (row: any) => {
    if (npis.size > 0) {
      const npi = String(firstField(row, FILTER_NPI_FIELDS) ?? "").replace(/\D/g, "");
      if (!npi || !npis.has(npi)) return false;
    }
    if (states.size > 0) {
      const st = stateOfRow(row) ?? "";
      if (st ? !states.has(st) : !opts.stateOptional) return false;
    }
    return true;
  };
}

// The CMS "Physician Shared Patient Patterns" (PSPP) dataset records pairs of
// providers who shared the same Medicare beneficiaries within a time window
// (30/60/90/180 days). Each row is a directed edge with claim-pair and
// beneficiary counts; we store it in cms_referrals. It is not a confirmed
// referral.
//
// The FOIA file is headerless, five comma-separated fields:
//   npi1, npi2, paircount, benecount, samedaycount
// (counts are space-padded). A headed CSV may use those names or the older
// npi_1 / pair_count aliases. csvRecords names a headerless file when asked.
/**
 * Normalize a physician shared-patient-pattern row into the shape used for `cms_referrals`.
 *
 * @param row - Raw input record (CSV/JSON). Official FOIA names (`npi1`, `paircount`, `benecount`, `samedaycount`) and the older aliases are accepted. The original row is preserved on `raw_data`, with `same_day` and `days` added when they are known.
 * @param year - Numeric data year to populate `data_year`.
 * @param batchId - Import batch identifier stored as `import_batch_id`.
 * @param windowDays - The file's window (30/60/90/180) when the row itself doesn't say, usually taken from the file name.
 * @returns An object with:
 *  - `npi` — first provider NPI (trimmed string or `null`),
 *  - `referred_to_npi` — second provider NPI (trimmed string or `null`),
 *  - `referred_to_name` — always `null` (placeholder),
 *  - `total_referrals` — claim-pair count if present, otherwise the beneficiary count (`number` or `null`),
 *  - `total_beneficiaries` — beneficiary count (`number` or `null`),
 *  - `data_year` — stringified `year`,
 *  - `raw_data` — the original input `row`, plus `same_day` / `days` when known,
 *  - `import_batch_id` — stringified `batchId`.
 */
export function mapSharedPatientPatternRow(row: any, year: number, batchId: number, windowDays?: number | null) {
  const npi = firstField(row, ["npi_1", "NPI_1", "npi1", "NPI1", "from_npi", "FROM_NPI", "src_npi", "referring_npi", "provider_1_npi", "npi", "NPI"]);
  const referredToNpi = firstField(row, ["npi_2", "NPI_2", "npi2", "NPI2", "to_npi", "TO_NPI", "dst_npi", "referred_npi", "paired_npi", "provider_2_npi"]);
  const referrals = toIntOrNull(firstField(row, ["transaction_count", "TRANSACTION_COUNT", "transactions", "paircount", "PAIRCOUNT", "pair_count", "PAIR_COUNT", "shared_count", "referral_count", "count", "COUNT", "total_referrals"]));
  const beneficiaries = toIntOrNull(firstField(row, ["benecount", "BENECOUNT", "bene_count", "BENE_COUNT", "beneficiary_count", "unique_bene_count", "patient_count", "shared_patient_count", "benes", "total_beneficiaries"]));
  const sameDay = toIntOrNull(firstField(row, ["samedaycount", "SAMEDAYCOUNT", "same_day_count", "SAME_DAY_COUNT", "same_day", "SAME_DAY"]));
  const days = toIntOrNull(firstField(row, ["days", "DAYS"])) ?? (windowDays == null ? null : windowDays);
  const extra: Record<string, number> = {};
  if (sameDay != null && row?.same_day == null && row?.SAME_DAY == null) extra.same_day = sameDay;
  if (days != null && row?.days == null && row?.DAYS == null) extra.days = days;
  return {
    npi: npi != null ? String(npi).trim().slice(0, 20) : null,
    referred_to_npi: referredToNpi != null ? String(referredToNpi).trim().slice(0, 20) : null,
    referred_to_name: null as string | null,
    // Consumers order by total_referrals, so fall back to the shared-beneficiary
    // count when a distinct encounter/transaction count isn't published.
    total_referrals: referrals != null ? referrals : beneficiaries,
    total_beneficiaries: beneficiaries,
    data_year: String(year),
    raw_data: Object.keys(extra).length ? { ...row, ...extra } : row,
    import_batch_id: String(batchId),
  };
}

/** 30, 60, 90, or 180 when the FOIA file name says which window it is. */
export function sharedPatientWindowDays(fileUrl: unknown): number | null {
  if (typeof fileUrl !== "string") return null;
  const named = /days[-_]?(\d{2,3})/i.exec(fileUrl);
  const nber = /[_-](30|60|90|180)[_-]csv/i.exec(fileUrl);
  const n = Number((named || nber)?.[1]);
  return n === 30 || n === 60 || n === 90 || n === 180 ? n : null;
}

/**
 * Care Compare's hospital files name a hospital by `facility_id`, its CMS Certification Number, and have no other
 * id column. Without it a row has no provider_id: the Hospitals list skips it and its Facility page can't be opened.
 */
const HOSPITAL_FACILITY_ID_TYPES: ReadonlySet<string> = new Set([
  "hospital_general_info", "hospital_readmissions", "hospital_complications", "hospital_infections", "hospital_value_based_purchasing",
  "hospital_hcahps_survey", "hospital_timely_effective_care", "hospital_unplanned_visits", "hospital_imaging_efficiency",
  "hospital_spending_per_beneficiary", "hospital_spending_by_claim", "hospital_hac_reduction",
]);

/** The All Owners files (one row per owner or manager of an enrollment), which share one column layout. */
const OWNER_FILE_TYPES: ReadonlySet<string> = new Set([
  "hospital_all_owners", "home_health_all_owners", "hospice_all_owners", "snf_all_owners", "fqhc_all_owners", "rural_health_clinic_all_owners",
]);

/** Home Infusion Therapy Providers: the columns that tell one location of an enrollment from another. */
const HOME_INFUSION_LOCATION_COLUMNS = [
  "Street Address Line 1", "Street Address Line 2", "Specialty Name", "Geographic Location Type Description",
  "Geographic Location City Name", "Geographic Location State Code", "Geographic Location ZIP Code", "State County Name",
];

const cell = (v: unknown): string => String(v ?? "").trim();

/** A short stable key for the columns that identify a row, for datasets with no single id column (provider_id holds 50 characters). */
function identityHash(parts: unknown[], length = 12): string {
  return createHash("sha1").update(parts.map((p) => cell(p).toLowerCase()).join("\u001f")).digest("hex").slice(0, length);
}

/**
 * Compute a stable statistical identifier for a dataset row based on the dataset's import type.
 *
 * The returned identifier is derived from one or more dataset fields according to the import type
 * and is truncated to 50 characters. If no suitable identifier can be derived, returns `null`.
 *
 * @param row - The raw dataset row object (provider/measure/record fields vary by dataset)
 * @param importType - The internal import type key that determines which row fields to use
 * @param index - Optional ordinal index of the row (may be used by some import types or as a fallback)
 * @returns The derived identifier string truncated to 50 characters, or `null` if none could be derived
 */
function deriveStatisticalId(row: any, importType: string, index?: number): string | null {
  let id: string | null = null;
  if (OWNER_FILE_TYPES.has(importType) && row["ENROLLMENT ID"]) {
    // One row per owner or manager role of an enrollment. The keys below read NPI and ASSOCIATE_ID, which these
    // files don't have, so a row fell back to its organization's name and each organization kept one owner row.
    id = [row["ENROLLMENT ID"], row["ASSOCIATE ID - OWNER"], row["ROLE CODE - OWNER"]].map(cell).join("_");
  } else if (importType === "home_infusion_therapy" && row["Enrollment ID"]) {
    // One row per enrollment and rendering area or location: the location columns tell them apart.
    id = `${cell(row["Enrollment ID"])}_${identityHash(HOME_INFUSION_LOCATION_COLUMNS.map((k) => row[k]))}`;
  } else if (importType === "aco_reach_providers" && row.aco_id) {
    // One row per participant, class and start date within a performance year; no column is a participant id.
    // The term date, capitation, APO election and waiver flags are left out of the key: they can change when CMS
    // re-publishes a release (the 2024 file was), and a changed value must refresh the stored row, not add a second
    // one beside the stale one. The public file has no TIN, so rows of one organization that differ only in those
    // columns (about 2% of the distinct rows of the 2024 file) share a key and the first one read is kept.
    id = `${cell(row.aco_id)}_${cell(row.perf_year)}_${identityHash([row.par_lbn, row.prvdr_class, row.start_date])}`;
  } else if (importType === "aco_snf_affiliates" && row.ACO_ID && row.Aff_LBN) {
    id = `${cell(row.ACO_ID)}_${identityHash([row.Aff_LBN])}`;
  } else if ((importType === "nursing_home_chains" || importType === "nursing_home_chain_performance") && row["Chain ID"]) {
    id = cell(row["Chain ID"]);
  } else if (importType === "mds_frequency" && row["MDS Item Question/Description"]) {
    // The state-level file (one row per place, quarter, item and response), not the facility-level one.
    id = identityHash([row["Geographical Location"], row["Report Date"], row["MDS Item Question/Description"], row["MDS Item Response"]], 16);
  } else if (importType === "medicare_telehealth_trends" && row.Bene_Geo_Desc) {
    id = identityHash([row.Year, row.Quarter, row.Bene_Geo_Desc, row.Bene_Mdcd_Mdcr_Enrl_Stus, row.Bene_Race_Desc, row.Bene_Sex_Desc, row.Bene_Mdcr_Entlmt_Stus, row.Bene_Age_Desc, row.Bene_RUCA_Desc], 16);
  } else if (importType === "medicare_spending_by_drug_d" || importType === "medicare_spending_by_drug_b") {
    id = row.Brnd_Name || row.Gnrc_Name || row.HCPCS_Cd || null;
  } else if (importType === "medicare_monthly_enrollment") {
    id = [row.YEAR, row.MONTH, row.BENE_STATE_ABRVTN].filter(Boolean).join("_") || null;
  } else if (importType === "market_saturation_county") {
    const svc = (row.type_of_service || "").substring(0, 15);
    id = [row.state_fips, row.county_fips, svc].filter(Boolean).join("_") || null;
  } else if (importType === "market_saturation_cbsa") {
    const svc = (row.type_of_service || "").substring(0, 15);
    id = [row.cbsa, svc].filter(Boolean).join("_") || null;
  } else if (importType === "provider_taxonomy_crosswalk") {
    id = [row["MEDICARE SPECIALTY CODE"], row["PROVIDER TAXONOMY CODE"]].filter(Boolean).join("_") || null;
  } else if (importType === "hospital_price_transparency") {
    id = row.Case_ID || null;
  } else if (importType === "medicare_part_d_prescribers") {
    id = row.Prscrbr_NPI || row.PRSCRBR_NPI || null;
  } else if (importType === "medicare_fee_for_service_enrollment") {
    id = [row.YEAR, row.BENE_STATE_ABRVTN].filter(Boolean).join("_") || null;
  } else if (importType === "medicare_irf_utilization" || importType === "medicare_ltch_utilization") {
    id = row.CCN || row.ccn || row.Provider_ID || row.provider_id || null;
  } else if (importType === "hospice_state_measures" || importType === "home_health_state_measures") {
    id = [row.state, row.measure_code].filter(Boolean).join("_") || null;
  } else if (importType === "hospice_national_measures") {
    id = row.measure_code || null;
  } else if (importType === "home_health_national_measures") {
    id = row.country || "nation";
  } else if (importType === "hospital_service_area") {
    id = [row.MEDICARE_PROV_NUM, row.ZIP_CD_OF_RESIDENCE].filter(Boolean).join("_") || null;
  } else if (importType === "medicare_hha_utilization") {
    id = row.PRVDR_ID || null;
  } else if (importType === "clinician_national_file" || importType === "clinician_mips_performance" || importType === "clinician_mips_measures") {
    id = row.npi || row.NPI || null;
  } else if (importType === "clinician_group_measures" || importType === "clinician_group_experience") {
    id = row.org_pac_id || row.Org_PAC_ID || null;
  } else if (HOSPITAL_FACILITY_ID_TYPES.has(importType)) {
    id = row.facility_id || row.Facility_ID || row.provider_id || row.Provider_ID || null;
  } else if (importType === "hospital_psychiatric_facility" || importType === "ambulatory_surgical_center" || importType === "hospital_joint_replacement") {
    id = row.cms_certification_number_ccn || row.facility_id || row.ccn || null;
  } else if (importType === "home_health_patient_survey" || importType === "home_health_zip_data") {
    id = row.cms_certification_number_ccn || row.provider_id || null;
  } else if (importType === "hospice_zip_data") {
    id = row.cms_certification_number_ccn || row.ccn || null;
  } else if (importType === "nursing_home_ownership" || importType === "nursing_home_fire_safety" || importType === "nursing_home_health_deficiencies" || importType === "nursing_home_mds_quality" || importType === "nursing_home_claims_quality" || importType === "snf_quality_reporting") {
    id = row.federal_provider_number || row.provider_id || row.provnum || null;
  } else if (importType === "inpatient_rehab_general_info" || importType === "inpatient_rehab_provider_data" || importType === "long_term_care_general_info" || importType === "long_term_care_provider_data") {
    id = row.cms_certification_number_ccn || row.ccn || null;
  } else if (importType === "facility_affiliation") {
    id = [row.npi || row.NPI, row.facility_ccn || row.pac_id_of_organizational_healthcare_provider].filter(Boolean).join("_") || null;
  } else if (importType === "home_health_vbp") {
    id = row.cms_certification_number_ccn || row.ccn || row.provider_id || null;
  } else if (importType === "snf_vbp_facility") {
    id = row.cms_certification_number_ccn || row.ccn || row.provider_id || null;
  } else if (importType === "rural_health_clinic_enrollments" || importType === "rural_health_clinic_all_owners") {
    id = row.NPI || row.npi || row.ENROLLMENT_ID || null;
  } else if (importType === "nursing_home_chain_performance") {
    id = row.organization_id || row.chain_id || null;
  } else if (importType === "medicare_geographic_variation") {
    id = [row.YEAR, row.BENE_GEO_LVL, row.BENE_GEO_CD].filter(Boolean).join("_") || null;
  } else if (importType === "pbj_daily_nurse_staffing" || importType === "pbj_daily_nonnurse_staffing") {
    id = [row.PROVNUM || row.provnum, row.WorkDate || row.WORKDATE].filter(Boolean).join("_") || null;
  } else if (importType === "snf_enrollments") {
    id = row.NPI || row.npi || row.ENROLLMENT_ID || null;
  } else if (importType === "snf_all_owners" || importType === "fqhc_all_owners") {
    id = [row.NPI || row.npi, row.ASSOCIATE_ID || row.associate_id].filter(Boolean).join("_") || null;
  } else if (importType === "snf_cost_report") {
    id = row.PRVDR_NUM || row.prvdr_num || row.RPT_REC_NUM || null;
  } else if (importType === "aco_participants") {
    id = [row.ACO_ID, row.NPI || row.TIN].filter(Boolean).join("_") || null;
  } else if (importType === "aco_organizations") {
    id = row.ACO_ID || row.aco_id || null;
  } else if (importType === "aco_financial_results") {
    id = [row.ACO_ID, row.PY || row.PERFORMANCE_YEAR].filter(Boolean).join("_") || null;
  } else if (importType === "medicare_telehealth_trends") {
    id = [row.YEAR, row.BENE_STATE_ABRVTN || row.STATE, row.HCPCS_CD].filter(Boolean).join("_") || null;
  } else if (importType === "snf_utilization_geo_casemix" || importType === "hha_utilization_geo_casemix") {
    id = [row.PRVDR_ID || row.CCN, row.GEO_CD || row.STATE, row.CASEMIX_GRP || row.HH_PDGM_GRP].filter(Boolean).join("_") || null;
  } else if (importType === "ltc_facility_characteristics") {
    id = row.PROVNUM || row.provnum || row.FEDERAL_PROVIDER_NUMBER || null;
  } else if (importType === "mds_frequency") {
    id = [row.PROVNUM || row.provnum, row.MEASURE_CODE || row.measure_code].filter(Boolean).join("_") || null;
  }
  return id ? id.substring(0, 50) : null;
}

function deriveStatisticalName(row: any, importType: string): string | null {
  if (importType === "home_infusion_therapy") return row["Legal Business Name"] || null;
  if (importType === "aco_reach_providers") return row.par_lbn || null;
  if (importType === "aco_snf_affiliates") return row.Aff_LBN || null;
  if (importType === "nursing_home_chains" || importType === "nursing_home_chain_performance") return row.Chain || null;
  if (importType === "mds_frequency") return row["MDS Item Question/Description"] || null;
  if (importType === "medicare_telehealth_trends") return [row.Bene_Geo_Desc, row.Year, row.Quarter].filter(Boolean).join(" ") || null;
  if (importType === "medicare_spending_by_drug_d" || importType === "medicare_spending_by_drug_b") {
    return [row.Brnd_Name, row.Gnrc_Name, row.HCPCS_Desc].filter(Boolean).join(" — ") || null;
  }
  if (importType === "medicare_monthly_enrollment") {
    return [row.BENE_STATE_DESC, row.BENE_COUNTY_DESC, row.YEAR, row.MONTH].filter(Boolean).join(" ") || null;
  }
  if (importType === "market_saturation_county") {
    return [row.type_of_service, row.state, row.county].filter(Boolean).join(" — ") || null;
  }
  if (importType === "market_saturation_cbsa") {
    return [row.type_of_service, row.cbsatitle].filter(Boolean).join(" — ") || null;
  }
  if (importType === "provider_taxonomy_crosswalk") {
    return [row["MEDICARE PROVIDER/SUPPLIER TYPE DESCRIPTION"], row["PROVIDER TAXONOMY DESCRIPTION:  TYPE, CLASSIFICATION, SPECIALIZATION"]].filter(Boolean).join(" — ") || null;
  }
  if (importType === "hospital_price_transparency") {
    return row.Hosp_Name || null;
  }
  if (importType === "medicare_part_d_prescribers") {
    return [row.Prscrbr_Last_Org_Name, row.Prscrbr_First_Name].filter(Boolean).join(", ") || null;
  }
  if (importType === "hospice_state_measures" || importType === "home_health_state_measures") {
    return [row.state, row.measure_name || row.measure_code].filter(Boolean).join(" — ") || null;
  }
  if (importType === "hospice_national_measures") {
    return row.measure_name || row.measure_code || null;
  }
  if (importType === "home_health_national_measures") {
    return row.country || "National Measures";
  }
  if (importType === "hospital_service_area") {
    return [row.MEDICARE_PROV_NUM, row.ZIP_CD_OF_RESIDENCE].filter(Boolean).join(" — ZIP ") || null;
  }
  if (importType === "medicare_hha_utilization") {
    return row.PRVDR_NAME || null;
  }
  if (importType === "clinician_national_file") {
    return [row.provider_last_name, row.provider_first_name].filter(Boolean).join(", ") || null;
  }
  if (importType === "clinician_mips_performance" || importType === "clinician_mips_measures") {
    return [row.provider_last_name, row.provider_first_name].filter(Boolean).join(", ") || null;
  }
  if (importType === "clinician_group_measures" || importType === "clinician_group_experience") {
    return row.org_name || row.group_name || null;
  }
  if (importType === "hospital_hcahps_survey" || importType === "hospital_timely_effective_care" || importType === "hospital_unplanned_visits" || importType === "hospital_imaging_efficiency" || importType === "hospital_spending_per_beneficiary" || importType === "hospital_spending_by_claim" || importType === "hospital_hac_reduction" || importType === "hospital_joint_replacement") {
    return row.facility_name || row.hospital_name || null;
  }
  if (importType === "hospital_psychiatric_facility" || importType === "ambulatory_surgical_center") {
    return row.facility_name || row.provider_name || null;
  }
  if (importType === "home_health_patient_survey" || importType === "home_health_zip_data") {
    return row.provider_name || row.facility_name || null;
  }
  if (importType === "hospice_zip_data") {
    return row.provider_name || row.facility_name || null;
  }
  if (importType === "nursing_home_ownership" || importType === "nursing_home_fire_safety" || importType === "nursing_home_health_deficiencies" || importType === "nursing_home_mds_quality" || importType === "nursing_home_claims_quality" || importType === "snf_quality_reporting") {
    return row.provider_name || row.facility_name || null;
  }
  if (importType === "inpatient_rehab_general_info" || importType === "inpatient_rehab_provider_data") {
    return row.provider_name || row.facility_name || null;
  }
  if (importType === "long_term_care_general_info" || importType === "long_term_care_provider_data") {
    return row.provider_name || row.facility_name || null;
  }
  if (importType === "facility_affiliation") {
    return [row.clinician_last_name || row.provider_last_name, row.clinician_first_name || row.provider_first_name].filter(Boolean).join(", ") || row.facility_name || null;
  }
  if (importType === "home_health_vbp" || importType === "snf_vbp_facility") {
    return row.provider_name || row.facility_name || null;
  }
  if (importType === "rural_health_clinic_enrollments" || importType === "rural_health_clinic_all_owners") {
    return row["ORGANIZATION NAME"] || row.organization_name || row.FIRST_NAME || null;
  }
  if (importType === "nursing_home_chain_performance") {
    return row.organization_name || row.chain_name || null;
  }
  if (importType === "medicare_geographic_variation") {
    return [row.BENE_GEO_DESC, row.YEAR].filter(Boolean).join(" ") || null;
  }
  if (importType === "pbj_daily_nurse_staffing" || importType === "pbj_daily_nonnurse_staffing") {
    return row.PROVNAME || row.provname || null;
  }
  if (importType === "snf_enrollments") {
    return row["ORGANIZATION NAME"] || row.organization_name || null;
  }
  if (importType === "snf_all_owners" || importType === "fqhc_all_owners") {
    return row["ORGANIZATION NAME"] || row.organization_name || row.FIRST_NAME || null;
  }
  if (importType === "snf_cost_report") {
    return row.PRVDR_NAME || row.HOSPITAL_NAME || null;
  }
  if (importType === "aco_participants") {
    return row.ACO_NAME || row.PROVIDER_NAME || null;
  }
  if (importType === "aco_organizations") {
    return row.ACO_NAME || row.ACO_Legal_Name || null;
  }
  if (importType === "aco_financial_results") {
    return row.ACO_NAME || row.ACO_Legal_Name || null;
  }
  if (importType === "medicare_telehealth_trends") {
    return [row.HCPCS_DESC, row.BENE_STATE_DESC || row.STATE].filter(Boolean).join(" — ") || null;
  }
  if (importType === "snf_utilization_geo_casemix" || importType === "hha_utilization_geo_casemix") {
    return row.PRVDR_NAME || row.PROVIDER_NAME || row.GEO_DESC || null;
  }
  if (importType === "ltc_facility_characteristics") {
    return row.PROVNAME || row.provname || row.FACILITY_NAME || null;
  }
  if (importType === "mds_frequency") {
    return row.PROVNAME || row.provname || row.FACILITY_NAME || null;
  }
  return null;
}

// The year a dataset row describes: the row's own year column when the
// dataset carries one, else the year the import resolved for the dataset.
const ROW_YEAR_COLUMNS = ["YEAR", "Year", "year", "data_year", "DATA_YEAR", "Rpt_Year", "RPT_YEAR", "FISCAL_YEAR", "fiscal_year", "Fiscal_Year", "PERFORMANCE_YEAR", "PY"];
export function rowDataYear(row: any, fallbackYear?: number | string | null): string | null {
  for (const col of ROW_YEAR_COLUMNS) {
    const v = row?.[col];
    const m = v == null ? null : /^\s*(\d{4})/.exec(String(v));
    if (m) return m[1];
  }
  return fallbackYear != null && String(fallbackYear).trim() ? String(fallbackYear).trim().slice(0, 10) : null;
}

/** The Care Compare column holding a facility's overall star rating, for the datasets that have one the lists can show. */
const OVERALL_RATING_COLUMN: Record<string, string> = {
  nursing_home_providers: "overall_rating",
  hospital_general_info: "hospital_overall_rating",
  home_health_agencies: "quality_of_patient_care_star_rating",
};

/** Home health ratings move in half stars (1, 1.5, …, 5). Nursing homes and hospitals stay whole stars. */
const HALF_STAR_TYPES = new Set(["home_health_agencies"]);

/** Whether a dataset's facility rows carry a star rating (so a refresh replaces it, blank or not). */
export function hasStarRating(importType: unknown): boolean {
  return typeof importType === "string" && Object.hasOwn(OVERALL_RATING_COLUMN, importType);
}

/**
 * A facility's overall star rating (1 to 5) for the Facilities lists, or null: "Not Available" and a blank are not
 * ratings. Home health accepts half stars; a hospital or nursing home rated 3.5 is not a rating we can store as a whole star.
 */
export function starRatingOf(row: any, importType: string): number | null {
  if (!hasStarRating(importType)) return null;
  const n = Number(String(row?.[OVERALL_RATING_COLUMN[importType]] ?? "").trim());
  if (!Number.isFinite(n) || n < 1 || n > 5) return null;
  if (HALF_STAR_TYPES.has(importType)) return Number.isInteger(n * 2) ? n : null;
  return Number.isInteger(n) ? n : null;
}

export function mapMedicareFacilityRow(row: any, importType: string, batchId: number, year?: number | string | null) {
  const statId = deriveStatisticalId(row, importType);
  const statName = deriveStatisticalName(row, importType);

  const mapped: any = {
    facility_type: importType,
    data_year: rowDataYear(row, year),
    provider_id:
      row.cms_certification_number_ccn ||
      row["CMS Certification Number"] || row.CMS_Certification_Number ||
      row["Provider CCN"] || row.Rndrng_Prvdr_CCN ||
      row.CCN || row.ccn ||
      row.provider_id || row["Provider ID"] ||
      row.NPI || row.npi || row.Prscrbr_NPI || row.PRSCRBR_NPI ||
      row.Rndrng_NPI || row.Suplr_NPI || row.Rfrg_NPI ||
      row.PRVDR_ID || row.MEDICARE_PROV_NUM || row.Case_ID ||
      statId ||
      null,
    facility_name:
      row.facility_name || row["Facility Name"] || row.Facility_Name ||
      row.provider_name || row["Provider Name"] || row.Provider_Name ||
      row["Hospital Name"] || row.Rndrng_Prvdr_Org_Name ||
      row["ORGANIZATION NAME"] || row.organization_name ||
      row.businessname || row.practicename ||
      row["DOING BUSINESS AS NAME"] ||
      row.Rndrng_Prvdr_Last_Org_Name || row.Suplr_Prvdr_Last_Name_Org || row.Rfrg_Prvdr_Last_Name_Org ||
      row.Prscrbr_Last_Org_Name || row.Hosp_Name ||
      row.PRVDR_NAME || row["HHA Name"] ||
      statName ||
      null,
    address:
      row.address_line_1 || row["Address Line 1"] || row.Address_Line_1 ||
      row["ADDRESS LINE 1"] ||
      row["Street Address"] || row["Street Address Line 1"] || row.Rndrng_Prvdr_St ||
      row.provider_address || row["Provider Address"] ||
      row.practiceaddress1 ||
      row.Rndrng_Prvdr_St1 || row.Suplr_Prvdr_St1 || row.Rfrg_Prvdr_St1 ||
      row.Prscrbr_St1 || row.Hosp_Address ||
      row.address ||
      null,
    city:
      row.citytown || row["City/Town"] ||
      row.City || row.CITY || row.city ||
      row.Rndrng_Prvdr_City ||
      row.practicecity ||
      row.Suplr_Prvdr_City || row.Rfrg_Prvdr_City ||
      row.Prscrbr_City ||
      row.PRVDR_CITY ||
      null,
    state: (
      row.state || row.State || row.STATE ||
      row["State Code"] || row.Rndrng_Prvdr_State_Abrvtn ||
      row.Prscrbr_State_Abrvtn ||
      row.BENE_STATE_ABRVTN ||
      row["ENROLLMENT STATE"] ||
      row.practicestate ||
      row.Suplr_Prvdr_State_Abrvtn || row.Rfrg_Prvdr_State_Abrvtn ||
      null
    ),
    zip: (
      row.zip_code || row["Zip Code"] || row["ZIP Code"] || row.Zip_Code ||
      row["ZIP CODE"] || row.ZIP_CODE ||
      row.Rndrng_Prvdr_Zip5 ||
      row.practicezip9code ||
      row.Suplr_Prvdr_Zip5 || row.Rfrg_Prvdr_Zip5 ||
      row.PRVDR_ZIP ||
      null
    ),
    quality_rating: starRatingOf(row, importType),
    raw_data: row,
    import_batch_id: String(batchId),
  };

  // The by-provider inpatient file is one row per hospital. Those totals are what the hospital list shows;
  // a Care Compare refresh must not be the thing that writes them (see refreshFacilityRows).
  if (importType === "medicare_inpatient_by_provider") {
    mapped.total_discharges = int(row.Tot_Dschrgs);
    mapped.total_days_of_care = int(row.Tot_Cvrd_Days ?? row.Tot_Days);
    mapped.total_charges = num(row.Tot_Submtd_Cvrd_Chrg);
    mapped.total_payments = num(row.Tot_Mdcr_Pymt_Amt);
  }

  if (mapped.state && mapped.state.length > 10) mapped.state = mapped.state.substring(0, 10);
  if (mapped.zip && mapped.zip.length > 20) mapped.zip = mapped.zip.substring(0, 20);
  if (mapped.provider_id && mapped.provider_id.length > 50) mapped.provider_id = mapped.provider_id.substring(0, 50);

  return mapped;
}
