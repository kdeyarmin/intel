import { createHash } from "crypto";
import { db, pool } from "../db";
import { importBatches, dataQualityAlerts, cmsReferrals, cmsOrderReferring, providerServiceUtilization, medicareFacilities, medicareFacilitiesRaw } from "../db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { handleImportNPPESFlatFile } from "./importNPPESFlatFile";
import { CMS_NATURAL_KEYS, partition, partitionRefresh, distinctValues } from "./cmsUpsert";
import { settleBatchCompletion } from "../lib/importCompletion";
import { mergeRetryParams, endedWithoutFinishing } from "../lib/importProgress";
import { STALLED_AFTER_MS } from "../lib/scheduling";
import { markImportFinished, markImportStarted, resolveImportVersion } from "../lib/datasetRegistry";
import { sourceForUrl } from "../lib/cmsCatalog";
import { csvSourceRecords, isLocalUpload, sourceKindFor } from "../lib/importSources";
import { looksLikeSharedPatientLine, pageRecords, SHARED_PATIENT_FOIA_HEADERS } from "../lib/csv";
import { CERTIFICATION_HCPCS, TYPED_ROUTES, int, mapTypedRows, num } from "./cmsTypedTables";
import { NPPES_FILE_TYPES } from "./importNPPESFile";
import { resolveNppesFile, classifyNppesLink } from "../lib/nppesFiles";
import { recordSourceFile } from "../lib/datasetRegistry";
import { getTableColumns } from "drizzle-orm";
import { safeFetchStream, SafeFetchError } from "../lib/safeFetch";
import { stateCodeOf } from "../lib/stateNames";
import { derivedStateOf, stateFilterUnsupportedMessage, stateProbe } from "../lib/rowState";

// Shared with the NPPES file importer; re-exported for the callers that import them from here.
export { mergeRetryParams, endedWithoutFinishing };

// Row-mapping helpers live in ./triggerImportRows; they are re-exported here
// so the callers and tests that import them from this module keep working.
export { buildImportRowFilter, hasStarRating, mapCMSOrderReferringRow, mapCMSUtilizationRow, mapMedicareFacilityRow, mapSharedPatientPatternRow, parseFilterList, rowDataYear, sharedPatientWindowDays, starRatingOf, stateOfRow } from "./triggerImportRows";
import { buildImportRowFilter, hasStarRating, mapCMSOrderReferringRow, mapCMSUtilizationRow, mapMedicareFacilityRow, mapSharedPatientPatternRow, parseFilterList, sharedPatientWindowDays, stateOfRow } from "./triggerImportRows";

const LOOKUP_PRIMARY_BATCH_SIZE = 100;

export const IMPORT_TYPE_ALIASES: Record<string, string> = {
  cms_utilization: "provider_service_utilization",
};

// The by-provider-and-service file has ~10M rows; the referral view needs only the home health certification and
// care plan oversight codes (~27K rows), which CMS filters server-side, so those imports read a few pages.
const CERTIFICATION_QUERY = [
  ["filter[p][condition][path]", "HCPCS_Cd"],
  ["filter[p][condition][operator]", "IN"],
  ...CERTIFICATION_HCPCS.map((code) => ["filter[p][condition][value][]", code]),
].map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");

/** Query parameters an import type adds to whatever data URL it resolves (the registry's newest release or the pin). */
const IMPORT_TYPE_QUERY: Record<string, string> = {
  physician_certifications: CERTIFICATION_QUERY,
};

/** The URL with its import type's own query added, once. */
export function withImportQuery(importType: string, url: string | null | undefined): string | null {
  const query = Object.hasOwn(IMPORT_TYPE_QUERY, importType) ? IMPORT_TYPE_QUERY[importType] : null;
  if (!url || !query || url.includes(query)) return url ?? null;
  return `${url}${url.includes("?") ? "&" : "?"}${query}`;
}

// Pinned endpoints. data.cms.gov gives each yearly release its own dataset id,
// so these go stale: handleTriggerImport prefers the newest version the
// registry resolved (server/lib/datasetRegistry.ts) and uses these as the
// fallback and as the key the catalog check starts from.
export const IMPORT_TYPE_URLS: Record<string, string> = {
  provider_service_utilization: "https://data.cms.gov/data-api/v1/dataset/92396110-2aed-4d63-a6a2-5d6207d46a29/data",
  // The same dataset, read for the certification codes only (see CERTIFICATION_QUERY).
  physician_certifications: `https://data.cms.gov/data-api/v1/dataset/92396110-2aed-4d63-a6a2-5d6207d46a29/data?${CERTIFICATION_QUERY}`,
  cms_order_referring: "https://data.cms.gov/data-api/v1/dataset/c99b5865-1119-4436-bb80-c5af2773ea1f/data",
  home_health_enrollments: "https://data.cms.gov/data-api/v1/dataset/15f64ab4-3172-4a27-b589-ebd67a6d28aa/data",
  hospice_enrollments: "https://data.cms.gov/data-api/v1/dataset/25704213-e833-4b8b-9dbc-58dd17149209/data",
  medical_equipment_suppliers: "https://data.cms.gov/provider-data/api/1/datastore/query/ct36-nrcq/0",
  hospice_provider_measures: "https://data.cms.gov/provider-data/api/1/datastore/query/gxki-hrr8/0",
  hospice_state_measures: "https://data.cms.gov/provider-data/api/1/datastore/query/eda0-92f0/0",
  hospice_national_measures: "https://data.cms.gov/provider-data/api/1/datastore/query/7cv8-v37d/0",
  snf_provider_measures: "https://data.cms.gov/provider-data/api/1/datastore/query/fykj-qjee/0",
  nursing_home_providers: "https://data.cms.gov/provider-data/api/1/datastore/query/4pq5-n9py/0",
  nursing_home_deficiencies: "https://data.cms.gov/provider-data/api/1/datastore/query/tbry-pc2d/0",
  home_health_national_measures: "https://data.cms.gov/provider-data/api/1/datastore/query/97z8-de96/0",
  hospital_enrollments: "https://data.cms.gov/data-api/v1/dataset/f6f6505c-e8b0-4d57-b258-e2b94133aaf2/data",
  hospital_all_owners: "https://data.cms.gov/data-api/v1/dataset/029c119f-f79c-49be-9100-344d31d10344/data",
  hospital_cost_report: "https://data.cms.gov/data-api/v1/dataset/44060663-47d8-4ced-a115-b53b4c270acb/data",
  hospital_service_area: "https://data.cms.gov/data-api/v1/dataset/8708ca8b-8636-44ed-8303-724cbfaf78ad/data",
  hospital_general_info: "https://data.cms.gov/provider-data/api/1/datastore/query/xubh-q36u/0",
  hospital_readmissions: "https://data.cms.gov/provider-data/api/1/datastore/query/9n3s-kdb3/0",
  hospital_complications: "https://data.cms.gov/provider-data/api/1/datastore/query/ynj2-r877/0",
  hospital_infections: "https://data.cms.gov/provider-data/api/1/datastore/query/77hc-ibv8/0",
  hospital_value_based_purchasing: "https://data.cms.gov/provider-data/api/1/datastore/query/ypbt-wvdk/0",
  fqhc_enrollments: "https://data.cms.gov/data-api/v1/dataset/4bcae866-3411-439a-b762-90a6187c194b/data",
  hospice_all_owners: "https://data.cms.gov/data-api/v1/dataset/e983965e-1603-4cb8-82b5-c40090e380d1/data",
  hospice_general_info: "https://data.cms.gov/provider-data/api/1/datastore/query/yc9t-dgbk/0",
  hospice_provider_data: "https://data.cms.gov/provider-data/api/1/datastore/query/252m-zfp9/0",
  home_health_agencies: "https://data.cms.gov/provider-data/api/1/datastore/query/6jpm-sxkc/0",
  home_health_all_owners: "https://data.cms.gov/data-api/v1/dataset/fc009b2d-7846-44b1-b4a1-692f0c143879/data",
  home_health_cost_report: "https://data.cms.gov/data-api/v1/dataset/4999da74-1d8d-4a6f-934e-2d7ea470cc63/data",
  home_health_state_measures: "https://data.cms.gov/provider-data/api/1/datastore/query/tee5-ixt5/0",
  nursing_home_penalties: "https://data.cms.gov/provider-data/api/1/datastore/query/g6vv-u9sr/0",
  inpatient_rehab_general_info: "https://data.cms.gov/provider-data/api/1/datastore/query/7t8x-u3ir/0",
  inpatient_rehab_provider_data: "https://data.cms.gov/provider-data/api/1/datastore/query/v9e4-nwhh/0",
  long_term_care_general_info: "https://data.cms.gov/provider-data/api/1/datastore/query/azum-44iv/0",
  long_term_care_provider_data: "https://data.cms.gov/provider-data/api/1/datastore/query/fp6g-2gsn/0",
  medicare_inpatient_by_provider: "https://data.cms.gov/data-api/v1/dataset/ee6fb1a5-39b9-46b3-a980-a7284551a732/data",
  medicare_outpatient_by_provider: "https://data.cms.gov/data-api/v1/dataset/ccbc9a44-40d4-46b4-a709-5caa59212e50/data",
  medicare_physician_by_provider: "https://data.cms.gov/data-api/v1/dataset/8889d81e-2ee7-448f-8713-f071038289b5/data",
  medicare_dme_by_supplier: "https://data.cms.gov/data-api/v1/dataset/a2d56d3f-3531-4315-9d87-e29986516b41/data",
  medicare_dme_by_referring: "https://data.cms.gov/data-api/v1/dataset/f8603e5b-9c47-4c52-9b47-a4ef92dfada4/data",
  medicare_dme_by_referring_service: "https://data.cms.gov/data-api/v1/dataset/dac96878-a0ee-4cca-8082-a8e11f6ac7ed/data",
  medicare_dme_by_supplier_service: "https://data.cms.gov/data-api/v1/dataset/1dc6718a-e44b-403a-a735-ce01a6233822/data",
  medicare_dme_by_geography_service: "https://data.cms.gov/data-api/v1/dataset/eb336619-c076-4d78-8aee-1a752e206bfa/data",
  medicare_part_d_prescribers: "https://data.cms.gov/data-api/v1/dataset/14d8e8a9-7e9b-4370-a044-bf97c46b4b44/data",
  medicare_snf_utilization: "https://data.cms.gov/data-api/v1/dataset/eaed338b-847e-41b1-a4d3-a206f40dc72b/data",
  medicare_hha_utilization: "https://data.cms.gov/data-api/v1/dataset/43ef03ce-2b60-40a8-958e-146195b5fec7/data",
  medicare_hospice_utilization: "https://data.cms.gov/data-api/v1/dataset/4e73f1b5-82cb-4682-8ad2-28493f0b6840/data",
  medicare_irf_utilization: "https://data.cms.gov/data-api/v1/dataset/0d9eebff-7e23-4b1e-8e29-362eea132df5/data",
  medicare_ltch_utilization: "https://data.cms.gov/data-api/v1/dataset/2935c3fe-b18a-4e39-a0c5-e70573664f19/data",
  medicare_fee_for_service_enrollment: "https://data.cms.gov/data-api/v1/dataset/2457ea29-fc82-48b0-86ec-3b0755de7515/data",
  medicare_monthly_enrollment: "https://data.cms.gov/data-api/v1/dataset/d7fabe1e-d19b-4333-9eff-e80e0643f2fd/data",
  aco_snf_affiliates: "https://data.cms.gov/data-api/v1/dataset/5b227bd9-82d4-4145-86fd-809e02ca7f18/data",
  aco_reach_providers: "https://data.cms.gov/data-api/v1/dataset/e0eba16f-ce0d-4037-96ce-2af70c718c98/data",
  home_infusion_therapy: "https://data.cms.gov/data-api/v1/dataset/31f25ab6-2fe3-4bad-ac5a-90635ed79935/data",
  market_saturation_county: "https://data.cms.gov/data-api/v1/dataset/8900b9c5-50b7-43de-9bdd-0d7113a8355e/data",
  market_saturation_cbsa: "https://data.cms.gov/data-api/v1/dataset/9b0e7798-d945-48fc-9861-d38bb5083a74/data",
  provider_taxonomy_crosswalk: "https://data.cms.gov/data-api/v1/dataset/113eb0bc-0c9a-4d91-9f93-3f6b28c0bf6b/data",
  hospital_price_transparency: "https://data.cms.gov/data-api/v1/dataset/6a3aa708-3c9d-411a-a1a4-e046d3ade7ef/data",
  medicare_spending_by_drug_d: "https://data.cms.gov/data-api/v1/dataset/7e0b4365-fd63-4a29-8f5e-e0ac9f66a81b/data",
  medicare_spending_by_drug_b: "https://data.cms.gov/data-api/v1/dataset/76a714ad-3a2c-43ac-b76d-9dadf8f7d890/data",
  hospital_hcahps_survey: "https://data.cms.gov/provider-data/api/1/datastore/query/dgck-syfz/0",
  hospital_timely_effective_care: "https://data.cms.gov/provider-data/api/1/datastore/query/yv7e-xc69/0",
  hospital_unplanned_visits: "https://data.cms.gov/provider-data/api/1/datastore/query/632h-zaca/0",
  hospital_imaging_efficiency: "https://data.cms.gov/provider-data/api/1/datastore/query/wkfw-kthe/0",
  hospital_spending_per_beneficiary: "https://data.cms.gov/provider-data/api/1/datastore/query/rrqw-56er/0",
  hospital_spending_by_claim: "https://data.cms.gov/provider-data/api/1/datastore/query/nrth-mfg3/0",
  hospital_hac_reduction: "https://data.cms.gov/provider-data/api/1/datastore/query/yq43-i98g/0",
  hospital_psychiatric_facility: "https://data.cms.gov/provider-data/api/1/datastore/query/q9vs-r7wp/0",
  ambulatory_surgical_center: "https://data.cms.gov/provider-data/api/1/datastore/query/4jcv-atw7/0",
  hospital_joint_replacement: "https://data.cms.gov/provider-data/api/1/datastore/query/tqkv-mgxq/0",
  clinician_national_file: "https://data.cms.gov/provider-data/api/1/datastore/query/mj5m-pzi6/0",
  clinician_mips_performance: "https://data.cms.gov/provider-data/api/1/datastore/query/a174-a962/0",
  clinician_mips_measures: "https://data.cms.gov/provider-data/api/1/datastore/query/7d6a-e7a6/0",
  clinician_group_measures: "https://data.cms.gov/provider-data/api/1/datastore/query/0ba7-2cb0/0",
  clinician_group_experience: "https://data.cms.gov/provider-data/api/1/datastore/query/8c70-d353/0",
  home_health_patient_survey: "https://data.cms.gov/provider-data/api/1/datastore/query/ccn4-8vby/0",
  home_health_zip_data: "https://data.cms.gov/provider-data/api/1/datastore/query/m5eg-upu5/0",
  hospice_zip_data: "https://data.cms.gov/provider-data/api/1/datastore/query/95rg-2usp/0",
  nursing_home_ownership: "https://data.cms.gov/provider-data/api/1/datastore/query/y2hd-n93e/0",
  nursing_home_fire_safety: "https://data.cms.gov/provider-data/api/1/datastore/query/ifjz-ge4w/0",
  nursing_home_health_deficiencies: "https://data.cms.gov/provider-data/api/1/datastore/query/r5ix-sfxw/0",
  nursing_home_mds_quality: "https://data.cms.gov/provider-data/api/1/datastore/query/djen-97ju/0",
  nursing_home_claims_quality: "https://data.cms.gov/provider-data/api/1/datastore/query/ijh5-nb2v/0",
  facility_affiliation: "https://data.cms.gov/provider-data/api/1/datastore/query/27ea-46a8/0",
  home_health_vbp: "https://data.cms.gov/provider-data/api/1/datastore/query/56d7-4994/0",
  snf_vbp_facility: "https://data.cms.gov/provider-data/api/1/datastore/query/284v-j9fz/0",
  rural_health_clinic_enrollments: "https://data.cms.gov/data-api/v1/dataset/3b7e7659-067e-41ea-8e36-f9ee2036e1f6/data",
  rural_health_clinic_all_owners: "https://data.cms.gov/data-api/v1/dataset/ab03c9bc-0c22-4ca4-b032-21dd3408210d/data",
  nursing_home_chain_performance: "https://data.cms.gov/data-api/v1/dataset/97ecfad1-d3f1-4d42-b774-d74661d830bc/data",
  // "Medicare Geographic Variation - by National, State & County" (Original Medicare, 2014 onward). The id this
  // used to pin, 8e989bc0, is the Medicare Advantage national and state file: no counties and none of the
  // spending, readmission or ER measures the county profile reads.
  medicare_geographic_variation: "https://data.cms.gov/data-api/v1/dataset/6219697b-8f6c-4164-bed4-cd9317c58ebc/data",
  pbj_daily_nurse_staffing: "https://data.cms.gov/data-api/v1/dataset/7e0d53ba-8f02-4c66-98a5-14a1c997c50d/data",
  pbj_daily_nonnurse_staffing: "https://data.cms.gov/data-api/v1/dataset/b497431a-5b57-42c0-9016-90105b51841e/data",
  snf_enrollments: "https://data.cms.gov/data-api/v1/dataset/5f2c306f-3b1c-42cd-b037-187b2ce22126/data",
  snf_all_owners: "https://data.cms.gov/data-api/v1/dataset/afe44b85-cc6d-40d7-b5df-00ae8910d1d2/data",
  snf_cost_report: "https://data.cms.gov/data-api/v1/dataset/a69d3df7-3f66-4a0d-b5b8-0d66049bd565/data",
  fqhc_all_owners: "https://data.cms.gov/data-api/v1/dataset/ed289c89-0bb8-4221-a20a-85776066381b/data",
  aco_participants: "https://data.cms.gov/data-api/v1/dataset/9767cb68-8ea9-4f0b-8179-9431abc89f11/data",
  aco_organizations: "https://data.cms.gov/data-api/v1/dataset/69ec2609-5ce5-4ce1-b14c-1f8809fda2c2/data",
  aco_financial_results: "https://data.cms.gov/data-api/v1/dataset/73b2ce14-351d-40ac-90ba-ec9e1f5ba80c/data",
  medicare_telehealth_trends: "https://data.cms.gov/data-api/v1/dataset/939226be-b107-476e-8777-f199a840138a/data",
  snf_utilization_geo_casemix: "https://data.cms.gov/data-api/v1/dataset/4c2a8bf6-8560-4b00-bc56-1a0322677b7f/data",
  hha_utilization_geo_casemix: "https://data.cms.gov/data-api/v1/dataset/6c63099b-0794-40a0-925c-51a66b9b9901/data",
  ltc_facility_characteristics: "https://data.cms.gov/data-api/v1/dataset/129a6503-c0f1-4132-b186-4c0232c2d894/data",
  mds_frequency: "https://data.cms.gov/data-api/v1/dataset/4b50bbe6-a496-4eda-b03b-5f835937f81b/data",
  nursing_home_chains: "https://data.cms.gov/data-api/v1/dataset/97ecfad1-d3f1-4d42-b774-d74661d830bc/data",
  snf_quality_reporting: "https://data.cms.gov/provider-data/api/1/datastore/query/fykj-qjee/0",
  // "Medicare Inpatient Hospitals - by Provider and Service" (one row per hospital and DRG). The id this used to
  // share with medicare_inpatient_by_provider, ee6fb1a5, is the by-provider totals file: no DRG code.
  inpatient_drg: "https://data.cms.gov/data-api/v1/dataset/690ddc6c-2767-4618-b277-420ffb2bf27c/data",
  opt_out_physicians: "https://data.cms.gov/data-api/v1/dataset/9887a515-7552-4693-bf58-735c77af46d7/data",
};

/** Why an import type cannot be started from a CMS URL, or null when it can (a file_url may still be uploaded). */
export function autoImportBlock(importType: string, fileUrl?: string | null): string | null {
  if (importType === "provider_ownership" && !fileUrl) {
    return "Provider & Supplier Ownership was retired by CMS (the dataset returns 404). Import an All Owners file instead: hospital_all_owners, home_health_all_owners, hospice_all_owners, snf_all_owners, fqhc_all_owners, or rural_health_clinic_all_owners.";
  }
  return null;
}

const ZIP_FUNCTION_MAP: Record<string, string> = {
  medicare_hha_stats: "importMedicareHHA",
  medicare_ma_inpatient: "importMedicareMAInpatient",
  medicare_snf_stats: "importMedicareSNF",
};

const ALLOWED_URL_DOMAINS = [
  "data.cms.gov",
  "download.cms.gov",
  "npiregistry.cms.hhs.gov",
];

// Import types whose rows may come from a file: an admin upload
// (/api/storage/<name>, see server/lib/importSources.ts) or any https CSV
// link (fetched through the SSRF guard). Everything else must come from a
// CMS endpoint. These datasets aren't on the CMS APIs at all.
export const UPLOAD_CAPABLE_TYPES: ReadonlySet<string> = new Set(["physician_shared_patient_patterns", "licensed_facilities", "provider_ownership"]);

/** Pure: why a file_url can't be used for an import type, or null when it can. */
export function fileUrlProblem(importType: string, fileUrl: string | null | undefined, year: unknown): string | null {
  if (!fileUrl) return null;
  const uploadable = UPLOAD_CAPABLE_TYPES.has(importType);
  if (isLocalUpload(fileUrl)) {
    if (!uploadable) return `Uploaded files are only accepted for ${[...UPLOAD_CAPABLE_TYPES].join(", ")}; other datasets are imported from CMS directly.`;
  } else if (!isAllowedUrl(fileUrl) && !(uploadable && /^https:\/\//i.test(fileUrl))) {
    return "file_url must be an https:// link on a CMS government domain (data.cms.gov, download.cms.gov)";
  }
  // Any CSV that is read as rows needs the year it describes, whatever the dataset: without it
  // the rows would be stamped with a guessed year and replace the real one's. (The NPPES files
  // are zips with their own importers and take their date from the file name.)
  const readAsCsv = isLocalUpload(fileUrl) || sourceKindFor(fileUrl) === "remote_csv";
  if (readAsCsv && !/^nppes_/.test(importType) && !(Number.isInteger(Number(year)) && Number(year) >= 2000)) {
    return "year is required for file imports: the data year the file describes (it is shown with the data)";
  }
  return null;
}

// The import itself downloads through safeFetchStream (the SSRF guard), which
// also only takes https.
export function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && ALLOWED_URL_DOMAINS.some((d) => parsed.hostname === d || parsed.hostname.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

const CMS_DATASET_CATALOG = [
  { id: "nppes_weekly_incremental", title: "NPPES Weekly Update (V.2 file)", description: "CMS's weekly NPPES dissemination file: new NPIs, changed records and deactivations for the week. Providers are updated in place, and each NPI's addresses and taxonomies are replaced with the file's. The current file is found on CMS's NPI files page automatically.", category: "Physicians & Clinicians", records: "~100K/week", priority: "high" },
  { id: "nppes_monthly_full", title: "NPPES Monthly Full File (V.2)", description: "The complete NPPES registry (about 1.1 GB zipped, 8M+ records). Replaces every provider, address and taxonomy with the current registry. Needs disk for the download; run on demand.", category: "Physicians & Clinicians", records: "~8.5M", priority: "medium" },
  { id: "cms_order_referring", title: "Order & Referring Providers", description: "Complete list of providers eligible to order and refer Medicare services including Part B, DME, HHA, PMD, and Hospice designations.", category: "Physicians & Clinicians", records: "~2M", priority: "high" },
  { id: "licensed_facilities", title: "State-Licensed Homes (personal care, assisted living)", description: "Personal care homes, assisted living residences and similar state-licensed homes that CMS files never list. Import a state licensing export as a CSV upload (or an https link): columns are matched by name (name, address, city, state, zip, license number, license type, capacity, status, licensee); set state_filter and license_type for files that don't carry them, and year for the export's date. Each home gets its county from its ZIP (the Census geography must be loaded first) and shows on the Facilities page (Licensed Homes) and County Intel's Competitors tab; the county profile counts the personal care, assisted living, memory care and domiciliary care homes and beds (nursing homes are counted from the CMS files).", category: "Nursing Homes & SNF", records: "varies by state", priority: "high", available: true },
  { id: "physician_shared_patient_patterns", title: "Physician Shared Patient Patterns", description: "Provider pairs who treated the same Medicare beneficiaries within a 30/60/90/180-day window, with claim-pair and patient counts. Not a confirmed referral, and not on the data.cms.gov API. Import the CMS FOIA zip (or the headerless .txt inside it): NPI 1, NPI 2, claim-pair count, unique beneficiaries, same-day count. That layout is recognized automatically, as is a CSV headed npi1, npi2, paircount, benecount, samedaycount. A days30/60/90/180 in the file name is stored with the row.", category: "Physicians & Clinicians", records: "~35M", priority: "high" },
  { id: "provider_service_utilization", title: "Physician & Other Practitioners - by Provider and Service", description: "Utilization and payment data for Medicare Part B services by individual provider and HCPCS code.", category: "Physicians & Clinicians", records: "~10M", priority: "high" },
  { id: "physician_certifications", title: "Home Health Certifications by Physician", description: "Who certifies Medicare patients for home health: the clinicians billing home health certification (G0180) and recertification (G0179) and home health (G0181) or hospice (G0182) care plan oversight, with their patients and services. Read from the by-provider-and-service file with a server-side filter on those codes (~27K rows nationally, a few minutes). CMS lists a clinician only above 10 patients for a code in a care setting. Ranks the county's referral sources.", category: "Physicians & Clinicians", records: "~27K", priority: "high" },
  { id: "medicare_physician_by_provider", title: "Physician & Other Practitioners - by Provider", description: "Aggregate utilization and payment data for Medicare Part B services summarized at the provider level.", category: "Physicians & Clinicians", records: "~1.2M", priority: "high" },
  { id: "medicare_dme_by_supplier", title: "DME Suppliers - by Supplier", description: "Medicare Durable Medical Equipment, Devices & Supplies payment and utilization data by supplier, including the equipment, prosthetics, and drug split.", category: "Physicians & Clinicians", records: "~70K", priority: "medium" },
  { id: "medicare_dme_by_referring", title: "DME - by Referring Provider", description: "DME utilization data grouped by the referring physician or provider, including the equipment, prosthetics, and drug split.", category: "Physicians & Clinicians", records: "~400K", priority: "medium" },
  { id: "medicare_dme_by_referring_service", title: "DME - by Referring Provider and Service", description: "Each HCPCS a referring provider ordered under Medicare DMEPOS in 2024, with suppliers, services, and the average Medicare payment. CMS omits a line under 11 beneficiaries.", category: "Physicians & Clinicians", records: "~4M", priority: "medium" },
  { id: "medicare_dme_by_supplier_service", title: "DME Suppliers - by Supplier and Service", description: "Each HCPCS a DMEPOS supplier was paid for in 2024, with beneficiaries, services, and the average Medicare payment.", category: "Physicians & Clinicians", records: "~1M", priority: "medium" },
  { id: "medicare_dme_by_geography_service", title: "DME - by Geography and Service", description: "Medicare DMEPOS by HCPCS for the nation and each state in 2024, counted where the referring provider is located. CMS does not publish this file by county.", category: "Physicians & Clinicians", records: "~80K", priority: "medium" },
  { id: "medical_equipment_suppliers", title: "Medical Equipment Supplier Directory", description: "Directory of DMEPOS suppliers including business name, address, specialties, and supplies lists.", category: "Physicians & Clinicians", records: "~58K", priority: "medium" },
  { id: "medicare_part_d_prescribers", title: "Part D Prescribers - by Provider", description: "Medicare Part D prescribing data summarized at the individual prescriber level.", category: "Physicians & Clinicians", records: "~1.2M", priority: "medium" },
  { id: "provider_taxonomy_crosswalk", title: "Provider & Supplier Taxonomy Crosswalk", description: "Maps Medicare provider types and specialties to standard healthcare taxonomy codes.", category: "Physicians & Clinicians", records: "~4K", priority: "low" },
  { id: "clinician_national_file", title: "Doctors & Clinicians - National Downloadable File", description: "Complete national file of all Medicare-enrolled doctors and clinicians with NPI, specialty, group affiliation, address, and quality program participation.", category: "Doctors & Clinicians", records: "~2.8M", priority: "high" },
  { id: "clinician_mips_performance", title: "Clinician MIPS Overall Performance", description: "Individual clinician performance scores under the Merit-based Incentive Payment System (MIPS) program.", category: "Doctors & Clinicians", records: "~541K", priority: "high" },
  { id: "clinician_mips_measures", title: "Clinician MIPS Measures and Attestations", description: "Detailed MIPS measure-level results and attestation data for individual clinicians.", category: "Doctors & Clinicians", records: "~540K", priority: "medium" },
  { id: "clinician_group_measures", title: "Group Practice MIPS Measures and Attestations", description: "MIPS measure-level performance data for physician group practices.", category: "Doctors & Clinicians", records: "~199K", priority: "medium" },
  { id: "clinician_group_experience", title: "Group Practice Patient Experience", description: "Patient experience survey results (CAHPS) for physician group practices.", category: "Doctors & Clinicians", records: "~560", priority: "medium" },

  { id: "hospital_enrollments", title: "Hospital Enrollments", description: "CMS enrollment data for all hospitals including NPI, CCN, organization name, address, and enrollment status.", category: "Hospitals", records: "~8K", priority: "high" },
  { id: "hospital_general_info", title: "Hospital General Information", description: "Comprehensive hospital profile data including type, ownership, emergency services, and overall quality ratings.", category: "Hospitals", records: "~5K", priority: "high" },
  { id: "hospital_all_owners", title: "Hospital All Owners", description: "Ownership information for all Medicare-certified hospitals.", category: "Hospitals", records: "~30K", priority: "medium" },
  { id: "hospital_readmissions", title: "Hospital Readmissions Reduction Program", description: "Hospital performance on readmission measures with excess readmission ratios and payment reduction data.", category: "Hospitals", records: "~20K", priority: "high" },
  { id: "hospital_complications", title: "Complications and Deaths - Hospital", description: "Hospital-level data on complication rates and mortality measures for key conditions.", category: "Hospitals", records: "~50K", priority: "high" },
  { id: "hospital_infections", title: "Healthcare Associated Infections - Hospital", description: "Hospital-level HAI data including CLABSI, CAUTI, SSI, MRSA, and C.diff infection rates.", category: "Hospitals", records: "~40K", priority: "high" },
  { id: "hospital_value_based_purchasing", title: "Hospital Value-Based Purchasing Scores", description: "Total Performance Scores for the Hospital VBP Program including clinical, efficiency, safety, and patient experience domains.", category: "Hospitals", records: "~3K", priority: "medium" },
  { id: "hospital_cost_report", title: "Hospital Provider Cost Report", description: "Cost report data including revenues, expenses, bed counts, and financial performance metrics.", category: "Hospitals", records: "~7K", priority: "medium" },
  { id: "hospital_service_area", title: "Hospital Service Area", description: "Geographic service area definitions for Medicare-certified hospitals.", category: "Hospitals", records: "~200K", priority: "low" },
  { id: "hospital_hcahps_survey", title: "Patient Survey (HCAHPS) - Hospital", description: "Hospital Consumer Assessment of Healthcare Providers and Systems survey results measuring patient experience.", category: "Hospitals", records: "~326K", priority: "high" },
  { id: "hospital_timely_effective_care", title: "Timely and Effective Care - Hospital", description: "Hospital performance on timely and effective care measures including ED wait times, heart attack care, and stroke care.", category: "Hospitals", records: "~138K", priority: "high" },
  { id: "hospital_unplanned_visits", title: "Unplanned Hospital Visits", description: "Hospital-level data on unplanned readmissions and emergency department visits after procedures.", category: "Hospitals", records: "~67K", priority: "high" },
  { id: "hospital_imaging_efficiency", title: "Outpatient Imaging Efficiency - Hospital", description: "Hospital performance on outpatient imaging efficiency measures including use of MRI and CT scans.", category: "Hospitals", records: "~19K", priority: "medium" },
  { id: "hospital_spending_per_beneficiary", title: "Medicare Spending Per Beneficiary - Hospital", description: "Hospital-level Medicare spending per beneficiary including pre-admission, during stay, and post-discharge.", category: "Hospitals", records: "~5K", priority: "medium" },
  { id: "hospital_spending_by_claim", title: "Medicare Hospital Spending by Claim", description: "Detailed Medicare spending data by claim type including inpatient, outpatient, SNF, home health, and hospice.", category: "Hospitals", records: "~64K", priority: "medium" },
  { id: "hospital_hac_reduction", title: "Hospital-Acquired Condition Reduction Program", description: "Hospital performance under the HAC Reduction Program including total HAC scores and payment reduction indicators.", category: "Hospitals", records: "~3K", priority: "medium" },
  { id: "hospital_psychiatric_facility", title: "Inpatient Psychiatric Facility Quality Measures", description: "Quality measure data for inpatient psychiatric facilities including screening, follow-up, and transition measures.", category: "Hospitals", records: "~1.4K", priority: "medium" },
  { id: "ambulatory_surgical_center", title: "Ambulatory Surgical Center Quality Measures", description: "Quality performance data for Medicare-certified ambulatory surgical centers.", category: "Hospitals", records: "~5.7K", priority: "medium" },
  { id: "hospital_joint_replacement", title: "Comprehensive Care for Joint Replacement - Provider", description: "Provider-level data for the CMS Comprehensive Care for Joint Replacement bundled payment model.", category: "Hospitals", records: "~320", priority: "low" },
  { id: "hospital_price_transparency", title: "Hospital Price Transparency Enforcement", description: "Enforcement activities and outcomes for hospital price transparency compliance.", category: "Hospitals", records: "~2K", priority: "low" },
  { id: "medicare_inpatient_by_provider", title: "Medicare Inpatient Hospitals - by Provider", description: "One row per hospital: total discharges, covered days, submitted charges and Medicare payment. Not the DRG-level file.", category: "Hospitals", records: "~6K", priority: "medium" },
  { id: "medicare_outpatient_by_provider", title: "Medicare Outpatient Hospitals - by Provider", description: "Outpatient hospital service utilization and payment data by provider and APC code.", category: "Hospitals", records: "~3M", priority: "medium" },

  { id: "home_health_enrollments", title: "Home Health Agency Enrollments", description: "CMS enrollment data for home health agencies including NPI, CCN, organization details, and enrollment status.", category: "Home Health", records: "~12K", priority: "high" },
  { id: "home_health_agencies", title: "Home Health Care Agencies", description: "Provider-level quality measures for home health agencies including star ratings and outcome measures.", category: "Home Health", records: "~8K", priority: "high" },
  { id: "home_health_all_owners", title: "Home Health Agency All Owners", description: "Ownership information for all Medicare-certified home health agencies.", category: "Home Health", records: "~30K", priority: "medium" },
  { id: "home_health_cost_report", title: "Home Health Agency Cost Report", description: "Financial cost report data for home health agencies including revenue, expenses, and visit counts.", category: "Home Health", records: "~12K", priority: "medium" },
  { id: "home_health_state_measures", title: "Home Health Care - State Data", description: "Quality measures for home health care aggregated at the state level.", category: "Home Health", records: "~55", priority: "low" },
  { id: "home_health_national_measures", title: "Home Health Care - National Data", description: "National-level aggregate quality and outcome measures for home health care.", category: "Home Health", records: "~1", priority: "low" },
  { id: "home_health_patient_survey", title: "Home Health Patient Survey (HHCAHPS)", description: "Patient experience survey data for home health agencies measuring care quality, communication, and overall satisfaction.", category: "Home Health", records: "~12K", priority: "high" },
  { id: "home_health_zip_data", title: "Home Health Care - Zip Code Data", description: "Quality measures and provider information for home health agencies by geographic ZIP code area.", category: "Home Health", records: "~549K", priority: "medium" },
  { id: "medicare_hha_utilization", title: "Medicare Post-Acute Care - Home Health", description: "Post-acute care utilization data for home health agencies.", category: "Home Health", records: "~10K", priority: "medium" },
  { id: "home_infusion_therapy", title: "Home Infusion Therapy Providers", description: "Directory of Medicare-enrolled home infusion therapy providers.", category: "Home Health", records: "~2K", priority: "low" },

  { id: "hospice_enrollments", title: "Hospice Enrollments", description: "CMS enrollment data for hospice providers including NPI, CCN, organization name, and enrollment status.", category: "Hospice", records: "~6K", priority: "high" },
  { id: "hospice_general_info", title: "Hospice - General Information", description: "Comprehensive hospice profile data including CCN, address, phone, ownership type, and CMS region.", category: "Hospice", records: "~6K", priority: "high" },
  { id: "hospice_provider_data", title: "Hospice - Provider Data", description: "Detailed provider-level quality and utilization measures for hospice facilities.", category: "Hospice", records: "~40K", priority: "high" },
  { id: "hospice_provider_measures", title: "Hospice CAHPS Survey - Provider Data", description: "Hospice CAHPS patient experience survey results at the provider level.", category: "Hospice", records: "~174K", priority: "medium" },
  { id: "hospice_all_owners", title: "Hospice All Owners", description: "Ownership information for all Medicare-certified hospice providers.", category: "Hospice", records: "~15K", priority: "medium" },
  { id: "hospice_state_measures", title: "Hospice CAHPS Survey - State Data", description: "State-level aggregate hospice CAHPS patient experience survey results.", category: "Hospice", records: "~1.1K", priority: "low" },
  { id: "hospice_national_measures", title: "Hospice CAHPS Survey - National Data", description: "National-level aggregate hospice CAHPS survey results.", category: "Hospice", records: "~24", priority: "low" },
  { id: "hospice_zip_data", title: "Hospice - Zip Code Data", description: "Hospice quality measures and utilization data by geographic ZIP code area.", category: "Hospice", records: "~366K", priority: "medium" },
  { id: "medicare_hospice_utilization", title: "Medicare Post-Acute Care - Hospice", description: "Post-acute care utilization and spending data for hospice providers.", category: "Hospice", records: "~5K", priority: "medium" },

  { id: "nursing_home_providers", title: "Nursing Home Provider Information", description: "Comprehensive nursing home data including beds, residents, ownership, star ratings, and staffing information.", category: "Nursing Homes & SNF", records: "~15K", priority: "high" },
  { id: "snf_provider_measures", title: "Skilled Nursing Facility Quality Measures", description: "Provider-level quality measures for SNFs including readmission, falls, pressure ulcers, and staffing metrics.", category: "Nursing Homes & SNF", records: "~838K", priority: "high" },
  { id: "nursing_home_deficiencies", title: "Nursing Home Deficiencies", description: "Survey deficiency data for nursing homes including scope, severity, and correction status.", category: "Nursing Homes & SNF", records: "~44K", priority: "medium" },
  { id: "nursing_home_penalties", title: "Nursing Home Penalties", description: "Civil money penalties and payment denials imposed on nursing home facilities.", category: "Nursing Homes & SNF", records: "~5K", priority: "medium" },
  { id: "nursing_home_ownership", title: "Nursing Home Ownership", description: "Detailed ownership information for all Medicare/Medicaid-certified nursing home facilities.", category: "Nursing Homes & SNF", records: "~159K", priority: "medium" },
  { id: "nursing_home_fire_safety", title: "Nursing Home Fire Safety Deficiencies", description: "Fire safety inspection deficiency data for nursing homes including scope and severity.", category: "Nursing Homes & SNF", records: "~200K", priority: "medium" },
  { id: "nursing_home_health_deficiencies", title: "Nursing Home Health Deficiencies", description: "Health inspection deficiency data for nursing homes including scope, severity, and correction status.", category: "Nursing Homes & SNF", records: "~419K", priority: "medium" },
  { id: "nursing_home_mds_quality", title: "Nursing Home MDS Quality Measures", description: "Minimum Data Set quality measures for nursing homes including falls, pressure ulcers, and ADL decline.", category: "Nursing Homes & SNF", records: "~250K", priority: "high" },
  { id: "nursing_home_claims_quality", title: "Nursing Home Medicare Claims Quality Measures", description: "Quality measures derived from Medicare claims data for nursing homes.", category: "Nursing Homes & SNF", records: "~59K", priority: "medium" },
  { id: "medicare_snf_utilization", title: "Medicare Post-Acute Care - SNF", description: "Post-acute care utilization and spending data for skilled nursing facilities.", category: "Nursing Homes & SNF", records: "~15K", priority: "medium" },

  { id: "fqhc_enrollments", title: "Federally Qualified Health Center Enrollments", description: "CMS enrollment data for FQHCs including NPI, organization name, address, and enrollment status.", category: "Other Facilities", records: "~15K", priority: "high" },
  { id: "inpatient_rehab_general_info", title: "Inpatient Rehabilitation Facility - General Information", description: "Comprehensive profile data for inpatient rehabilitation facilities including address, phone, ownership, and quality ratings.", category: "Other Facilities", records: "~1.2K", priority: "medium" },
  { id: "inpatient_rehab_provider_data", title: "Inpatient Rehabilitation Facility - Provider Data", description: "Quality measure data for inpatient rehabilitation facilities including functional outcomes and discharge measures.", category: "Other Facilities", records: "~10K", priority: "medium" },
  { id: "long_term_care_general_info", title: "Long-Term Care Hospital - General Information", description: "Profile data for long-term care hospitals including address, phone, ownership type, and overall quality ratings.", category: "Other Facilities", records: "~319", priority: "medium" },
  { id: "long_term_care_provider_data", title: "Long-Term Care Hospital - Provider Data", description: "Quality measure data for long-term care hospitals including readmission, infection, and functional outcome measures.", category: "Other Facilities", records: "~3K", priority: "medium" },
  { id: "aco_snf_affiliates", title: "ACO Skilled Nursing Facility Affiliates", description: "Affiliations between Accountable Care Organizations and Skilled Nursing Facilities.", category: "Other Facilities", records: "~80K", priority: "low" },
  { id: "aco_reach_providers", title: "ACO REACH Providers", description: "Provider information for ACO Realizing Equity, Access, and Community Health model participants.", category: "Other Facilities", records: "~350K", priority: "low" },

  { id: "medicare_fee_for_service_enrollment", title: "Medicare FFS Public Provider Enrollment", description: "Public enrollment data for Medicare Fee-For-Service providers.", category: "Medicare Programs", records: "~3M", priority: "medium" },
  { id: "medicare_monthly_enrollment", title: "Medicare Monthly Enrollment", description: "Monthly Medicare enrollment statistics and trends.", category: "Medicare Programs", records: "~5K", priority: "low" },
  { id: "medicare_irf_utilization", title: "Medicare Post-Acute Care - IRF", description: "Inpatient rehabilitation facility utilization and payment data.", category: "Medicare Programs", records: "~1.2K", priority: "low" },
  { id: "medicare_ltch_utilization", title: "Medicare Post-Acute Care - LTCH", description: "Long-term care hospital utilization and payment data.", category: "Medicare Programs", records: "~400", priority: "low" },
  { id: "market_saturation_county", title: "Market Saturation & Utilization - County", description: "Healthcare market saturation and utilization metrics at the county level.", category: "Medicare Programs", records: "~20K", priority: "medium" },
  { id: "market_saturation_cbsa", title: "Market Saturation & Utilization - CBSA", description: "Healthcare market saturation data at the Core-Based Statistical Area level.", category: "Medicare Programs", records: "~1K", priority: "low" },
  { id: "medicare_spending_by_drug_d", title: "Medicare Part D Spending by Drug", description: "Medicare Part D drug spending data including total spending, claims, and beneficiary counts.", category: "Medicare Programs", records: "~14.3K", priority: "low" },
  { id: "medicare_spending_by_drug_b", title: "Medicare Part B Spending by Drug", description: "Medicare Part B drug spending and utilization data.", category: "Medicare Programs", records: "~734", priority: "low" },
  { id: "medicare_telehealth_trends", title: "Medicare Telehealth Trends", description: "Telehealth utilization trends including visit counts, provider adoption, and specialty breakdown across Medicare.", category: "Medicare Programs", records: "~50K", priority: "medium" },
  { id: "medicare_geographic_variation", title: "Medicare Geographic Variation", description: "Original Medicare spending and utilization for the nation, every state and every county, 2014 onward: standardized per-capita spending by setting, readmissions, ER visits, Medicare Advantage participation. Feeds the county market profile.", category: "Medicare Programs", records: "~37K", priority: "medium" },

  { id: "facility_affiliation", title: "Facility Affiliation Data", description: "Links between individual clinicians and the facilities or group practices where they provide services.", category: "Doctors & Clinicians", records: "~3M", priority: "high" },

  { id: "home_health_vbp", title: "Home Health Value-Based Purchasing (HHVBP)", description: "Home health agency performance under the Expanded HHVBP Model including quality scores and payment adjustments.", category: "Home Health", records: "~8K", priority: "medium" },

  { id: "nursing_home_chain_performance", title: "Nursing Home Chain Performance Measures", description: "Quality performance metrics aggregated at the nursing home chain/organization level.", category: "Nursing Homes & SNF", records: "~1K", priority: "medium" },
  { id: "snf_enrollments", title: "Skilled Nursing Facility Enrollments", description: "CMS enrollment data for SNFs including NPI, CCN, organization name, address, and enrollment status.", category: "Nursing Homes & SNF", records: "~15K", priority: "high" },
  { id: "snf_all_owners", title: "Skilled Nursing Facility All Owners", description: "Ownership information for all Medicare-certified skilled nursing facilities.", category: "Nursing Homes & SNF", records: "~60K", priority: "medium" },
  { id: "snf_cost_report", title: "Skilled Nursing Facility Cost Report", description: "Financial cost report data for SNFs including revenue, expenses, bed counts, and utilization.", category: "Nursing Homes & SNF", records: "~15K", priority: "medium" },
  { id: "snf_vbp_facility", title: "SNF Value-Based Purchasing - Facility", description: "Facility-level SNF Value-Based Purchasing program scores including readmission measures and incentive payments.", category: "Nursing Homes & SNF", records: "~15K", priority: "medium" },

  { id: "pbj_daily_nurse_staffing", title: "Payroll Based Journal - Daily Nurse Staffing", description: "Actual daily nurse staffing hours reported by nursing homes including RN, LPN, and CNA hours per resident day.", category: "Nursing Homes & SNF", records: "~6M", priority: "high" },
  { id: "pbj_daily_nonnurse_staffing", title: "Payroll Based Journal - Daily Non-Nurse Staffing", description: "Daily non-nurse staffing hours for nursing homes including physical therapy, dietary, and administrative staff.", category: "Nursing Homes & SNF", records: "~6M", priority: "medium" },

  { id: "rural_health_clinic_enrollments", title: "Rural Health Clinic Enrollments", description: "CMS enrollment data for rural health clinics including NPI, organization name, address, and enrollment status.", category: "Other Facilities", records: "~5K", priority: "high" },
  { id: "rural_health_clinic_all_owners", title: "Rural Health Clinic All Owners", description: "Ownership information for all Medicare-certified rural health clinics.", category: "Other Facilities", records: "~15K", priority: "medium" },
  { id: "fqhc_all_owners", title: "Federally Qualified Health Center All Owners", description: "Ownership information for all Medicare-certified FQHCs.", category: "Other Facilities", records: "~50K", priority: "medium" },

  { id: "aco_participants", title: "ACO Participants", description: "Complete list of providers participating in Medicare Accountable Care Organizations with TINs and NPIs.", category: "ACO & Networks", records: "~500K", priority: "high" },
  { id: "aco_organizations", title: "Accountable Care Organizations", description: "Profiles of Medicare Shared Savings Program ACOs including name, start date, track, and agreement details.", category: "ACO & Networks", records: "~500", priority: "high" },
  { id: "aco_financial_results", title: "ACO Financial & Quality Results", description: "Annual financial performance and quality measure results for ACOs in the Medicare Shared Savings Program.", category: "ACO & Networks", records: "~500", priority: "medium" },

  { id: "nursing_home_chains", title: "Nursing Home Chain Data", description: "Performance data aggregated at the nursing home chain level including star ratings and facility counts.", category: "Nursing Homes & SNF", records: "~1K", priority: "medium" },
  { id: "inpatient_drg", title: "Medicare Inpatient Hospitals - by Provider and Service", description: "Discharges and average Medicare payment for each hospital and DRG. Not the one-row-per-hospital totals.", category: "Hospitals", records: "~200K+", priority: "medium" },
  { id: "provider_ownership", title: "Provider & Supplier Ownership (Retired)", description: "Retired by CMS: the combined ownership file returns 404 and has no replacement. Import the All Owners files (hospital, home health, hospice, SNF, FQHC, rural health clinic) instead.", category: "Medicare Programs", records: "N/A", priority: "low", unavailable: true },
  { id: "home_health_pdgm", title: "Home Health PDGM Data (Retired)", description: "Patient-Driven Groupings Model data — dataset retired by CMS. Use HHA Utilization by Geography & Case-Mix instead.", category: "Home Health", records: "N/A", priority: "low", unavailable: true },
  { id: "snf_quality_reporting", title: "SNF Quality Reporting Program", description: "Quality measure data from the SNF Quality Reporting Program.", category: "Nursing Homes & SNF", records: "~15K", priority: "medium" },
  { id: "snf_utilization_geo_casemix", title: "SNF Utilization by Geography & Case-Mix", description: "Skilled nursing facility utilization and payment data broken down by geographic area, provider, and case-mix grouping.", category: "Nursing Homes & SNF", records: "~100K", priority: "medium" },
  { id: "hha_utilization_geo_casemix", title: "HHA Utilization by Geography & Case-Mix", description: "Home health agency utilization data by geographic area, provider, and patient case-mix grouping.", category: "Home Health", records: "~127K", priority: "medium" },
  { id: "ltc_facility_characteristics", title: "Long-Term Care Facility Characteristics", description: "Detailed feature data for long-term care facilities including bed counts, certification, payer mix, and resident demographics.", category: "Nursing Homes & SNF", records: "~15K", priority: "medium" },
  { id: "mds_frequency", title: "Minimum Data Set Frequency", description: "MDS assessment frequency metrics for nursing homes indicating how often resident assessments are performed.", category: "Nursing Homes & SNF", records: "~15K", priority: "medium" },
];

export function getCMSDatasetCatalog() {
  const datasets = CMS_DATASET_CATALOG
    .filter(ds => !ds.unavailable && !/\bretired\b/i.test(ds.title))
    .map(ds => ({
      ...ds,
      url: IMPORT_TYPE_URLS[ds.id] || null,
      // Upload-capable datasets and the NPPES files have no CMS data-api endpoint; they are available as files.
      available: !!(IMPORT_TYPE_URLS[ds.id] || NPPES_FILE_TYPES[ds.id] || UPLOAD_CAPABLE_TYPES.has(ds.id)),
      unavailable: !!(ds as any).unavailable,
    })).filter(ds => ds.available);
  return {
    datasets,
    total: datasets.length,
    categories: [...new Set(datasets.map(ds => ds.category))],
  };
}

// Sentinel file_names that represent control/signal rows, not real imports.
const SENTINEL_FILE_NAMES = new Set([
  "batch_process_active", "crawler_batch_stop_signal", "crawler_auto_stop_signal",
]);

// Insert a new import batch atomically under a per-import_type advisory lock,
// re-checking for a concurrently-started active import inside the lock. This
// closes the check-then-act race between the active-import pre-check and the
// insert, so two near-simultaneous triggerImport calls for the same type can't
// both start an import. Returns a 409-shaped conflict instead of inserting if a
// real active import is found inside the lock.
async function insertBatchAtomically(
  importType: string,
  values: any,
): Promise<{ batch?: any; conflict?: any }> {
  return await db.transaction(async (tx) => {
    // hashtext() -> int4, accepted by the bigint pg_advisory_xact_lock overload.
    // Released automatically on commit/rollback.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${importType}))`);
    const active = await tx.select().from(importBatches)
      .where(and(eq(importBatches.import_type, importType), inArray(importBatches.status, ["validating", "processing"])));
    const realActive = active.filter((b) => !SENTINEL_FILE_NAMES.has(b.file_name || ""));
    if (realActive.length > 0) {
      const existing = realActive[0];
      return {
        conflict: {
          status: 409,
          message: `Import for ${importType} is already in progress`,
          conflict: true,
          existing_batch_id: existing.id,
          started_at: existing.created_date,
        },
      };
    }
    const [batch] = await tx.insert(importBatches).values(values).returning();
    return { batch };
  });
}

/** After a complete, unfiltered import of a snapshot dataset, the rows the release no longer lists come out (in the background). */
function retireSnapshotRows(importType: string, batchId: number, opts: { dry_run?: boolean; npi_filter?: unknown; state_filter?: unknown; errors?: number }) {
  import("../lib/snapshotRetire")
    .then(({ retiresSnapshot, retireStaleSnapshotRows }) => (retiresSnapshot(importType, opts) ? retireStaleSnapshotRows(importType, batchId) : null))
    .catch((err) => console.warn(`[triggerImport] retiring stale ${importType} rows:`, err?.message));
}

const GEOGRAPHY_MISSING = "The Census geography isn't loaded yet, so ZIP codes can't be placed in counties. It loads when the server starts (or run `npm run geo:load`); retry once it has.";

/** Why a dataset that places ZIP codes in counties can't be imported yet, or null when it can. */
export async function geographyProblem(importType: string): Promise<string | null> {
  if (!TYPED_ROUTES[importType]?.needsGeo) return null;
  const { getGeoIndex } = await import("../lib/geo");
  const index = await getGeoIndex(pool).catch(() => null);
  return index && index.counties.size > 0 ? null : GEOGRAPHY_MISSING;
}

/**
 * The release date a snapshot import's rows are stamped with (`as_of`): the resumed batch's
 * own, else the last day the newest release covers, else the day it was published. The Care
 * Compare catalog gives no coverage dates, only the publication date, so without the last
 * fallback the ZIP service areas and affiliations would carry no vintage at all.
 */
export function importAsOf(o: { inherited?: string | null; temporalEnd?: string | null; stated?: string | null; catalogModified?: Date | string | null }): string | null {
  const modified = o.catalogModified instanceof Date ? (Number.isNaN(o.catalogModified.getTime()) ? null : o.catalogModified.toISOString().slice(0, 10))
    : typeof o.catalogModified === "string" && /^\d{4}-\d{2}-\d{2}/.test(o.catalogModified) ? o.catalogModified.slice(0, 10) : null;
  return o.inherited ?? o.temporalEnd ?? o.stated ?? modified ?? null;
}

/**
 * A client that creates its batch first (the Data Center wizard) passes it as batch_id while it is still
 * "validating". When the request is refused before the import starts, nothing would ever move that batch on,
 * and it would sit in "validating" until the stall sweep: fail it now, with the reason. A batch being resumed
 * (paused, failed) is in another state and keeps it.
 */
async function failPrecreatedBatch(batchId: unknown, message: string) {
  const id = Number(batchId);
  if (!Number.isInteger(id) || id <= 0) return;
  await db.update(importBatches)
    .set({ status: "failed", error_samples: [{ message }], updated_date: new Date() })
    .where(and(eq(importBatches.id, id), eq(importBatches.status, "validating")))
    .catch(() => {});
}

/**
 * Data-quality alerts used to fire only on manual scans, never on import
 * failures. Record one open alert per failed batch so failures surface in
 * the same alert stream operators already watch.
 */
export async function recordImportFailureAlert(batchId: number, importType: string, message: string): Promise<void> {
  try {
    const [open] = await db.select({ id: dataQualityAlerts.id }).from(dataQualityAlerts)
      .where(and(
        eq(dataQualityAlerts.alert_type, "import_failed"),
        eq(dataQualityAlerts.status, "new"),
        eq(dataQualityAlerts.affected_entity_id, String(batchId)),
      ))
      .limit(1);
    if (open) return;
    await db.insert(dataQualityAlerts).values({
      alert_type: "import_failed",
      severity: "high",
      title: `Import failed: ${importType}`,
      description: String(message || "Import failed").slice(0, 500),
      status: "new",
      action_required: true,
      affected_entity_id: String(batchId),
      affected_entity_type: "ImportBatch",
    });
  } catch (e: any) {
    console.warn(`[triggerImport] Could not record import-failure alert for batch ${batchId}:`, e.message);
  }
}

export async function handleTriggerImport(payload: any, user: any) {
  if (!user || !(user.role === "admin" || user.isPlatformAdmin)) {
    throw { status: 403, message: "Forbidden: Admin access required" };
  }
  try {
    return await startImport(payload);
  } catch (err: any) {
    await failPrecreatedBatch(payload?.batch_id, String(err?.message || "The import could not be started."));
    throw err;
  }
}

async function startImport(payload: any) {
  const { import_type: raw_import_type, file_url, dry_run = false, year, retry_of, retry_count, retry_tags, category, resume_offset, batch_id, npi_filter, state_filter, headers, license_type } = payload;

  if (!raw_import_type) {
    throw { status: 400, message: "Missing required field: import_type" };
  }

  const import_type = IMPORT_TYPE_ALIASES[raw_import_type] || raw_import_type;

  const urlProblem = fileUrlProblem(import_type, file_url, year);
  if (urlProblem) {
    throw { status: 400, message: urlProblem };
  }
  const noGeography = await geographyProblem(import_type);
  if (noGeography) {
    // 412, not 409: the clients read a 409 as "this import is already running" and would hide the reason.
    throw { status: 412, message: noGeography };
  }

  const activeImports = await db.select().from(importBatches)
    .where(and(eq(importBatches.import_type, import_type), inArray(importBatches.status, ["validating", "processing"])));
  const realActive = activeImports.filter((b) => {
    return !SENTINEL_FILE_NAMES.has(b.file_name || "") && b.id !== batch_id;
  });

  if (realActive.length > 0) {
    const existing = realActive[0];
    const stuckMs = Date.now() - new Date(existing.updated_date || existing.created_date!).getTime();
    // The same threshold as the stall sweep: a healthy import can be quiet for an hour while a very large page is
    // written, so asking for another import of the same type must not fail it before the sweep would.
    if (stuckMs > STALLED_AFTER_MS) {
      await db.update(importBatches).set({
        status: "failed",
        cancel_reason: `Auto-cancelled: stuck in "${existing.status}" for ${Math.round(stuckMs / 60000)} minutes`,
        cancelled_at: new Date(),
        updated_date: new Date(),
      }).where(eq(importBatches.id, existing.id));
    } else {
      throw {
        status: 409,
        message: `Import for ${import_type} is already in progress`,
        conflict: true,
        existing_batch_id: existing.id,
        started_at: existing.created_date,
      };
    }
  }

  if (ZIP_FUNCTION_MAP[import_type]) {
    throw {
      status: 400,
      message: `Import type "${import_type}" requires ZIP/Excel file processing which is not yet available on the server. Use the API-based equivalents instead (e.g. medicare_hha_utilization, medicare_snf_utilization, medicare_irf_utilization).`,
    };
  }

  if (import_type === "nppes_flat_file" || import_type === "nppes_registry_file") {
    if (!file_url) {
      throw { status: 400, message: "file_url is required for NPPES flat file imports" };
    }

    const { batch, conflict } = await insertBatchAtomically(import_type, {
      import_type,
      file_name: file_url.split("/").pop() || "nppes_flat_file",
      status: "processing",
      dry_run: !!dry_run,
      total_rows: 0,
      imported_rows: 0,
    });
    if (conflict) throw conflict;

    setTimeout(() => {
      handleImportNPPESFlatFile({ batch_id: batch.id, file_url, byte_offset: 0 })
        .catch((e) => console.error(`[triggerImport] NPPES flat file import error:`, e.message));
    }, 100);

    return {
      success: true,
      message: `NPPES flat file import started in the background. Check Data Center for progress.`,
      import_type,
      batch_id: batch.id,
      file_url,
    };
  }

  if (NPPES_FILE_TYPES[import_type]) {
    // NPPES V.2 dissemination zips (server/functions/importNPPESFile.ts). The
    // current file is read off CMS's NPI files page unless a link is given.
    const kind = NPPES_FILE_TYPES[import_type];
    const resolved = file_url ? classifyNppesLink(file_url) : await resolveNppesFile(kind);
    const url = file_url || resolved?.url;
    if (!url) throw { status: 502, message: `Couldn't find the current NPPES ${kind} file on CMS's NPI files page; pass file_url.` };
    if (!isAllowedUrl(url)) throw { status: 400, message: "NPPES files must come from download.cms.gov" };
    const fileName = url.split("/").pop() || import_type;
    let activeBatchId: number;
    if (batch_id) {
      // Same claim as the CMS resume path: never resurrect a finished batch.
      const [claimed] = await db.update(importBatches).set({
        status: "processing", paused_by: null, cancel_reason: null, cancelled_at: null, error_samples: null,
        retry_params: mergeRetryParams({ file_url: url, import_type, resume_offset: resume_offset || 0, retry_of, retry_count: (retry_count || 0) + 1, retry_tags }),
        updated_date: new Date(),
      }).where(and(
        eq(importBatches.id, batch_id),
        inArray(importBatches.status, [
        // "validating": pre-created by the import wizard, not yet started.
        "validating", "paused", "pausing", "failed", "cancelled", "completed_with_errors",
      ]),
      )).returning({ id: importBatches.id });
      if (!claimed) {
        throw { status: 409, message: `Batch ${batch_id} is no longer resumable (it finished or was already resumed).` };
      }
      activeBatchId = batch_id;
    } else {
      const { batch, conflict } = await insertBatchAtomically(import_type, {
        import_type, file_name: fileName, status: "processing", dry_run: !!dry_run, total_rows: 0, imported_rows: 0,
        retry_params: { file_url: url, import_type, resume_offset: 0 },
      });
      if (conflict) throw conflict;
      activeBatchId = batch.id;
    }
    if (resolved) await recordSourceFile(import_type, { source: "nppes_file", title: fileName, periodStart: resolved.periodStart, periodEnd: resolved.periodEnd }).catch(() => {});
    await markImportStarted(import_type, activeBatchId, "nppes_file").catch(() => {});
    setTimeout(() => {
      import("./importNPPESFile").then(({ handleImportNPPESFile }) => handleImportNPPESFile({ batch_id: activeBatchId, file_url: url, import_type, resume_offset: resume_offset || 0, dry_run: !!dry_run }))
        .catch((e) => console.error(`[triggerImport] NPPES file import error:`, e?.message));
    }, 100);
    return { success: true, message: `NPPES ${kind} file import started in the background (${fileName}). Check Data Center for progress.`, import_type, batch_id: activeBatchId, file_url: url, resumed: !!batch_id };
  }

  const blocked = autoImportBlock(import_type, file_url);
  if (blocked) throw { status: 400, message: blocked };

  const validTypes = Object.keys(IMPORT_TYPE_URLS);
  if (!validTypes.includes(import_type) && !file_url) {
    throw {
      status: 400,
      message: `Invalid import_type for auto-import (no CMS URL configured). Either provide a file_url or use one of: ${[...validTypes, ...Object.keys(ZIP_FUNCTION_MAP), "nppes_flat_file"].join(", ")}`,
    };
  }

  // The registry knows the newest release of the dataset and the year it
  // covers; the pinned URL and the "two years ago" guess are only fallbacks.
  const version = file_url ? null : await resolveImportVersion(import_type).catch(() => null);
  const resolvedUrl = file_url || withImportQuery(import_type, version?.dataUrl) || IMPORT_TYPE_URLS[import_type];
  if (!resolvedUrl) {
    throw { status: 400, message: "No URL available for this import type. Please provide a file_url." };
  }

  const resolvedYear = year || (version?.dataYear ? Number(version.dataYear) : 0) || new Date().getFullYear() - 2;
  const resolvedOffset = resume_offset || 0;

  let activeBatchId: number;

  // Restore the original npi_filter/state_filter when this is a resume
  // (batch_id) OR an auto-retry (retry_of) — both re-invokes (autoResumePaused-
  // Imports / autoRetryFailedImports) carry only basic params, so without this
  // the remainder/retry would import the FULL dataset unfiltered. Inherit from
  // the batch being resumed, else from the original batch being retried.
  // The same goes for what the rest of the file is read with: the column names
  // of a headerless CSV, and the release date the rows are stamped with.
  let effNpiFilter = npi_filter;
  let effStateFilter = state_filter;
  let effHeaders: string[] | undefined = Array.isArray(headers) && headers.length ? headers.map(String) : undefined;
  let effLicenseType: string | undefined = typeof license_type === "string" && license_type.trim() ? license_type.trim().slice(0, 60) : undefined;
  let inheritedAsOf: string | null = null;
  const inheritFiltersFrom = batch_id ?? retry_of;
  if (inheritFiltersFrom != null) {
    const [src] = await db.select().from(importBatches).where(eq(importBatches.id, Number(inheritFiltersFrom))).limit(1);
    const prevParams = ((src?.retry_params as any) || {});
    effNpiFilter = npi_filter ?? prevParams.npi_filter;
    effStateFilter = state_filter ?? prevParams.state_filter;
    if (!effHeaders && Array.isArray(prevParams.headers) && prevParams.headers.length) effHeaders = prevParams.headers.map(String);
    if (!effLicenseType && typeof prevParams.license_type === "string" && prevParams.license_type.trim()) effLicenseType = prevParams.license_type.trim().slice(0, 60);
    inheritedAsOf = typeof prevParams.as_of === "string" ? prevParams.as_of : null;
  }
  // The release date: the resumed batch's own, else the newest release's period end, else the date an
  // upload states (an export has no catalog entry), else the day the catalog says the release was published.
  const statedAsOf = typeof payload.as_of === "string" && /^\d{4}-\d{2}-\d{2}$/.test(payload.as_of) ? payload.as_of : null;
  const effAsOf = importAsOf({ inherited: inheritedAsOf, temporalEnd: version?.temporalEnd, stated: statedAsOf, catalogModified: version?.catalogModified });

  if (batch_id) {
    // Claim the batch for this resume: only a paused/pausing/failed/cancelled,
    // MAX_PAGES-capped, or pre-created ("validating") batch may move to
    // "processing". A batch that finished, or was already resumed between the
    // click and this invoke, is left alone instead of being resurrected into
    // a duplicate import loop.
    const [claimed] = await db.update(importBatches).set({
      status: "processing",
      paused_by: null,
      cancel_reason: null,
      cancelled_at: null,
      error_samples: null,
      retry_params: mergeRetryParams({ year: resolvedYear, resume_offset: resolvedOffset, retry_of, retry_count: (retry_count || 0) + 1, retry_tags, category, file_url: resolvedUrl, npi_filter: effNpiFilter, state_filter: effStateFilter, headers: effHeaders, license_type: effLicenseType, as_of: effAsOf }),
      updated_date: new Date(),
    }).where(and(
      eq(importBatches.id, batch_id),
      inArray(importBatches.status, [
        // "validating": pre-created by the import wizard, not yet started.
        "validating", "paused", "pausing", "failed", "cancelled", "completed_with_errors",
      ]),
    )).returning({ id: importBatches.id });
    if (!claimed) {
      throw { status: 409, message: `Batch ${batch_id} is no longer resumable (it finished or was already resumed).` };
    }
    activeBatchId = batch_id;
  } else {
    const { batch, conflict } = await insertBatchAtomically(import_type, {
      import_type,
      file_name: isLocalUpload(resolvedUrl) ? resolvedUrl.split("/").pop() : `cms_${import_type}_${resolvedYear}`,
      status: "processing",
      dry_run: !!dry_run,
      total_rows: 0,
      imported_rows: 0,
      retry_params: { year: resolvedYear, resume_offset: resolvedOffset, retry_of, retry_count, retry_tags, category, file_url: resolvedUrl, npi_filter: effNpiFilter, state_filter: effStateFilter, headers: effHeaders, license_type: effLicenseType, as_of: effAsOf },
    });
    if (conflict) throw conflict;
    activeBatchId = batch.id;
  }

  await markImportStarted(import_type, activeBatchId, sourceForUrl(resolvedUrl)).catch((e) => console.warn("[triggerImport] registry:", e?.message));

  setTimeout(() => {
    handleAutoImportCMSData({
      import_type,
      file_url: resolvedUrl,
      year: resolvedYear,
      dry_run,
      resume_offset: resolvedOffset,
      batch_id: activeBatchId,
      npi_filter: effNpiFilter,
      state_filter: effStateFilter,
      as_of: effAsOf,
      // Column names for a headerless CSV upload (e.g. the FOIA shared-patient files).
      headers: effHeaders,
      // State licensing files: the license type the file holds when its rows don't say.
      license_type: effLicenseType,
    }).catch((e) => console.error(`[triggerImport] CMS import error:`, e.message));
  }, 100);

  return {
    success: true,
    message: batch_id
      ? `Resuming import for ${import_type} from offset ${resolvedOffset}. Check Data Center for progress.`
      : `Import process for ${import_type} started in the background. Check Data Center for progress.`,
    import_type,
    batch_id: activeBatchId,
    file_url: resolvedUrl,
    year: resolvedYear,
    dry_run,
    resumed: !!batch_id,
  };
}


async function safeImportQuery<T>(fn: () => Promise<T>, fallback: T, label: string): Promise<T> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      if (attempt === 3) {
        const pgCode = e.code || e.cause?.code || '';
        const pgDetail = e.detail || e.cause?.detail || '';
        console.warn(`[CMS Import] ${label} failed after 3 attempts: [${pgCode}] ${e.message?.slice(0, 300)}${pgDetail ? ' | detail: ' + pgDetail : ''}`);
        return fallback;
      }
      await new Promise(r => setTimeout(r, attempt * 2000));
    }
  }
  return fallback;
}

// Fetch existing rows matching the given primary values, in bounded batches so a
// single query can't pull an unbounded result set. Extra scope conditions narrow
// the lookup to the relevant import_type / data_year.
async function fetchExistingByPrimary(
  table: any,
  primaryCol: string,
  values: string[],
  scope: Array<{ col: string; value: any }>,
): Promise<any[]> {
  const out: any[] = [];
  for (let i = 0; i < values.length; i += LOOKUP_PRIMARY_BATCH_SIZE) {
    const slice = values.slice(i, i + LOOKUP_PRIMARY_BATCH_SIZE);
    const conds = [inArray((table as any)[primaryCol], slice)];
    for (const s of scope) {
      const col = (table as any)[s.col];
      if (s.col === "data_year") {
        conds.push(sql`TRIM(${col}) = ${String(s.value).trim()}`);
      } else {
        conds.push(eq(col, s.value));
      }
    }
    const rows = await safeImportQuery(
      () => db.select().from(table).where(and(...conds)).limit(20000),
      [] as any[], `lookup existing ${primaryCol}`,
    );
    if (rows.length === 20000) {
      const scopeInfo = scope.map(s => `${s.col}=${s.value}`).join(', ');
      console.warn(`[CMS Import] fetchExistingByPrimary hit 20000-row limit for ${primaryCol}, slice [${i}..${i + slice.length}] (scope: ${scopeInfo}) — some existing rows may be missed in deduplication`);
    }
    out.push(...rows);
  }
  return out;
}

// Sort a chunk of medicare_facilities rows against what's already stored into
// new rows and rows to refresh in place. Rows are identified by provider_id when
// present, otherwise by facility_name, always scoped to the current
// facility_type (import_type); the table keeps one row per identity, and a
// later release replaces it (see partitionRefresh).
async function dedupeFacilities(importType: string, chunk: any[]): Promise<{ toCreate: any[]; toRefresh: Array<{ id: number; row: any }> }> {
  const withPid = chunk.filter((r) => r.provider_id);
  const noPid = chunk.filter((r) => !r.provider_id && r.facility_name);

  const toCreate: any[] = [];
  const toRefresh: Array<{ id: number; row: any }> = [];

  if (withPid.length > 0) {
    const pids = distinctValues(withPid, "provider_id");
    const existing = await fetchExistingByPrimary(medicareFacilities, "provider_id", pids, [
      { col: "facility_type", value: importType },
    ]);
    const part = partitionRefresh(withPid, existing as any, ["provider_id"]);
    toCreate.push(...part.toCreate);
    toRefresh.push(...part.toRefresh);
  }

  if (noPid.length > 0) {
    const names = distinctValues(noPid, "facility_name");
    const existing = await fetchExistingByPrimary(medicareFacilities, "facility_name", names, [
      { col: "facility_type", value: importType },
    ]);
    const part = partitionRefresh(noPid, existing as any, ["facility_name"]);
    toCreate.push(...part.toCreate);
    toRefresh.push(...part.toRefresh);
  }

  return { toCreate, toRefresh };
}

/**
 * Overwrite stored facility rows with the same identity from a later release:
 * one UPDATE per chunk, and the raw_data side table follows in the same
 * transaction. Identity fields keep their old value when the new release leaves
 * them blank; the vintage, batch and raw record always move to the new release.
 * The star rating of a dataset that carries one (OVERALL_RATING_COLUMN) is replaced
 * as well, so a facility the release no longer rates loses its stars.
 * Discharge and payment totals are replaced only for the inpatient-by-provider file,
 * including a suppressed (null) reimport, so a Care Compare refresh cannot wipe them.
 */
export async function refreshFacilityRows(
  tx: { execute: (q: any) => Promise<any>; insert: (table: any) => any },
  rows: Array<{ id: number; row: Record<string, any> }>,
): Promise<void> {
  if (rows.length === 0) return;
  const tuples = rows.map(({ id, row }) => sql`(${id}::int, ${row.facility_name ?? null}::text, ${row.address ?? null}::text, ${row.city ?? null}::text, ${row.state ?? null}::text, ${row.zip ?? null}::text, ${row.quality_rating ?? null}::float8, ${hasStarRating(row.facility_type)}::boolean, ${row.data_year ?? null}::text, ${row.import_batch_id ?? null}::text, ${JSON.stringify(row.raw_data ?? null)}::jsonb, ${row.total_discharges ?? null}::int, ${row.total_days_of_care ?? null}::int, ${row.total_charges ?? null}::float8, ${row.total_payments ?? null}::float8, ${row.facility_type === "medicare_inpatient_by_provider"}::boolean)`);
  await tx.execute(sql`
    UPDATE medicare_facilities AS m SET
      facility_name = COALESCE(v.facility_name, m.facility_name),
      address = COALESCE(v.address, m.address),
      city = COALESCE(v.city, m.city),
      state = COALESCE(v.state, m.state),
      zip = COALESCE(v.zip, m.zip),
      quality_rating = CASE WHEN v.rated THEN v.quality_rating ELSE m.quality_rating END,
      total_discharges = CASE WHEN v.volume THEN v.total_discharges ELSE m.total_discharges END,
      total_days_of_care = CASE WHEN v.volume THEN v.total_days_of_care ELSE m.total_days_of_care END,
      total_charges = CASE WHEN v.volume THEN v.total_charges ELSE m.total_charges END,
      total_payments = CASE WHEN v.volume THEN v.total_payments ELSE m.total_payments END,
      data_year = v.data_year,
      import_batch_id = v.import_batch_id,
      raw_data = v.raw_data,
      updated_date = NOW()
    FROM (VALUES ${sql.join(tuples, sql`, `)}) AS v(id, facility_name, address, city, state, zip, quality_rating, rated, data_year, import_batch_id, raw_data, total_discharges, total_days_of_care, total_charges, total_payments, volume)
    WHERE m.id = v.id`);
  const rawRows = rows.filter(({ row }) => row.raw_data != null).map(({ id, row }) => ({ facility_id: id, raw_data: row.raw_data }));
  if (rawRows.length > 0) {
    await tx.insert(medicareFacilitiesRaw).values(rawRows).onConflictDoUpdate({
      target: medicareFacilitiesRaw.facility_id,
      set: { raw_data: sql`excluded.raw_data`, updated_at: sql`NOW()` },
    });
  }
}

// Dual-write helper for medicare_facilities → medicare_facilities_raw split.
// Phase 1: every facility insert also mirrors raw_data into the side table.
// Must run inside a transaction so the column and the side-table row land
// together (or neither does). Exported for unit-testing the contract.
export async function dualWriteFacilityRows(
  tx: { insert: (table: any) => any },
  rows: Array<Record<string, any>>,
): Promise<void> {
  if (rows.length === 0) return;
  const inserted = await tx
    .insert(medicareFacilities)
    .values(rows)
    .returning({ id: medicareFacilities.id });
  const rawRows = rows
    .map((row, idx) => ({ facility_id: inserted[idx]?.id, raw_data: row.raw_data }))
    .filter((r) => r.facility_id != null && r.raw_data != null);
  if (rawRows.length > 0) {
    await tx.insert(medicareFacilitiesRaw).values(rawRows).onConflictDoUpdate({
      target: medicareFacilitiesRaw.facility_id,
      set: { raw_data: sql`excluded.raw_data`, updated_at: sql`NOW()` },
    });
  }
}
/**
 * Inserts mapped CMS rows into the appropriate destination table, applying per-import-type mapping, chunked deduplication, and conflict-tolerant insertion.
 *
 * @param importType - Import type that determines mapping and destination routing. Examples: `"cms_order_referring"` → upserts into `cmsOrderReferring` (one row per NPI); `"provider_service_utilization"` → `providerServiceUtilization`; `"physician_shared_patient_patterns"` → `cmsReferrals`; other import types are treated as facility-like and inserted into `medicareFacilities`.
 * @param rows - Raw CMS dataset rows to be mapped and inserted.
 * @param year - Data year used when mapping rows and when scoping natural-key deduplication.
 * @param batchId - Import batch identifier to attach to mapped rows.
 * @returns An object with:
 *   - `inserted`: number of rows successfully inserted,
 *   - `skipped`: number of rows skipped due to deduplication or per-row insert failures,
 *   - `filtered`: number of input rows removed before mapping (e.g., invalid or missing required keys).
 */
// Typed destinations (server/functions/cmsTypedTables.ts): map, drop rows
// without a key, and upsert on the natural key so a re-import or a newer
// vintage replaces rather than duplicates or collapses.
async function insertTypedRows(importType: string, rows: any[], year: number, batchId: number, asOf: string | null | undefined, params?: Record<string, unknown> | null): Promise<{ inserted: number; skipped: number; filtered: number }> {
  const route = TYPED_ROUTES[importType];
  let countyForZip: ((zip: string) => string | null) | undefined;
  if (route.needsGeo) {
    // State licensing files carry ZIPs, not counties: the Census geography gives each ZIP its county.
    // Without it every row would be stored with no county and vanish from every county view.
    const { getGeoIndex, zipToCounty } = await import("../lib/geo");
    const index = await getGeoIndex(pool).catch(() => null);
    if (!index || index.counties.size === 0) throw new Error(GEOGRAPHY_MISSING);
    countyForZip = (zip) => zipToCounty(index, zip)?.fips ?? null;
  }
  const { rows: mapped, dropped } = mapTypedRows(route, rows, { year, asOf, batchId, params: params ?? null, countyForZip });
  if (mapped.length === 0) return { inserted: 0, skipped: 0, filtered: dropped };
  const columns = Object.keys(getTableColumns(route.table));
  const set = Object.fromEntries(columns.filter((c) => c !== "id" && !route.key.includes(c)).map((c) => [c, sql.raw(`excluded."${c}"`)]));
  const target = route.key.map((k) => route.table[k]);
  let inserted = 0;
  let skipped = 0;
  const CHUNK = 500;
  for (let i = 0; i < mapped.length; i += CHUNK) {
    const chunk = mapped.slice(i, i + CHUNK);
    const ok = await safeImportQuery(async () => {
      await db.insert(route.table).values(chunk).onConflictDoUpdate({ target, set });
      return chunk.length;
    }, -1, `typed upsert ${importType}`);
    if (ok >= 0) {
      inserted += ok;
      continue;
    }
    for (const row of chunk) {
      const one = await safeImportQuery(async () => {
        await db.insert(route.table).values(row).onConflictDoUpdate({ target, set });
        return true;
      }, false, `typed upsert ${importType} (row)`);
      if (one) inserted++;
      else skipped++;
    }
  }
  return { inserted, skipped, filtered: dropped };
}

async function insertCMSRows(importType: string, rows: any[], year: number, batchId: number, opts: { asOf?: string | null; params?: Record<string, unknown> | null } = {}): Promise<{ inserted: number; skipped: number; filtered: number }> {
  if (rows.length === 0) return { inserted: 0, skipped: 0, filtered: 0 };
  if (TYPED_ROUTES[importType]) return insertTypedRows(importType, rows, year, batchId, opts.asOf, opts.params);

  const CHUNK_SIZE = 500;
  let inserted = 0;
  let skipped = 0;

  let mapped: any[];
  let table: any;

  if (importType === "cms_order_referring") {
    // One row per NPI, last one wins within a page (ON CONFLICT can't touch
    // the same row twice in one statement).
    const byNpi = new Map<string, any>();
    for (const r of rows) {
      const m = mapCMSOrderReferringRow(r, batchId, opts.asOf ?? new Date().toISOString().slice(0, 10));
      if (m.npi) byNpi.set(m.npi, m);
    }
    mapped = [...byNpi.values()];
    table = cmsOrderReferring;
  } else if (importType === "provider_service_utilization") {
    mapped = rows.map(r => mapCMSUtilizationRow(r, year, batchId));
    mapped = mapped.filter(r => r.npi);
    table = providerServiceUtilization;
  } else if (importType === "physician_shared_patient_patterns") {
    // Provider-to-provider shared-patient edges -> cms_referrals.
    const windowDays = sharedPatientWindowDays(opts.params?.file_url);
    mapped = rows.map(r => mapSharedPatientPatternRow(r, year, batchId, windowDays));
    mapped = mapped.filter(r => r.npi && r.referred_to_npi);
    table = cmsReferrals;
  } else {
    mapped = rows.map(r => mapMedicareFacilityRow(r, importType, batchId, year));
    mapped = mapped.filter(r => r.provider_id || r.facility_name);
    table = medicareFacilities;
  }

  if (mapped.length === 0) return { inserted: 0, skipped: 0, filtered: rows.length };

  const filteredCount = rows.length - mapped.length;
  const keyConfig = CMS_NATURAL_KEYS[importType];

  for (let i = 0; i < mapped.length; i += CHUNK_SIZE) {
    let chunk = mapped.slice(i, i + CHUNK_SIZE);

    // Natural-key de-duplication: drop rows that already exist (from a prior
    // import/resume) or repeat within this chunk, so re-imports don't multiply data.
    if (table === medicareFacilities) {
      const before = chunk.length;
      const plan = await dedupeFacilities(importType, chunk);
      chunk = plan.toCreate;
      skipped += before - plan.toCreate.length - plan.toRefresh.length;
      if (plan.toRefresh.length > 0) {
        // Rows written count as imported, whether new or refreshed.
        const refreshed = await safeImportQuery(
          async () => {
            await db.transaction(async (tx) => { await refreshFacilityRows(tx, plan.toRefresh); });
            return plan.toRefresh.length;
          },
          -1, `refresh ${importType}`,
        );
        if (refreshed >= 0) inserted += refreshed;
        else skipped += plan.toRefresh.length;
      }
    } else if (keyConfig) {
      const before = chunk.length;
      const primaryValues = distinctValues(chunk, keyConfig.primaryCol);
      if (primaryValues.length > 0) {
        const existing = await fetchExistingByPrimary(table, keyConfig.primaryCol, primaryValues, [
          { col: "data_year", value: String(year) },
        ]);
        chunk = partition(chunk, existing, keyConfig.keyCols).toCreate;
      }
      skipped += before - chunk.length;
    }

    if (chunk.length === 0) continue;

    // For medicare_facilities we dual-write into medicare_facilities_raw (the
    // side table that owns the wide raw_data blob). Phase 1 of the column
    // split — the facility row keeps its raw_data column so existing readers
    // still work during the rollout; phase 2 drops the column once readers
    // have switched and the dual-write has soaked. Wrapping the bulk insert
    // + raw mirror in a single transaction keeps the two tables consistent
    // even if the second statement errors.
    const isFacility = table === medicareFacilities;
    // Order & Referring is a complete snapshot per release: replace by NPI.
    const upsertByNpi = table === cmsOrderReferring;
    const ORDER_REFERRING_SET = {
      last_name: sql`excluded.last_name`, first_name: sql`excluded.first_name`,
      partb: sql`excluded.partb`, dme: sql`excluded.dme`, hha: sql`excluded.hha`, pmd: sql`excluded.pmd`, hospice: sql`excluded.hospice`,
      as_of: sql`excluded.as_of`, import_batch_id: sql`excluded.import_batch_id`, updated_date: sql`excluded.updated_date`,
    };
    const insertRows = async (values: any[]) => {
      if (upsertByNpi) await db.insert(cmsOrderReferring).values(values).onConflictDoUpdate({ target: cmsOrderReferring.npi, set: ORDER_REFERRING_SET });
      else await db.insert(table).values(values);
    };

    const result = await safeImportQuery(
      async () => {
        if (isFacility) {
          await db.transaction(async (tx) => {
            await dualWriteFacilityRows(tx, chunk);
          });
        } else {
          await insertRows(chunk);
        }
        return chunk.length;
      },
      -1, `bulk insert ${importType}`
    );
    if (result >= 0) {
      inserted += result;
    } else {
      for (const row of chunk) {
        const ok = await safeImportQuery(
          async () => {
            if (isFacility) {
              await db.transaction(async (tx) => {
                await dualWriteFacilityRows(tx, [row]);
              });
            } else {
              await insertRows([row]);
            }
            return true;
          },
          false, `single insert ${importType}`
        );
        if (ok) inserted++;
        else skipped++;
      }
    }
  }

  return { inserted, skipped, filtered: filteredCount };
}

// A CSV file (an upload, or an https link) through the same page/insert/
// progress/completion path as the CMS APIs. resume_offset counts data rows.
async function importFromCsv(params: any, rowFilter: ((row: any) => boolean) | null) {
  const { import_type, file_url, year, dry_run, resume_offset = 0, batch_id, total_inserted = 0, total_skipped = 0, headers, as_of = null, npi_filter, state_filter } = params;
  const PAGE_SIZE = 1000;
  const PAUSE_CHECK_INTERVAL = 5;
  const PROGRESS_UPDATE_INTERVAL = 5;
  let totalFetched = Number(resume_offset) || 0;
  let totalInserted = Number(total_inserted) || 0;
  let totalSkipped = Number(total_skipped) || 0;
  const errors: any[] = [];
  let pages = 0;

  const saveProgress = (extra: Record<string, unknown> = {}) => safeImportQuery(
    () => db.update(importBatches).set({
      ...extra,
      imported_rows: totalInserted,
      skipped_rows: totalSkipped,
      total_rows: totalFetched,
      retry_params: mergeRetryParams({ ...params, resume_offset: totalFetched, total_inserted: totalInserted, total_skipped: totalSkipped }),
      updated_date: new Date(),
    }).where(eq(importBatches.id, batch_id)),
    undefined, `progress ${import_type}`,
  );

  // Whether the user paused or cancelled the batch since it was last looked at (it then stops, keeping its place).
  // 'pausing'/'cancelling' are the UI's intermediate states: the worker
  // acknowledges them here by writing the final status.
  const stoppedByUser = async (): Promise<boolean> => {
    const [current] = await safeImportQuery(
      () => db.select().from(importBatches).where(eq(importBatches.id, batch_id)).limit(1),
      [] as any[], `pause check ${import_type}`,
    );
    const finalStatus = current?.status === "pausing" ? "paused"
      : current?.status === "cancelling" ? "cancelled"
      : current?.status;
    if (current && (finalStatus === "paused" || finalStatus === "cancelled")) {
      console.log(`[CsvImport] Import ${import_type} ${finalStatus} by user at row ${totalFetched}`);
      await saveProgress({ status: finalStatus });
      await endedWithoutFinishing(import_type, batch_id, finalStatus);
      return true;
    }
    return false;
  };

  try {
    const explicitHeaders = Array.isArray(headers) && headers.length ? headers.map(String) : null;
    // A caller that treated the first data line as a header (two NPIs and counts) is corrected.
    const foiaHeaders = explicitHeaders && looksLikeSharedPatientLine(explicitHeaders.join(","))
      ? [...SHARED_PATIENT_FOIA_HEADERS]
      : explicitHeaders;
    const records = csvSourceRecords(file_url, {
      headers: foiaHeaders,
      detectSharedPatient: import_type === "physician_shared_patient_patterns" && !foiaHeaders,
    });
    for await (const page of pageRecords(records, PAGE_SIZE, Number(resume_offset) || 0)) {
      pages++;
      if (pages % PAUSE_CHECK_INTERVAL === 0 && await stoppedByUser()) return;
      let rows = page.rows;
      if (rowFilter) {
        const before = rows.length;
        rows = rows.filter(rowFilter);
        totalSkipped += before - rows.length;
      }
      if (!dry_run && rows.length > 0) {
        try {
          const result = await insertCMSRows(import_type, rows, year, batch_id, { asOf: as_of, params });
          totalInserted += result.inserted;
          totalSkipped += result.skipped + result.filtered;
        } catch (e: any) {
          console.error(`[CsvImport] Insert error at row ${page.offset}: ${e.message}`);
          errors.push({ offset: page.offset, message: `Insert error: ${e.message}` });
          totalSkipped += rows.length;
        }
      }
      totalFetched = page.nextOffset;
      if (pages % PROGRESS_UPDATE_INTERVAL === 0) await saveProgress();
    }

    // A cancel that came in since the last check must not be overwritten by "completed".
    if (await stoppedByUser()) return;
    await safeImportQuery(
      () => db.update(importBatches).set({
        status: "completed",
        completed_at: new Date(),
        imported_rows: totalInserted,
        skipped_rows: totalSkipped,
        total_rows: totalFetched,
        error_samples: errors.length > 0 ? errors.slice(-5) : null,
        updated_date: new Date(),
      }).where(eq(importBatches.id, batch_id)),
      undefined, `complete ${import_type}`,
    );
    console.log(`[CsvImport] Completed ${import_type}: rows=${totalFetched}, inserted=${totalInserted}, skipped=${totalSkipped}`);
    await markImportFinished(import_type, { batchId: batch_id, ok: !dry_run, rowCount: totalFetched, dataYear: year, note: dry_run ? "dry run" : `file ${String(file_url).split("/").pop()}` }).catch(() => {});
    retireSnapshotRows(import_type, batch_id, { dry_run, npi_filter, state_filter, errors: errors.length });
  } catch (e: any) {
    console.error(`[CsvImport] Fatal error:`, e.message);
    await saveProgress({ status: "failed", error_samples: [{ message: e.message, phase: "csv_import" }] });
    await recordImportFailureAlert(batch_id, import_type, e.message);
    await markImportFinished(import_type, { batchId: batch_id, ok: false, note: String(e.message || e).slice(0, 200) }).catch(() => {});
  }
  await settleBatchCompletion(batch_id);
}

export async function handleAutoImportCMSData(params: any) {
  const { import_type, file_url, year, dry_run, resume_offset = 0, batch_id, total_inserted = 0, total_skipped = 0, npi_filter, state_filter, as_of = null } = params;
  // Optional row-level filters from the import dialog. Built once; null when no
  // filter is configured so the common path stays allocation-free.
  const rowFilter = buildImportRowFilter(npi_filter, state_filter, { stateOptional: !!TYPED_ROUTES[import_type]?.stateFromParams });
  const sourceKind = sourceKindFor(file_url);
  if (sourceKind === "local_csv" || sourceKind === "remote_csv") {
    return importFromCsv(params, rowFilter);
  }
  const PAGE_SIZE = 1000;
  const PAUSE_CHECK_INTERVAL = 5;
  const PROGRESS_UPDATE_INTERVAL = 5;
  const MAX_PAGES = 50000;
  const isProviderDataAPI = file_url.includes("/datastore/query/");

  try {
    let offset = Number(resume_offset) || 0;
    let totalFetched = offset;
    let totalInserted = Number(total_inserted) || 0;
    let totalSkipped = Number(total_skipped) || 0;
    let hasMore = true;
    let consecutiveErrors = 0;
    let pagesSinceProgressUpdate = 0;
    let pagesSincePauseCheck = 0;
    const errors: any[] = [];
    // A state_filter that no row can satisfy (the dataset names no state, by column, CCN or FIPS code) would read
    // every page and import nothing. Watch the first rows and stop with the reason instead.
    let stateCheck = rowFilter && parseFilterList(state_filter).length > 0 && !TYPED_ROUTES[import_type]?.stateFromParams ? stateProbe(stateOfRow) : null;

    let pageCount = 0;
    while (hasMore && pageCount < MAX_PAGES) {
      pageCount++;
      pagesSincePauseCheck++;
      if (pagesSincePauseCheck >= PAUSE_CHECK_INTERVAL) {
        pagesSincePauseCheck = 0;
        const [currentBatch] = await safeImportQuery(
          () => db.select().from(importBatches).where(eq(importBatches.id, batch_id)).limit(1),
          [] as any[], `pause check ${import_type}`
        );
        // 'pausing'/'cancelling' are the UI's intermediate states: the worker
        // acknowledges them here by writing the final status.
        const stopStatus = currentBatch?.status === "pausing" ? "paused"
          : currentBatch?.status === "cancelling" ? "cancelled"
          : currentBatch?.status;
        if (currentBatch && (stopStatus === "paused" || stopStatus === "cancelled")) {
          console.log(`[AutoImportCMS] Import ${import_type} ${stopStatus} by user at offset ${offset}`);
          await safeImportQuery(
            () => db.update(importBatches).set({
              status: stopStatus,
              imported_rows: totalInserted,
              skipped_rows: totalSkipped,
              total_rows: totalFetched,
              retry_params: mergeRetryParams({ ...params, resume_offset: offset, total_inserted: totalInserted, total_skipped: totalSkipped }),
              updated_date: new Date(),
            }).where(eq(importBatches.id, batch_id)),
            undefined, `save progress on ${stopStatus}`
          );
          await endedWithoutFinishing(import_type, batch_id, stopStatus);
          return;
        }
      }

      let url: string;
      if (isProviderDataAPI) {
        const separator = file_url.includes("?") ? "&" : "?";
        url = `${file_url}${separator}offset=${offset}&limit=${PAGE_SIZE}`;
      } else {
        const separator = file_url.includes("?") ? "&" : "?";
        url = `${file_url}${separator}offset=${offset}&size=${PAGE_SIZE}`;
      }

      let response: Response;
      const fetchTimeoutMs = offset > 1000000 ? 300000 : offset > 500000 ? 240000 : offset > 200000 ? 180000 : offset > 50000 ? 120000 : 60000;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), fetchTimeoutMs);
        response = await safeFetchStream(url, { signal: controller.signal });
        clearTimeout(timeout);
      } catch (e: any) {
        const isAbort = e.name === 'AbortError' || (e.message && e.message.includes('aborted'));
        consecutiveErrors++;
        const errMsg = `Fetch failed at offset ${offset}: ${e.message}`;
        console.error(`[AutoImportCMS] ${errMsg} (timeout=${fetchTimeoutMs}ms, attempt ${consecutiveErrors}/7)`);
        errors.push({ offset, message: errMsg });
        // A URL or address the SSRF guard refused won't work on a retry.
        const maxRetries = e instanceof SafeFetchError ? 1 : isAbort ? 7 : 5;
        if (consecutiveErrors >= maxRetries) {
          await safeImportQuery(
            () => db.update(importBatches).set({
              status: "failed",
              imported_rows: totalInserted,
              skipped_rows: totalSkipped,
              total_rows: totalFetched,
              error_samples: errors.slice(-5),
              retry_params: mergeRetryParams({ ...params, resume_offset: offset, total_inserted: totalInserted, total_skipped: totalSkipped }),
              updated_date: new Date(),
            }).where(eq(importBatches.id, batch_id)),
            undefined, `fail on fetch error ${import_type}`
          );
          await recordImportFailureAlert(batch_id, import_type, errMsg);
          await endedWithoutFinishing(import_type, batch_id, "failed", errMsg);
          return;
        }
        const baseBackoff = isAbort ? 5000 : 3000;
        const backoffMs = Math.min(baseBackoff * Math.pow(2, consecutiveErrors - 1), 60000);
        console.log(`[AutoImportCMS] Retry ${consecutiveErrors}/${maxRetries} in ${backoffMs}ms for offset ${offset}`);
        await new Promise(r => setTimeout(r, backoffMs));
        continue;
      }

      if (response.status === 429) {
        console.warn(`[AutoImportCMS] Rate limited at offset ${offset}, waiting 10s`);
        await new Promise(r => setTimeout(r, 10000));
        continue;
      }

      if (!response.ok) {
        consecutiveErrors++;
        const errMsg = `HTTP ${response.status} at offset ${offset}`;
        console.error(`[AutoImportCMS] ${errMsg}`);
        errors.push({ offset, message: errMsg });
        if (consecutiveErrors >= 5) {
          await safeImportQuery(
            () => db.update(importBatches).set({
              status: "failed",
              imported_rows: totalInserted,
              skipped_rows: totalSkipped,
              total_rows: totalFetched,
              error_samples: errors.slice(-5),
              retry_params: mergeRetryParams({ ...params, resume_offset: offset, total_inserted: totalInserted, total_skipped: totalSkipped }),
              updated_date: new Date(),
            }).where(eq(importBatches.id, batch_id)),
            undefined, `fail on HTTP error ${import_type}`
          );
          await recordImportFailureAlert(batch_id, import_type, errMsg);
          await endedWithoutFinishing(import_type, batch_id, "failed", errMsg);
          return;
        }
        const backoffMs = Math.min(2000 * Math.pow(2, consecutiveErrors - 1), 30000);
        await new Promise(r => setTimeout(r, backoffMs));
        continue;
      }

      consecutiveErrors = 0;
      const data = await response.json();
      const rows = Array.isArray(data) ? data : data.results || data.data || [];

      if (rows.length === 0) {
        hasMore = false;
        break;
      }

      if (stateCheck) {
        const verdict = stateCheck.page(rows);
        if (verdict === "ok") {
          stateCheck = null;
        } else if (verdict === "unsupported" || (rows.length < PAGE_SIZE && stateCheck.exhaustedWithoutState())) {
          const errMsg = stateFilterUnsupportedMessage(import_type, state_filter);
          console.error(`[AutoImportCMS] ${errMsg}`);
          errors.push({ offset, message: errMsg });
          await safeImportQuery(
            () => db.update(importBatches).set({
              status: "failed",
              imported_rows: totalInserted,
              skipped_rows: totalSkipped + rows.length,
              total_rows: totalFetched + rows.length,
              error_samples: errors.slice(-5),
              retry_params: mergeRetryParams({ ...params, resume_offset: offset, total_inserted: totalInserted, total_skipped: totalSkipped }),
              updated_date: new Date(),
            }).where(eq(importBatches.id, batch_id)),
            undefined, `fail on unusable state_filter ${import_type}`
          );
          await recordImportFailureAlert(batch_id, import_type, errMsg);
          await endedWithoutFinishing(import_type, batch_id, "failed", errMsg);
          return;
        }
      }

      // Apply the optional npi_filter / state_filter to this page. Pagination
      // (offset / hasMore) still uses the ORIGINAL row count; rows removed by
      // the filter are counted as skipped.
      let pageRows = rows;
      if (rowFilter) {
        const beforeLen = pageRows.length;
        pageRows = pageRows.filter(rowFilter);
        totalSkipped += beforeLen - pageRows.length;
      }

      if (!dry_run && pageRows.length > 0) {
        try {
          const result = await insertCMSRows(import_type, pageRows, year, batch_id, { asOf: as_of });
          totalInserted += result.inserted;
          totalSkipped += result.skipped + result.filtered;
        } catch (e: any) {
          console.error(`[AutoImportCMS] Insert error at offset ${offset}: ${e.message}`);
          errors.push({ offset, message: `Insert error: ${e.message}` });
        }
      }

      totalFetched += rows.length;
      offset += rows.length;

      pagesSinceProgressUpdate++;
      if (pagesSinceProgressUpdate >= PROGRESS_UPDATE_INTERVAL || rows.length < PAGE_SIZE) {
        pagesSinceProgressUpdate = 0;
        await safeImportQuery(
          () => db.update(importBatches).set({
            imported_rows: totalInserted,
            skipped_rows: totalSkipped,
            total_rows: totalFetched,
            retry_params: mergeRetryParams({ ...params, resume_offset: offset, total_inserted: totalInserted, total_skipped: totalSkipped }),
            updated_date: new Date(),
          }).where(eq(importBatches.id, batch_id)),
          undefined, `update progress ${import_type}`
        );
      }

      if (rows.length < PAGE_SIZE) {
        hasMore = false;
      }

      await new Promise(r => setTimeout(r, 50));
    }

    if (hasMore && pageCount >= MAX_PAGES) {
      console.warn(`[AutoImportCMS] Safety limit reached at offset ${offset} after ${MAX_PAGES} pages, inserted=${totalInserted}. Marking incomplete.`);
      await safeImportQuery(
        () => db.update(importBatches).set({
          status: "completed_with_errors",
          imported_rows: totalInserted,
          skipped_rows: totalSkipped,
          total_rows: totalFetched,
          error_samples: [{ message: `Import stopped after ${MAX_PAGES} pages at offset ${offset}. Resume to continue.`, phase: "safety_limit" }],
          retry_params: mergeRetryParams({ ...params, resume_offset: offset, total_inserted: totalInserted, total_skipped: totalSkipped }),
          updated_date: new Date(),
        }).where(eq(importBatches.id, batch_id)),
        undefined, `safety limit ${import_type}`
      );
      await markImportFinished(import_type, { batchId: batch_id, ok: false, note: `stopped after ${MAX_PAGES} pages; resume to continue` }).catch(() => {});
      await settleBatchCompletion(batch_id);
      return;
    }

    await safeImportQuery(
      () => db.update(importBatches).set({
        status: "completed",
        completed_at: new Date(),
        imported_rows: totalInserted,
        skipped_rows: totalSkipped,
        total_rows: totalFetched,
        error_samples: errors.length > 0 ? errors.slice(-5) : null,
        updated_date: new Date(),
      }).where(eq(importBatches.id, batch_id)),
      undefined, `complete ${import_type}`
    );
    console.log(`[AutoImportCMS] Completed ${import_type}: fetched=${totalFetched}, inserted=${totalInserted}, skipped=${totalSkipped}`);
    await markImportFinished(import_type, { batchId: batch_id, ok: !dry_run, rowCount: totalFetched, dataYear: year, note: dry_run ? "dry run" : null }).catch(() => {});
    retireSnapshotRows(import_type, batch_id, { dry_run, npi_filter, state_filter, errors: errors.length });
    if (import_type === "cms_order_referring" && !dry_run) {
      // The eligibility rows that used to land in cms_referrals come out now
      // that the typed table holds this release; long on a big table, so it
      // runs on after the batch is marked complete.
      import("../lib/orderReferringCleanup").then(({ purgeOrderReferringRows }) => purgeOrderReferringRows()).catch((err) => console.warn("[AutoImportCMS] order/referring cleanup:", err?.message));
    }
    await settleBatchCompletion(batch_id);
  } catch (e: any) {
    console.error(`[AutoImportCMS] Fatal error:`, e.message);
    await safeImportQuery(
      () => db.update(importBatches).set({
        status: "failed",
        error_samples: [{ message: e.message, phase: "cms_import" }],
        retry_params: mergeRetryParams({ ...params, resume_offset: resume_offset }),
        updated_date: new Date(),
      }).where(eq(importBatches.id, batch_id)),
      undefined, `fail ${import_type}`
    );
    await recordImportFailureAlert(batch_id, import_type, e.message);
    await markImportFinished(import_type, { batchId: batch_id, ok: false, note: String(e.message || e).slice(0, 200) }).catch(() => {});
    await settleBatchCompletion(batch_id);
  }
}
