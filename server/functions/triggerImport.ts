import { db } from "../db";
import { importBatches, cmsReferrals, providerServiceUtilization, medicareFacilities } from "../db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { handleImportNPPESFlatFile } from "./importNPPESFlatFile";

const IMPORT_TYPE_ALIASES: Record<string, string> = {
  cms_utilization: "provider_service_utilization",
};

const IMPORT_TYPE_URLS: Record<string, string> = {
  provider_service_utilization: "https://data.cms.gov/data-api/v1/dataset/92396110-2aed-4d63-a6a2-5d6207d46a29/data",
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
  dialysis_facility_listing: "https://data.cms.gov/provider-data/api/1/datastore/query/23ew-n7w9/0",
  dialysis_state_averages: "https://data.cms.gov/provider-data/api/1/datastore/query/2fpu-cgbb/0",
  dialysis_national_averages: "https://data.cms.gov/provider-data/api/1/datastore/query/2rkq-ygai/0",
  nursing_home_penalties: "https://data.cms.gov/provider-data/api/1/datastore/query/g6vv-u9sr/0",
  inpatient_rehab_facility: "https://data.cms.gov/provider-data/api/1/datastore/query/bz9k-gne5/0",
  long_term_care_hospital: "https://data.cms.gov/provider-data/api/1/datastore/query/6pda-t6nr/0",
  medicare_inpatient_by_provider: "https://data.cms.gov/data-api/v1/dataset/ee6fb1a5-39b9-46b3-a980-a7284551a732/data",
  medicare_outpatient_by_provider: "https://data.cms.gov/data-api/v1/dataset/ccbc9a44-40d4-46b4-a709-5caa59212e50/data",
  medicare_physician_by_provider: "https://data.cms.gov/data-api/v1/dataset/8889d81e-2ee7-448f-8713-f071038289b5/data",
  medicare_dme_by_supplier: "https://data.cms.gov/data-api/v1/dataset/a2d56d3f-3531-4315-9d87-e29986516b41/data",
  medicare_dme_by_referring: "https://data.cms.gov/data-api/v1/dataset/f8603e5b-9c47-4c52-9b47-a4ef92dfada4/data",
  medicare_part_d_prescribers: "https://data.cms.gov/data-api/v1/dataset/14d8e8a9-7e9b-4370-a044-bf97c46b4b44/data",
  medicare_dialysis_facilities: "https://data.cms.gov/data-api/v1/dataset/f8610e87-ba25-43a3-a49e-927dbc8701ae/data",
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
};

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

function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_URL_DOMAINS.some((d) => parsed.hostname === d || parsed.hostname.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

const CMS_DATASET_CATALOG = [
  { id: "cms_order_referring", title: "Order & Referring Providers", description: "Complete list of providers eligible to order and refer Medicare services including Part B, DME, HHA, PMD, and Hospice designations.", category: "Physicians & Clinicians", records: "~2M", priority: "high" },
  { id: "provider_service_utilization", title: "Physician & Other Practitioners - by Provider and Service", description: "Utilization and payment data for Medicare Part B services by individual provider and HCPCS code.", category: "Physicians & Clinicians", records: "~10M", priority: "high" },
  { id: "medicare_physician_by_provider", title: "Physician & Other Practitioners - by Provider", description: "Aggregate utilization and payment data for Medicare Part B services summarized at the provider level.", category: "Physicians & Clinicians", records: "~1.2M", priority: "high" },
  { id: "medicare_dme_by_supplier", title: "DME Suppliers - by Supplier", description: "Medicare Durable Medical Equipment, Devices & Supplies payment and utilization data by supplier.", category: "Physicians & Clinicians", records: "~70K", priority: "medium" },
  { id: "medicare_dme_by_referring", title: "DME - by Referring Provider", description: "DME utilization data grouped by the referring physician or provider.", category: "Physicians & Clinicians", records: "~400K", priority: "medium" },
  { id: "medical_equipment_suppliers", title: "Medical Equipment Supplier Directory", description: "Directory of DMEPOS suppliers including business name, address, specialties, and supplies lists.", category: "Physicians & Clinicians", records: "~58K", priority: "medium" },
  { id: "medicare_part_d_prescribers", title: "Part D Prescribers - by Provider", description: "Medicare Part D prescribing data summarized at the individual prescriber level.", category: "Physicians & Clinicians", records: "~1.2M", priority: "medium" },
  { id: "provider_taxonomy_crosswalk", title: "Provider & Supplier Taxonomy Crosswalk", description: "Maps Medicare provider types and specialties to standard healthcare taxonomy codes.", category: "Physicians & Clinicians", records: "~4K", priority: "low" },

  { id: "hospital_enrollments", title: "Hospital Enrollments", description: "CMS enrollment data for all hospitals including NPI, CCN, organization name, address, and enrollment status.", category: "Hospitals", records: "~8K", priority: "high" },
  { id: "hospital_general_info", title: "Hospital General Information", description: "Comprehensive hospital profile data including type, ownership, emergency services, and overall quality ratings.", category: "Hospitals", records: "~5K", priority: "high" },
  { id: "hospital_all_owners", title: "Hospital All Owners", description: "Ownership information for all Medicare-certified hospitals.", category: "Hospitals", records: "~30K", priority: "medium" },
  { id: "hospital_readmissions", title: "Hospital Readmissions Reduction Program", description: "Hospital performance on readmission measures with excess readmission ratios and payment reduction data.", category: "Hospitals", records: "~20K", priority: "high" },
  { id: "hospital_complications", title: "Complications and Deaths - Hospital", description: "Hospital-level data on complication rates and mortality measures for key conditions.", category: "Hospitals", records: "~50K", priority: "high" },
  { id: "hospital_infections", title: "Healthcare Associated Infections - Hospital", description: "Hospital-level HAI data including CLABSI, CAUTI, SSI, MRSA, and C.diff infection rates.", category: "Hospitals", records: "~40K", priority: "high" },
  { id: "hospital_value_based_purchasing", title: "Hospital Value-Based Purchasing Scores", description: "Total Performance Scores for the Hospital VBP Program including clinical, efficiency, safety, and patient experience domains.", category: "Hospitals", records: "~3K", priority: "medium" },
  { id: "hospital_cost_report", title: "Hospital Provider Cost Report", description: "Cost report data including revenues, expenses, bed counts, and financial performance metrics.", category: "Hospitals", records: "~7K", priority: "medium" },
  { id: "hospital_service_area", title: "Hospital Service Area", description: "Geographic service area definitions for Medicare-certified hospitals.", category: "Hospitals", records: "~200K", priority: "low" },
  { id: "hospital_price_transparency", title: "Hospital Price Transparency Enforcement", description: "Enforcement activities and outcomes for hospital price transparency compliance.", category: "Hospitals", records: "~2K", priority: "low" },
  { id: "medicare_inpatient_by_provider", title: "Medicare Inpatient Hospitals - by Provider", description: "Inpatient hospital charge and payment data aggregated by provider including DRG utilization.", category: "Hospitals", records: "~200K", priority: "medium" },
  { id: "medicare_outpatient_by_provider", title: "Medicare Outpatient Hospitals - by Provider", description: "Outpatient hospital service utilization and payment data by provider and APC code.", category: "Hospitals", records: "~3M", priority: "medium" },

  { id: "home_health_enrollments", title: "Home Health Agency Enrollments", description: "CMS enrollment data for home health agencies including NPI, CCN, organization details, and enrollment status.", category: "Home Health", records: "~12K", priority: "high" },
  { id: "home_health_agencies", title: "Home Health Care Agencies", description: "Provider-level quality measures for home health agencies including star ratings and outcome measures.", category: "Home Health", records: "~8K", priority: "high" },
  { id: "home_health_all_owners", title: "Home Health Agency All Owners", description: "Ownership information for all Medicare-certified home health agencies.", category: "Home Health", records: "~30K", priority: "medium" },
  { id: "home_health_cost_report", title: "Home Health Agency Cost Report", description: "Financial cost report data for home health agencies including revenue, expenses, and visit counts.", category: "Home Health", records: "~12K", priority: "medium" },
  { id: "home_health_state_measures", title: "Home Health Care - State Data", description: "Quality measures for home health care aggregated at the state level.", category: "Home Health", records: "~55", priority: "low" },
  { id: "home_health_national_measures", title: "Home Health Care - National Data", description: "National-level aggregate quality and outcome measures for home health care.", category: "Home Health", records: "~1", priority: "low" },
  { id: "medicare_hha_utilization", title: "Medicare Post-Acute Care - Home Health", description: "Post-acute care utilization data for home health agencies.", category: "Home Health", records: "~10K", priority: "medium" },
  { id: "home_infusion_therapy", title: "Home Infusion Therapy Providers", description: "Directory of Medicare-enrolled home infusion therapy providers.", category: "Home Health", records: "~2K", priority: "low" },

  { id: "hospice_enrollments", title: "Hospice Enrollments", description: "CMS enrollment data for hospice providers including NPI, CCN, organization name, and enrollment status.", category: "Hospice", records: "~6K", priority: "high" },
  { id: "hospice_general_info", title: "Hospice - General Information", description: "Comprehensive hospice profile data including CCN, address, phone, ownership type, and CMS region.", category: "Hospice", records: "~6K", priority: "high" },
  { id: "hospice_provider_data", title: "Hospice - Provider Data", description: "Detailed provider-level quality and utilization measures for hospice facilities.", category: "Hospice", records: "~40K", priority: "high" },
  { id: "hospice_provider_measures", title: "Hospice CAHPS Survey - Provider Data", description: "Hospice CAHPS patient experience survey results at the provider level.", category: "Hospice", records: "~174K", priority: "medium" },
  { id: "hospice_all_owners", title: "Hospice All Owners", description: "Ownership information for all Medicare-certified hospice providers.", category: "Hospice", records: "~15K", priority: "medium" },
  { id: "hospice_state_measures", title: "Hospice CAHPS Survey - State Data", description: "State-level aggregate hospice CAHPS patient experience survey results.", category: "Hospice", records: "~1.1K", priority: "low" },
  { id: "hospice_national_measures", title: "Hospice CAHPS Survey - National Data", description: "National-level aggregate hospice CAHPS survey results.", category: "Hospice", records: "~24", priority: "low" },
  { id: "medicare_hospice_utilization", title: "Medicare Post-Acute Care - Hospice", description: "Post-acute care utilization and spending data for hospice providers.", category: "Hospice", records: "~5K", priority: "medium" },

  { id: "nursing_home_providers", title: "Nursing Home Provider Information", description: "Comprehensive nursing home data including beds, residents, ownership, star ratings, and staffing information.", category: "Nursing Homes & SNF", records: "~15K", priority: "high" },
  { id: "snf_provider_measures", title: "Skilled Nursing Facility Quality Measures", description: "Provider-level quality measures for SNFs including readmission, falls, pressure ulcers, and staffing metrics.", category: "Nursing Homes & SNF", records: "~838K", priority: "high" },
  { id: "nursing_home_deficiencies", title: "Nursing Home Deficiencies", description: "Survey deficiency data for nursing homes including scope, severity, and correction status.", category: "Nursing Homes & SNF", records: "~44K", priority: "medium" },
  { id: "nursing_home_penalties", title: "Nursing Home Penalties", description: "Civil money penalties and payment denials imposed on nursing home facilities.", category: "Nursing Homes & SNF", records: "~5K", priority: "medium" },
  { id: "medicare_snf_utilization", title: "Medicare Post-Acute Care - SNF", description: "Post-acute care utilization and spending data for skilled nursing facilities.", category: "Nursing Homes & SNF", records: "~15K", priority: "medium" },

  { id: "dialysis_facility_listing", title: "Dialysis Facility Listing", description: "Directory of all Medicare-certified dialysis facilities with addresses and key facility information.", category: "Dialysis", records: "~8K", priority: "high" },
  { id: "medicare_dialysis_facilities", title: "Medicare Dialysis Facilities", description: "Medicare enrollment and utilization data for dialysis facilities.", category: "Dialysis", records: "~8K", priority: "medium" },
  { id: "dialysis_state_averages", title: "Dialysis Facility - State Averages", description: "State-level aggregate quality measures for dialysis facilities.", category: "Dialysis", records: "~55", priority: "low" },
  { id: "dialysis_national_averages", title: "Dialysis Facility - National Averages", description: "National-level aggregate quality measures for dialysis.", category: "Dialysis", records: "~1", priority: "low" },

  { id: "fqhc_enrollments", title: "Federally Qualified Health Center Enrollments", description: "CMS enrollment data for FQHCs including NPI, organization name, address, and enrollment status.", category: "Other Facilities", records: "~15K", priority: "high" },
  { id: "inpatient_rehab_facility", title: "Inpatient Rehabilitation Facilities", description: "Quality measures and provider information for inpatient rehabilitation facilities.", category: "Other Facilities", records: "~1.2K", priority: "medium" },
  { id: "long_term_care_hospital", title: "Long-Term Care Hospitals", description: "Quality measures and provider data for long-term care hospitals.", category: "Other Facilities", records: "~400", priority: "medium" },
  { id: "aco_snf_affiliates", title: "ACO Skilled Nursing Facility Affiliates", description: "Affiliations between Accountable Care Organizations and Skilled Nursing Facilities.", category: "Other Facilities", records: "~80K", priority: "low" },
  { id: "aco_reach_providers", title: "ACO REACH Providers", description: "Provider information for ACO Realizing Equity, Access, and Community Health model participants.", category: "Other Facilities", records: "~350K", priority: "low" },

  { id: "medicare_fee_for_service_enrollment", title: "Medicare FFS Public Provider Enrollment", description: "Public enrollment data for Medicare Fee-For-Service providers.", category: "Medicare Programs", records: "~3M", priority: "medium" },
  { id: "medicare_monthly_enrollment", title: "Medicare Monthly Enrollment", description: "Monthly Medicare enrollment statistics and trends.", category: "Medicare Programs", records: "~5K", priority: "low" },
  { id: "medicare_irf_utilization", title: "Medicare Post-Acute Care - IRF", description: "Inpatient rehabilitation facility utilization and payment data.", category: "Medicare Programs", records: "~1.2K", priority: "low" },
  { id: "medicare_ltch_utilization", title: "Medicare Post-Acute Care - LTCH", description: "Long-term care hospital utilization and payment data.", category: "Medicare Programs", records: "~400", priority: "low" },
  { id: "market_saturation_county", title: "Market Saturation & Utilization - County", description: "Healthcare market saturation and utilization metrics at the county level.", category: "Medicare Programs", records: "~20K", priority: "medium" },
  { id: "market_saturation_cbsa", title: "Market Saturation & Utilization - CBSA", description: "Healthcare market saturation data at the Core-Based Statistical Area level.", category: "Medicare Programs", records: "~1K", priority: "low" },
  { id: "medicare_spending_by_drug_d", title: "Medicare Part D Spending by Drug", description: "Medicare Part D drug spending data including total spending, claims, and beneficiary counts.", category: "Medicare Programs", records: "~4K", priority: "low" },
  { id: "medicare_spending_by_drug_b", title: "Medicare Part B Spending by Drug", description: "Medicare Part B drug spending and utilization data.", category: "Medicare Programs", records: "~700", priority: "low" },
];

export function getCMSDatasetCatalog() {
  const available = Object.keys(IMPORT_TYPE_URLS);
  return {
    datasets: CMS_DATASET_CATALOG.map(ds => ({
      ...ds,
      url: IMPORT_TYPE_URLS[ds.id] || null,
      available: available.includes(ds.id),
    })),
    total: CMS_DATASET_CATALOG.length,
    categories: [...new Set(CMS_DATASET_CATALOG.map(ds => ds.category))],
  };
}

export async function handleTriggerImport(payload: any, user: any) {
  if (!user || user.role !== "admin") {
    throw { status: 403, message: "Forbidden: Admin access required" };
  }

  const { import_type: raw_import_type, file_url, dry_run = false, year, retry_of, retry_count, retry_tags, category, resume_offset, batch_id } = payload;

  if (!raw_import_type) {
    throw { status: 400, message: "Missing required field: import_type" };
  }

  if (file_url && !isAllowedUrl(file_url)) {
    throw { status: 400, message: "file_url must be a CMS government domain (data.cms.gov, download.cms.gov)" };
  }

  const import_type = IMPORT_TYPE_ALIASES[raw_import_type] || raw_import_type;

  const activeImports = await db.select().from(importBatches)
    .where(and(eq(importBatches.import_type, import_type), inArray(importBatches.status, ["validating", "processing"])));
  const realActive = activeImports.filter((b) => {
    const fn = b.file_name || "";
    return fn !== "batch_process_active" && fn !== "crawler_batch_stop_signal" && fn !== "crawler_auto_stop_signal" && b.id !== batch_id;
  });

  if (realActive.length > 0) {
    const existing = realActive[0];
    const stuckMs = Date.now() - new Date(existing.updated_date || existing.created_date!).getTime();
    if (stuckMs > 60 * 60 * 1000) {
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
    return {
      success: true,
      message: `Import process for ${import_type} started in the background. Check Data Center for progress.`,
      import_type,
      note: "ZIP-based Medicare imports are not yet migrated. The batch has been queued for processing.",
    };
  }

  if (import_type === "nppes_flat_file" || import_type === "nppes_registry_file") {
    if (!file_url) {
      throw { status: 400, message: "file_url is required for NPPES flat file imports" };
    }

    const [batch] = await db.insert(importBatches).values({
      import_type,
      file_name: file_url.split("/").pop() || "nppes_flat_file",
      status: "processing",
      dry_run: !!dry_run,
      total_rows: 0,
      imported_rows: 0,
    }).returning();

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

  const validTypes = Object.keys(IMPORT_TYPE_URLS);
  if (!validTypes.includes(import_type)) {
    throw {
      status: 400,
      message: `Invalid import_type. Must be one of: ${[...validTypes, ...Object.keys(ZIP_FUNCTION_MAP), "nppes_flat_file"].join(", ")}`,
    };
  }

  const resolvedUrl = file_url || IMPORT_TYPE_URLS[import_type];
  if (!resolvedUrl) {
    throw { status: 400, message: "No URL available for this import type. Please provide a file_url." };
  }

  const resolvedYear = year || new Date().getFullYear() - 2;
  const resolvedOffset = resume_offset || 0;

  let activeBatchId: number;

  if (batch_id) {
    await db.update(importBatches).set({
      status: "processing",
      cancel_reason: null,
      cancelled_at: null,
      error_samples: null,
      retry_params: { year: resolvedYear, resume_offset: resolvedOffset, retry_of, retry_count: (retry_count || 0) + 1, retry_tags, category, file_url: resolvedUrl },
      updated_date: new Date(),
    }).where(eq(importBatches.id, batch_id));
    activeBatchId = batch_id;
  } else {
    const [batch] = await db.insert(importBatches).values({
      import_type,
      file_name: `cms_${import_type}_${resolvedYear}`,
      status: "processing",
      dry_run: !!dry_run,
      total_rows: 0,
      imported_rows: 0,
      retry_params: { year: resolvedYear, resume_offset: resolvedOffset, retry_of, retry_count, retry_tags, category, file_url: resolvedUrl },
    }).returning();
    activeBatchId = batch.id;
  }

  setTimeout(() => {
    handleAutoImportCMSData({
      import_type,
      file_url: resolvedUrl,
      year: resolvedYear,
      dry_run,
      resume_offset: resolvedOffset,
      batch_id: activeBatchId,
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

function mapCMSOrderReferringRow(row: any, year: number, batchId: number) {
  return {
    npi: row.NPI || row.npi || null,
    referred_to_npi: null,
    referred_to_name: [row.LAST_NAME || row.last_name, row.FIRST_NAME || row.first_name].filter(Boolean).join(", ") || null,
    total_referrals: null,
    total_beneficiaries: null,
    data_year: String(year),
    raw_data: row,
    import_batch_id: String(batchId),
  };
}

function mapCMSUtilizationRow(row: any, year: number, batchId: number) {
  return {
    npi: row.Rndrng_NPI || row.npi || null,
    service_type: row.Rndrng_Prvdr_Type || row.HCPCS_Desc || null,
    total_services: row.Tot_Srvcs || null,
    total_unique_benes: row.Tot_Benes || null,
    average_submitted_chrg_amt: row.Avg_Sbmtd_Chrg || null,
    total_medicare_payment_amt: row.Avg_Mdcr_Pymt_Amt || null,
    data_year: String(year),
    raw_data: row,
  };
}

function mapMedicareFacilityRow(row: any, importType: string, batchId: number) {
  return {
    facility_type: importType,
    provider_id:
      row.cms_certification_number_ccn ||
      row["CMS Certification Number"] || row.CMS_Certification_Number ||
      row.CCN || row.ccn ||
      row.provider_id || row["Provider ID"] ||
      row.NPI || row.npi ||
      null,
    facility_name:
      row.facility_name || row["Facility Name"] || row.Facility_Name ||
      row.provider_name || row["Provider Name"] || row.Provider_Name ||
      row["ORGANIZATION NAME"] || row.organization_name ||
      row.businessname || row.practicename ||
      row["DOING BUSINESS AS NAME"] ||
      row.country ||
      null,
    address:
      row.address_line_1 || row["Address Line 1"] || row.Address_Line_1 ||
      row["ADDRESS LINE 1"] ||
      row.provider_address || row["Provider Address"] ||
      row.practiceaddress1 ||
      null,
    city:
      row.citytown || row["City/Town"] ||
      row.City || row.CITY || row.city ||
      row.practicecity ||
      null,
    state:
      row.state || row.State || row.STATE ||
      row["ENROLLMENT STATE"] ||
      row.practicestate ||
      null,
    zip:
      row.zip_code || row["Zip Code"] || row.Zip_Code ||
      row["ZIP CODE"] || row.ZIP_CODE ||
      row.practicezip9code ||
      null,
    raw_data: row,
    import_batch_id: String(batchId),
  };
}

async function insertCMSRows(importType: string, rows: any[], year: number, batchId: number): Promise<number> {
  if (rows.length === 0) return 0;

  const CHUNK_SIZE = 100;
  let inserted = 0;

  if (importType === "cms_order_referring") {
    const mapped = rows.map(r => mapCMSOrderReferringRow(r, year, batchId)).filter(r => r.npi);
    for (let i = 0; i < mapped.length; i += CHUNK_SIZE) {
      const chunk = mapped.slice(i, i + CHUNK_SIZE);
      try {
        await db.insert(cmsReferrals).values(chunk);
        inserted += chunk.length;
      } catch (e: any) {
        console.error(`[CMS Insert] Chunk error for ${importType}: ${e.message}`);
        for (const row of chunk) {
          try {
            await db.insert(cmsReferrals).values(row);
            inserted++;
          } catch { /* skip duplicate/invalid */ }
        }
      }
    }
  } else if (importType === "provider_service_utilization") {
    const mapped = rows.map(r => mapCMSUtilizationRow(r, year, batchId)).filter(r => r.npi);
    for (let i = 0; i < mapped.length; i += CHUNK_SIZE) {
      const chunk = mapped.slice(i, i + CHUNK_SIZE);
      try {
        await db.insert(providerServiceUtilization).values(chunk);
        inserted += chunk.length;
      } catch (e: any) {
        console.error(`[CMS Insert] Chunk error for ${importType}: ${e.message}`);
        for (const row of chunk) {
          try {
            await db.insert(providerServiceUtilization).values(row);
            inserted++;
          } catch { /* skip duplicate/invalid */ }
        }
      }
    }
  } else {
    const mapped = rows.map(r => mapMedicareFacilityRow(r, importType, batchId)).filter(r => r.provider_id || r.facility_name);
    for (let i = 0; i < mapped.length; i += CHUNK_SIZE) {
      const chunk = mapped.slice(i, i + CHUNK_SIZE);
      try {
        await db.insert(medicareFacilities).values(chunk);
        inserted += chunk.length;
      } catch (e: any) {
        console.error(`[CMS Insert] Chunk error for ${importType}: ${e.message}`);
        for (const row of chunk) {
          try {
            await db.insert(medicareFacilities).values(row);
            inserted++;
          } catch { /* skip duplicate/invalid */ }
        }
      }
    }
  }

  return inserted;
}

export async function handleAutoImportCMSData(params: any) {
  const { import_type, file_url, year, dry_run, resume_offset = 0, batch_id, total_inserted = 0 } = params;
  const MAX_EXEC_MS = 50000;
  const execStartTime = Date.now();
  const PAGE_SIZE = 500;
  const isProviderDataAPI = file_url.includes("/datastore/query/");

  try {
    let offset = resume_offset;
    let totalFetched = resume_offset;
    let totalInserted = total_inserted;
    let hasMore = true;
    let consecutiveErrors = 0;
    const errors: any[] = [];

    while (hasMore && Date.now() - execStartTime < MAX_EXEC_MS) {
      let url: string;
      if (isProviderDataAPI) {
        const separator = file_url.includes("?") ? "&" : "?";
        url = `${file_url}${separator}offset=${offset}&limit=${PAGE_SIZE}`;
      } else {
        const separator = file_url.includes("?") ? "&" : "?";
        url = `${file_url}${separator}offset=${offset}&size=${PAGE_SIZE}`;
      }

      let response: Response;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);
        response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);
      } catch (e: any) {
        consecutiveErrors++;
        const errMsg = `Fetch failed at offset ${offset}: ${e.message}`;
        console.error(`[AutoImportCMS] ${errMsg}`);
        errors.push({ offset, message: errMsg });
        if (consecutiveErrors >= 3) {
          await db.update(importBatches).set({
            status: "failed",
            error_samples: errors.slice(-5),
            updated_date: new Date(),
          }).where(eq(importBatches.id, batch_id));
          return;
        }
        await new Promise(r => setTimeout(r, 3000));
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
        if (consecutiveErrors >= 3) {
          await db.update(importBatches).set({
            status: "failed",
            error_samples: errors.slice(-5),
            updated_date: new Date(),
          }).where(eq(importBatches.id, batch_id));
          return;
        }
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }

      consecutiveErrors = 0;
      const data = await response.json();
      const rows = Array.isArray(data) ? data : data.results || data.data || [];

      if (rows.length === 0) {
        hasMore = false;
        break;
      }

      if (!dry_run) {
        try {
          const inserted = await insertCMSRows(import_type, rows, year, batch_id);
          totalInserted += inserted;
        } catch (e: any) {
          console.error(`[AutoImportCMS] Insert error at offset ${offset}: ${e.message}`);
          errors.push({ offset, message: `Insert error: ${e.message}` });
        }
      }

      totalFetched += rows.length;
      offset += rows.length;

      await db.update(importBatches).set({
        imported_rows: totalInserted,
        total_rows: totalFetched,
        retry_params: { ...params, resume_offset: offset, total_inserted: totalInserted },
        updated_date: new Date(),
      }).where(eq(importBatches.id, batch_id));

      if (rows.length < PAGE_SIZE) {
        hasMore = false;
      }
    }

    if (hasMore && Date.now() - execStartTime >= MAX_EXEC_MS) {
      console.log(`[AutoImportCMS] Time limit reached, scheduling continuation at offset ${offset}`);
      setTimeout(() => {
        handleAutoImportCMSData({ ...params, resume_offset: offset, total_inserted: totalInserted })
          .catch((e) => console.error(`[AutoImportCMS] Resume failed:`, e.message));
      }, 500);
      return;
    }

    await db.update(importBatches).set({
      status: "completed",
      completed_at: new Date(),
      imported_rows: totalInserted,
      total_rows: totalFetched,
      error_samples: errors.length > 0 ? errors.slice(-5) : null,
      updated_date: new Date(),
    }).where(eq(importBatches.id, batch_id));
    console.log(`[AutoImportCMS] Completed ${import_type}: fetched=${totalFetched}, inserted=${totalInserted}`);
  } catch (e: any) {
    console.error(`[AutoImportCMS] Fatal error:`, e.message);
    await db.update(importBatches).set({
      status: "failed",
      error_samples: [{ message: e.message, phase: "cms_import" }],
      updated_date: new Date(),
    }).where(eq(importBatches.id, batch_id));
  }
}
