// Typed destinations for CMS datasets that are geography or time series
// (migration 0016). Each route names its table, a pure mapper from a source
// row to a typed row, and the natural key the importer upserts on. The
// mappers are unit-tested on rows captured from the live APIs
// (tests/fixtures/cms/rows/<import_type>.json).
import crypto from "crypto";
import { stateCodeOf } from "../lib/stateNames";
import { derivedStateOf } from "../lib/rowState";
import {
  cmsDmeByReferring,
  cmsDmeBySupplier,
  cmsDmeGeoService,
  cmsDmeOrderLine,
  cmsDmeSupplyLine,
  cmsFacilityAffiliation,
  cmsGeoVariation,
  cmsHospitalServiceArea,
  cmsHospitalSpendingByClaim,
  cmsLtcFacilityCharacteristics,
  licensedFacilities,
  cmsMarketSaturation,
  cmsMonthlyEnrollment,
  cmsPacUtilization,
  cmsPhysicianByProvider,
  cmsPhysicianCertifications,
  cmsInpatientDrg,
  cmsZipServiceArea,
} from "../db/schema";

export interface MapContext {
  /** The data year the import resolved for the dataset (its catalog period). */
  year: number | string | null | undefined;
  /** The last day of the dataset's period (YYYY-MM-DD) when the catalog knows it. */
  asOf?: string | null;
  batchId: number;
  /** The import's own parameters (state_filter, license_type, file_url) for files that don't carry them. */
  params?: Record<string, unknown> | null;
  /** County FIPS for a ZIP (Census geography), for routes that need it. */
  countyForZip?: (zip: string) => string | null;
}

export interface TypedRoute {
  table: any;
  /** Columns of the natural key; a row missing any of them is dropped. */
  key: string[];
  map: (row: any, ctx: MapContext) => Record<string, unknown> | null;
  /** The mapper wants ctx.countyForZip. */
  needsGeo?: boolean;
  /**
   * `state_filter` names the state the file holds (rows without a state column
   * take it, rows with one must match), rather than narrowing a multi-state feed.
   */
  stateFromParams?: boolean;
  /**
   * A snapshot dataset: its key carries no period, so a newer release only adds
   * and updates rows. After a complete, unfiltered import the rows the batch
   * didn't write have left the source and are retired
   * (server/lib/snapshotRetire.ts). `scope` limits that to this route's rows
   * when several routes share the table, and `scopeFromBatch` limits it to the
   * distinct values of those columns among the rows the batch wrote (a state
   * licensing file replaces its own state and licence type, not every state's).
   * The names are constants, never input.
   */
  snapshot?: { table: string; scope?: { column: string; value: string }; scopeFromBatch?: string[] };
}

// ─── parsing ─────────────────────────────────────────────────────────────────

/** CMS numbers: "1,234", "$3,731,546,031.63", "28.17%", "*" (suppressed) and blanks → number or null. */
export function num(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim().replace(/[$,%\s]/g, "");
  if (!s || s === "*" || s === "N/A" || s === "NA" || s === "-") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function int(v: unknown): number | null {
  const n = num(v);
  return n == null ? null : Math.round(n);
}

export function yn(v: unknown): boolean | null {
  const s = String(v ?? "").trim().toUpperCase();
  if (s === "Y" || s === "YES" || s === "TRUE" || s === "1") return true;
  if (s === "N" || s === "NO" || s === "FALSE" || s === "0") return false;
  return null;
}

/** "MM/DD/YYYY" or "YYYY-MM-DD" → "YYYY-MM-DD". */
export function isoDate(v: unknown): string | null {
  const s = String(v ?? "").trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return null;
}

const str = (v: unknown, max = 255): string | null => {
  const s = String(v ?? "").trim();
  return s ? s.slice(0, max) : null;
};
const zip5 = (v: unknown): string | null => {
  const m = /^\s*(\d{5})/.exec(String(v ?? ""));
  return m ? m[1] : null;
};
const yearOf = (ctx: MapContext, rowYear?: unknown): string | null => {
  const m = /^\s*(\d{4})/.exec(String(rowYear ?? ""));
  if (m) return m[1];
  const y = /^\s*(\d{4})/.exec(String(ctx.year ?? ""));
  return y ? y[1] : null;
};
/** Every column whose value parses as a number, for the jsonb overflow. */
function numericColumns(row: any, pick: (k: string) => boolean): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of Object.keys(row || {})) {
    if (!pick(k)) continue;
    const n = num(row[k]);
    if (n != null) out[k] = n;
  }
  return out;
}

// ─── mappers ─────────────────────────────────────────────────────────────────

export function mapHospitalServiceArea(row: any, ctx: MapContext) {
  const ccn = str(row.MEDICARE_PROV_NUM ?? row.medicare_prov_num, 10);
  const zip = zip5(row.ZIP_CD_OF_RESIDENCE ?? row.zip_cd_of_residence);
  const data_year = yearOf(ctx);
  if (!ccn || !zip || !data_year) return null;
  return {
    ccn, zip5: zip, data_year,
    total_cases: int(row.TOTAL_CASES ?? row.total_cases),
    total_days: int(row.TOTAL_DAYS_OF_CARE ?? row.total_days_of_care),
    total_charges: num(row.TOTAL_CHARGES ?? row.total_charges),
    raw_data: row, import_batch_id: ctx.batchId,
  };
}

const PAC_SETTINGS: Record<string, string> = {
  medicare_snf_utilization: "snf",
  medicare_hha_utilization: "hha",
  medicare_hospice_utilization: "hospice",
  medicare_irf_utilization: "irf",
  medicare_ltch_utilization: "ltch",
};

export function mapPacUtilization(setting: string) {
  return (row: any, ctx: MapContext) => {
    const level = String(row.SMRY_CTGRY ?? "").trim().toUpperCase();
    const summary_level = level === "PROVIDER" ? "provider" : level === "STATE" ? "state" : level === "NATION" || level === "NATIONAL" ? "national" : null;
    const data_year = yearOf(ctx, row.YEAR);
    if (!summary_level || !data_year) return null;
    const ccn = summary_level === "provider" ? str(row.PRVDR_ID, 10) : "";
    const state = summary_level === "national" ? "" : str(row.STATE, 2);
    if (summary_level === "provider" && !ccn) return null;
    if (summary_level === "state" && !state) return null;
    return {
      setting, summary_level, ccn: ccn || "", state: state || "", data_year,
      year_type: str(row.YEAR_TYPE, 4),
      provider_name: summary_level === "provider" ? str(row.PRVDR_NAME, 500) : null,
      city: summary_level === "provider" ? str(row.PRVDR_CITY, 100) : null,
      zip5: summary_level === "provider" ? zip5(row.PRVDR_ZIP) : null,
      bene_count: int(row.BENE_DSTNCT_CNT),
      stays: int(row.TOT_EPSD_STAY_CNT),
      service_days: int(row.TOT_SRVC_DAYS),
      charges: num(row.TOT_CHRG_AMT),
      allowed: num(row.TOT_ALOWD_AMT),
      medicare_payment: num(row.TOT_MDCR_PYMT_AMT),
      standardized_payment: num(row.TOT_MDCR_STDZD_PYMT_AMT),
      avg_age: num(row.BENE_AVG_AGE),
      dual_pct: num(row.BENE_DUAL_PCT),
      rural_pct: num(row.BENE_RRL_PCT),
      avg_risk_score: num(row.BENE_AVG_RISK_SCRE),
      chronic_conditions: numericColumns(row, (k) => k.startsWith("BENE_CC_")),
      metrics: numericColumns(row, (k) => k.startsWith("PRMRY_DX_") || /_(CNT|MNTS|PCT)$/.test(k) && !k.startsWith("BENE_CC_") && !["BENE_DSTNCT_CNT", "TOT_EPSD_STAY_CNT", "BENE_DUAL_PCT", "BENE_RRL_PCT"].includes(k)),
      raw_data: row, import_batch_id: ctx.batchId,
    };
  };
}

export function mapHospitalSpendingByClaim(row: any, ctx: MapContext) {
  const ccn = str(row.facility_id ?? row.provider_id, 10);
  const period = str(row.period, 80);
  const claim_type = str(row.claim_type, 80);
  const period_end = isoDate(row.end_date);
  const data_year = yearOf(ctx, period_end);
  if (!ccn || !period || !claim_type || !data_year) return null;
  return {
    ccn, period, claim_type, data_year,
    period_start: isoDate(row.start_date), period_end,
    facility_name: str(row.facility_name, 500), state: str(row.state, 2),
    avg_spend_hospital: num(row.avg_spndg_per_ep_hospital),
    avg_spend_state: num(row.avg_spndg_per_ep_state),
    avg_spend_national: num(row.avg_spndg_per_ep_national),
    pct_spend_hospital: num(row.percent_of_spndg_hospital),
    pct_spend_state: num(row.percent_of_spndg_state),
    pct_spend_national: num(row.percent_of_spndg_national),
    raw_data: row, import_batch_id: ctx.batchId,
  };
}

const ALL = (v: unknown) => /^-+ALL-+$/i.test(String(v ?? "").trim());

export function mapMarketSaturation(row: any, ctx: MapContext) {
  const reference_period = str(row.reference_period, 40);
  const service = str(row.type_of_service, 120);
  const geo_level = str(row.aggregation_level, 30);
  if (!reference_period || !service || !geo_level) return null;
  const stateFips = str(row.state_fips, 2);
  const countyFips = str(row.county_fips, 3);
  const cbsa = ALL(row.cbsa) ? null : str(row.cbsa, 10);
  let geo_code = "";
  let geo_name: string | null = null;
  if (cbsa) {
    geo_code = cbsa;
    geo_name = str(row.cbsatitle, 500);
  } else if (stateFips && countyFips) {
    geo_code = `${stateFips.padStart(2, "0")}${countyFips.padStart(3, "0")}`;
    geo_name = ALL(row.county) ? null : str(row.county, 200);
  } else if (stateFips) {
    geo_code = stateFips.padStart(2, "0");
    geo_name = ALL(row.state) ? null : str(row.state, 100);
  }
  const state = ALL(row.state) ? null : str(row.state, 2);
  return {
    reference_period, geo_level, geo_code, service, state, geo_name,
    ffs_benes: int(row.number_of_fee_for_service_beneficiaries),
    providers: int(row.number_of_providers),
    users: int(row.number_of_users),
    users_per_provider: num(row.average_number_of_users_per_provider),
    users_pct: num(row.percentage_of_users_out_of_ffs_beneficiaries),
    dual_users: int(row.number_of_dual_eligible_users),
    dual_users_pct: num(row.percentage_of_dual_eligible_users_out_of_total_users),
    total_payment: num(row.total_payment),
    moratorium: yn(row.moratorium),
    providers_change_pct: num(row.number_of_providers_change),
    users_change_pct: num(row.number_of_users_change),
    raw_data: row, import_batch_id: ctx.batchId,
  };
}

const MONTHS: Record<string, string> = { january: "01", february: "02", march: "03", april: "04", may: "05", june: "06", july: "07", august: "08", september: "09", october: "10", november: "11", december: "12" };

export function mapMonthlyEnrollment(row: any, ctx: MapContext) {
  const year = yearOf(ctx, row.YEAR);
  const monthRaw = String(row.MONTH ?? "").trim();
  let month: string | null = null;
  if (/^year$/i.test(monthRaw)) month = "ALL";
  else if (/^\d{1,2}$/.test(monthRaw)) month = monthRaw.padStart(2, "0");
  else if (MONTHS[monthRaw.toLowerCase()]) month = MONTHS[monthRaw.toLowerCase()];
  const levelRaw = String(row.BENE_GEO_LVL ?? "").trim().toLowerCase();
  const geo_level = levelRaw === "county" ? "County" : levelRaw === "state" ? "State" : levelRaw === "national" ? "National" : null;
  if (!year || !month || !geo_level) return null;
  const fips = String(row.BENE_FIPS_CD ?? "").trim();
  const geo_code = geo_level === "National" ? "" : fips.slice(0, 5);
  if (geo_level !== "National" && !geo_code) return null;
  const age85 = ["AGE_85_TO_89_BENES", "AGE_90_TO_94_BENES", "AGE_GT_94_BENES"].map((k) => int(row[k]));
  return {
    period: `${year}-${month}`, geo_level, geo_code,
    state: geo_level === "National" ? null : str(row.BENE_STATE_ABRVTN, 2),
    county_name: geo_level === "County" ? str(row.BENE_COUNTY_DESC, 200) : null,
    total_benes: int(row.TOT_BENES),
    original_medicare: int(row.ORGNL_MDCR_BENES),
    ma_and_other: int(row.MA_AND_OTH_BENES),
    aged: int(row.AGED_TOT_BENES),
    disabled: int(row.DSBLD_TOT_BENES),
    dual: int(row.DUAL_TOT_BENES),
    full_dual: int(row.FULL_DUAL_TOT_BENES),
    age_85_plus: age85.some((v) => v != null) ? age85.reduce((s, v) => (s ?? 0) + (v ?? 0), 0 as number | null) : null,
    metrics: numericColumns(row, (k) => /_BENES$/.test(k)),
    raw_data: row, import_batch_id: ctx.batchId,
  };
}

export function mapGeoVariation(row: any, ctx: MapContext) {
  const data_year = yearOf(ctx, row.YEAR);
  const code = String(row.BENE_GEO_CD ?? "").trim();
  const levelRaw = String(row.BENE_GEO_LVL ?? "").trim().toLowerCase();
  const geo_level = levelRaw === "county" ? "County" : levelRaw === "state" ? "State" : levelRaw === "national" ? "National"
    : code.length === 5 ? "County" : code.length === 2 ? "State" : !code || /national/i.test(String(row.STATE ?? row.BENE_GEO_DESC ?? "")) ? "National" : null;
  if (!data_year || !geo_level) return null;
  const geo_code = geo_level === "National" ? "" : code.slice(0, 10);
  if (geo_level !== "National" && !geo_code) return null;
  return {
    data_year, geo_level, geo_code,
    age_level: str(row.BENE_AGE_LVL, 10) || "All",
    geo_desc: str(row.BENE_GEO_DESC ?? row.STATE, 200),
    // The county file has no state column: the state is in the geography ("PA-Allegheny", or the FIPS code).
    state: geo_level === "National" ? null : str(row.STATE ?? row.BENE_STATE_ABRVTN, 2) ?? derivedStateOf(row),
    benes: int(row.BENES_TOTAL_CNT ?? row.BENES_FFS_CNT),
    ma_benes: int(row.BENES_MA_CNT),
    ma_participation_rate: num(row.MA_PRTCPTN_RATE),
    avg_age: num(row.BENE_AVG_AGE),
    dual_pct: num(row.BENE_DUAL_PCT),
    avg_hcc_score: num(row.BENE_AVG_RISK_SCRE),
    std_per_capita_total: num(row.TOT_MDCR_STDZD_PYMT_PC),
    std_per_capita_ip: num(row.IP_MDCR_STDZD_PYMT_PC),
    std_per_capita_snf: num(row.SNF_MDCR_STDZD_PYMT_PC),
    std_per_capita_hha: num(row.HH_MDCR_STDZD_PYMT_PC),
    std_per_capita_hospice: num(row.HOSPC_MDCR_STDZD_PYMT_PC),
    readmission_rate: num(row.ACUTE_HOSP_READMSN_PCT),
    er_visits_per_1000: num(row.ER_VISITS_PER_1000_BENES),
    snf_stays_per_1000: num(row.SNF_STAYS_PER_1000_BENES ?? row.SNF_CVRD_STAYS_PER_1000_BENES),
    metrics: numericColumns(row, (k) => !["YEAR", "BENE_GEO_CD"].includes(k)),
    raw_data: row, import_batch_id: ctx.batchId,
  };
}

export function mapZipServiceArea(setting: string) {
  return (row: any, ctx: MapContext) => {
    const ccn = str(row.cms_certification_number_ccn ?? row.ccn, 10);
    const zip = zip5(row.zip_code ?? row.zip);
    if (!ccn || !zip) return null;
    return { setting, ccn, zip5: zip, state: str(row.state, 2), as_of: ctx.asOf ?? null, import_batch_id: ctx.batchId };
  };
}

export function mapPhysicianByProvider(row: any, ctx: MapContext) {
  const npi = str(row.Rndrng_NPI ?? row.npi, 10);
  const data_year = yearOf(ctx);
  if (!npi || !/^\d{10}$/.test(npi) || !data_year) return null;
  return {
    npi, data_year,
    entity_code: str(row.Rndrng_Prvdr_Ent_Cd, 1),
    provider_type: str(row.Rndrng_Prvdr_Type, 120),
    state: str(row.Rndrng_Prvdr_State_Abrvtn, 2),
    zip5: zip5(row.Rndrng_Prvdr_Zip5),
    ruca: str(row.Rndrng_Prvdr_RUCA, 5),
    benes: int(row.Tot_Benes),
    services: num(row.Tot_Srvcs),
    hcpcs_codes: int(row.Tot_HCPCS_Cds),
    submitted_charges: num(row.Tot_Sbmtd_Chrg),
    allowed: num(row.Tot_Mdcr_Alowd_Amt),
    medicare_payment: num(row.Tot_Mdcr_Pymt_Amt),
    standardized_payment: num(row.Tot_Mdcr_Stdzd_Amt),
    avg_age: num(row.Bene_Avg_Age),
    dual_count: int(row.Bene_Dual_Cnt),
    avg_risk_score: num(row.Bene_Avg_Risk_Scre),
    chronic_conditions: numericColumns(row, (k) => k.startsWith("Bene_CC_")),
    metrics: numericColumns(row, (k) => /^Bene_(Age|Feml|Male|Race|Ndual)_/.test(k) || /^(Drug|Med)_/.test(k)),
    raw_data: row, import_batch_id: ctx.batchId,
  };
}

export function mapFacilityAffiliation(row: any, ctx: MapContext) {
  const npi = str(row.npi ?? row.NPI, 10);
  const facility_type = str(row.facility_type, 60);
  if (!npi || !/^\d{10}$/.test(npi) || !facility_type) return null;
  const ccn = str(row.facility_affiliations_certification_number ?? row.facility_ccn, 10) || str(row.facility_type_certification_number, 10) || "";
  return { npi, facility_type, facility_ccn: ccn, ind_pac_id: str(row.ind_pac_id, 20), as_of: ctx.asOf ?? null, import_batch_id: ctx.batchId };
}

export function mapDmeByReferring(row: any, ctx: MapContext) {
  const npi = str(row.Rfrg_NPI ?? row.npi, 10);
  const data_year = yearOf(ctx);
  if (!npi || !/^\d{10}$/.test(npi) || !data_year) return null;
  return {
    npi, data_year,
    state: str(row.Rfrg_Prvdr_State_Abrvtn, 2),
    zip5: zip5(row.Rfrg_Prvdr_Zip5),
    specialty: str(row.Rfrg_Prvdr_Spclty_Desc, 120),
    suppliers: int(row.Tot_Suplrs),
    benes: int(row.Tot_Suplr_Benes),
    claims: int(row.Tot_Suplr_Clms),
    services: num(row.Tot_Suplr_Srvcs),
    medicare_payment: num(row.Suplr_Mdcr_Pymt_Amt),
    standardized_payment: num(row.Suplr_Mdcr_Stdzd_Pymt_Amt),
    hcpcs_codes: int(row.Tot_Suplr_HCPCS_Cds),
    allowed: num(row.Suplr_Mdcr_Alowd_Amt),
    submitted_charges: num(row.Suplr_Sbmtd_Chrgs),
    ...dmeSplit(row),
    avg_age: num(row.Bene_Avg_Age),
    avg_risk_score: num(row.Bene_Avg_Risk_Scre),
    chronic_conditions: numericColumns(row, (k) => k.startsWith("Bene_CC_")),
    raw_data: row, import_batch_id: ctx.batchId,
  };
}

/** Equipment, prosthetics, and drug columns of the by-provider DMEPOS files. A "*" is suppressed, not zero. */
function dmeSplit(row: any) {
  const flag = (v: unknown) => {
    const s = String(v ?? "").trim();
    if (s === "*") return true;
    if (!s) return null;
    return yn(s);
  };
  return {
    dme_suppressed: flag(row.DME_Sprsn_Ind),
    dme_benes: int(row.DME_Tot_Suplr_Benes),
    dme_payment: num(row.DME_Suplr_Mdcr_Pymt_Amt),
    pos_suppressed: flag(row.POS_Sprsn_Ind),
    pos_benes: int(row.POS_Tot_Suplr_Benes),
    pos_payment: num(row.POS_Suplr_Mdcr_Pymt_Amt),
    drug_suppressed: flag(row.Drug_Sprsn_Ind),
    drug_benes: int(row.Drug_Tot_Suplr_Benes),
    drug_payment: num(row.Drug_Suplr_Mdcr_Pymt_Amt),
  };
}

export function mapDmeBySupplier(row: any, ctx: MapContext) {
  const npi = str(row.Suplr_NPI ?? row.npi, 10);
  const data_year = yearOf(ctx);
  if (!npi || !/^\d{10}$/.test(npi) || !data_year) return null;
  return {
    npi, data_year,
    name: str(row.Suplr_Prvdr_Last_Name_Org, 500),
    city: str(row.Suplr_Prvdr_City, 120),
    state: str(row.Suplr_Prvdr_State_Abrvtn, 2),
    zip5: zip5(row.Suplr_Prvdr_Zip5),
    specialty: str(row.Suplr_Prvdr_Spclty_Desc, 200),
    hcpcs_codes: int(row.Tot_Suplr_HCPCS_Cds),
    benes: int(row.Tot_Suplr_Benes),
    claims: int(row.Tot_Suplr_Clms),
    services: num(row.Tot_Suplr_Srvcs),
    medicare_payment: num(row.Suplr_Mdcr_Pymt_Amt),
    allowed: num(row.Suplr_Mdcr_Alowd_Amt),
    ...dmeSplit(row),
  };
}

function dmeLine(row: any, ctx: MapContext, who: "Rfrg" | "Suplr") {
  const npi = str(row[`${who}_NPI`] ?? row.npi, 10);
  const hcpcs = str(row.HCPCS_CD ?? row.HCPCS_Cd ?? row.hcpcs, 10)?.toUpperCase() ?? null;
  const data_year = yearOf(ctx);
  if (!npi || !/^\d{10}$/.test(npi) || !hcpcs || !data_year) return null;
  const rental = str(row.Suplr_Rentl_Ind, 1)?.toUpperCase() ?? "";
  return {
    data_year, npi, hcpcs, rental: rental === "Y" ? "Y" : "",
    state: str(row[`${who}_Prvdr_State_Abrvtn`], 2),
    rbcs_desc: str(row.RBCS_Desc, 200),
    hcpcs_desc: str(row.HCPCS_Desc, 500),
    ...(who === "Rfrg" ? { suppliers: int(row.Tot_Suplrs) } : {}),
    benes: int(row.Tot_Suplr_Benes),
    claims: int(row.Tot_Suplr_Clms),
    services: num(row.Tot_Suplr_Srvcs),
    avg_payment: num(row.Avg_Suplr_Mdcr_Pymt_Amt),
  };
}

export function mapDmeOrderLine(row: any, ctx: MapContext) {
  return dmeLine(row, ctx, "Rfrg");
}

export function mapDmeSupplyLine(row: any, ctx: MapContext) {
  return dmeLine(row, ctx, "Suplr");
}

export function mapDmeGeoService(row: any, ctx: MapContext) {
  const data_year = yearOf(ctx);
  const levelRaw = str(row.Rfrg_Prvdr_Geo_Lvl, 16);
  const geo_level = levelRaw?.toLowerCase() === "national" ? "National" : levelRaw?.toLowerCase() === "state" ? "State" : null;
  const hcpcs = str(row.HCPCS_Cd ?? row.HCPCS_CD, 10)?.toUpperCase() ?? null;
  if (!data_year || !geo_level || !hcpcs) return null;
  const fips = str(row.Rfrg_Prvdr_Geo_Cd, 5);
  const geo_code = geo_level === "National" ? "" : (fips ?? "");
  if (geo_level === "State" && !geo_code) return null;
  const rental = str(row.Suplr_Rentl_Ind, 1)?.toUpperCase() ?? "";
  const state = geo_level === "State" ? stateCodeOf(row.Rfrg_Prvdr_Geo_Desc) : null;
  return {
    data_year, geo_level, geo_code, hcpcs, rental: rental === "Y" ? "Y" : "",
    state: state ?? "",
    geo_desc: str(row.Rfrg_Prvdr_Geo_Desc, 120),
    rbcs_desc: str(row.RBCS_Desc, 200),
    hcpcs_desc: str(row.HCPCS_Desc, 500),
    referring_providers: int(row.Tot_Rfrg_Prvdrs),
    suppliers: int(row.Tot_Suplrs),
    benes: int(row.Tot_Suplr_Benes),
    claims: int(row.Tot_Suplr_Clms),
    services: num(row.Tot_Suplr_Srvcs),
    avg_payment: num(row.Avg_Suplr_Mdcr_Pymt_Amt),
  };
}

/**
 * The HCPCS codes of a clinician certifying a patient for home health (G0180), recertifying (G0179), and
 * overseeing a home health (G0181) or hospice (G0182) plan of care: the by-provider-and-service rows kept for the
 * referral view. The importer asks CMS for these codes only; anything else in a file is dropped here.
 */
export const CERTIFICATION_HCPCS: readonly string[] = ["G0180", "G0179", "G0181", "G0182"];

export function mapPhysicianCertification(row: any, ctx: MapContext) {
  const npi = str(row.Rndrng_NPI ?? row.npi, 10);
  const code = str(row.HCPCS_Cd ?? row.hcpcs_cd, 10)?.toUpperCase() ?? null;
  const place = str(row.Place_Of_Srvc ?? row.place_of_srvc, 1)?.toUpperCase() ?? null;
  const data_year = yearOf(ctx);
  if (!npi || !/^\d{10}$/.test(npi) || !code || !CERTIFICATION_HCPCS.includes(code) || !place || !data_year) return null;
  return {
    npi, hcpcs_code: code, place_of_service: place, data_year,
    provider_type: str(row.Rndrng_Prvdr_Type, 120),
    state: str(row.Rndrng_Prvdr_State_Abrvtn, 2),
    benes: int(row.Tot_Benes),
    services: num(row.Tot_Srvcs),
    raw_data: row, import_batch_id: ctx.batchId,
  };
}

export function mapLtcFacilityCharacteristics(row: any, ctx: MapContext) {
  const ccn = str(row["Provider Number"] ?? row.PROVNUM ?? row.provnum, 10);
  const period_end = ctx.asOf ?? (yearOf(ctx) ? `${yearOf(ctx)}-12-31` : null);
  if (!ccn || !period_end) return null;
  const beds: Record<string, number> = {};
  for (const k of Object.keys(row)) {
    const m = /^Number of (.+) Beds$/.exec(k);
    const n = m ? int(row[k]) : null;
    if (m && n != null) beds[m[1]] = n;
  }
  return {
    ccn, period_end,
    facility_name: str(row["Facility Name"] ?? row.PROVNAME, 500),
    city: str(row.City, 100), state: str(row.State, 2), zip5: zip5(row["Zip Code"]),
    certification_date: isoDate(row["Certification Date"]),
    medicare_census: int(row["Medicare Census"]),
    medicaid_census: int(row["Medicaid Census"]),
    other_census: int(row["Other Census"]),
    total_residents: int(row["Total Residents"]),
    participation: str(row["Program Participation Code"], 60),
    hospital_based: yn(row["Hospital Based"]),
    ownership_type: str(row["Ownership Type"], 80),
    multi_facility: yn(row["Multi-Facility Organization"]),
    multi_facility_org_name: str(row["Multi-Facility Organization Name"], 500),
    special_care_beds: beds,
    ccrc: yn(row["Continuing Care Retirement Community (CCRC)"]),
    raw_data: row, import_batch_id: ctx.batchId,
  };
}

// ─── state licensing files (uploads) ────────────────────────────────────────

/** The first present column among aliases, after csvRecords' lower-snake normalization. */
function pick(row: any, aliases: string[]): unknown {
  for (const a of aliases) {
    const v = row[a];
    if (v != null && String(v).trim() !== "") return v;
  }
  return undefined;
}

export const LICENSE_TYPE_DEFAULT = "personal_care_home";

/** "Personal Care Home" / "ALR" / "assisted-living residence" → a stable key. */
export function normalizeLicenseType(value: unknown): string {
  const v = String(value ?? "").trim().toLowerCase();
  if (!v) return LICENSE_TYPE_DEFAULT;
  if (/assisted|\balr\b|\balf\b/.test(v)) return "assisted_living";
  if (/personal care|\bpch\b/.test(v)) return "personal_care_home";
  if (/memory|dementia|alzheimer/.test(v)) return "memory_care";
  if (/nursing|skilled|\bsnf\b/.test(v)) return "nursing_home";
  if (/adult day/.test(v)) return "adult_day";
  if (/domiciliary|dom care/.test(v)) return "domiciliary_care";
  return v.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || LICENSE_TYPE_DEFAULT;
}

/**
 * The date of a licensing snapshot whose file states only its year: the end of that year, but never
 * a day that hasn't happened (an export taken this October is not "as of" December 31).
 */
export function licensedSnapshotDate(year: number | string | null | undefined, today: Date = new Date()): string | null {
  const y = Number(year);
  if (!Number.isInteger(y) || y < 2000) return null;
  const endOfYear = `${y}-12-31`;
  const now = today.toISOString().slice(0, 10);
  return endOfYear > now ? now : endOfYear;
}

/**
 * A row of a state licensing export (Pennsylvania DHS personal care homes,
 * assisted living residences, other states' ALF directories). Column names
 * vary by state, so each field takes its first present alias; the state and
 * license type can come from the import's parameters when the file has none.
 * Rows without a license number are keyed by name and ZIP.
 */
export function mapLicensedFacility(row: any, ctx: MapContext) {
  const params = ctx.params ?? {};
  const name = str(pick(row, ["name", "facility_name", "facility", "home_name", "provider_name", "legal_name", "dba", "licensee_name"]), 500);
  if (!name) return null;
  // The file's own state ("PA" or "Pennsylvania"); the import's state_filter stands in when the file has none (or none we can read).
  const state = stateCodeOf(pick(row, ["state", "st", "state_code"])) ?? stateCodeOf(params.state_filter);
  if (!state) return null;
  const license_type = normalizeLicenseType(pick(row, ["license_type", "licence_type", "facility_type", "type", "category", "program", "service_type"]) ?? params.license_type);
  const license_number = str(pick(row, ["license_number", "licence_number", "license_no", "license", "license_id", "licensenumber", "certificate_number", "certificate_no", "facility_id", "id"]), 60);
  const zip = zip5(pick(row, ["zip5", "zip", "zip_code", "zipcode", "postal_code", "postal"]));
  const facility_key = license_number ?? crypto.createHash("md5").update(`${name.toLowerCase()}|${zip ?? ""}`).digest("hex");
  const asOf = ctx.asOf ?? (typeof params.as_of === "string" ? params.as_of : null) ?? licensedSnapshotDate(ctx.year);
  return {
    state, license_type, facility_key, license_number, name,
    address: str(pick(row, ["address", "address_1", "address1", "street", "street_address", "addr"]), 500),
    city: str(pick(row, ["city", "town", "municipality"]), 100),
    zip5: zip,
    county_fips: zip && ctx.countyForZip ? ctx.countyForZip(zip) : null,
    capacity: int(pick(row, ["capacity", "licensed_capacity", "licensed_bed_count", "beds", "licensed_beds", "bed_count", "total_beds", "max_capacity"])),
    status: str(pick(row, ["status", "license_status", "licence_status", "type_of_license"]), 60),
    licensee: str(pick(row, ["licensee", "owner", "operator", "legal_entity", "licensee_name"]), 500),
    phone: str(pick(row, ["phone", "telephone", "phone_number"]), 50),
    source_url: typeof params.file_url === "string" && /^https?:\/\//.test(params.file_url) ? params.file_url.slice(0, 500) : null,
    as_of: asOf,
    raw_data: row, import_batch_id: ctx.batchId,
  };
}

export function mapInpatientDrg(row: any, ctx: MapContext) {
  const ccn = str(row.Rndrng_Prvdr_CCN ?? row.CCN, 10);
  const drg_code = str(row.DRG_Cd ?? row.DRG_CODE, 10);
  const data_year = yearOf(ctx, row.YEAR);
  if (!ccn || !drg_code || !data_year) return null;
  return {
    ccn, drg_code, data_year,
    drg_desc: str(row.DRG_Desc, 500),
    provider_name: str(row.Rndrng_Prvdr_Org_Name, 500),
    state: str(row.Rndrng_Prvdr_State_Abrvtn, 2),
    discharges: int(row.Tot_Dschrgs),
    avg_covered_charges: num(row.Avg_Submtd_Cvrd_Chrg),
    avg_total_payments: num(row.Avg_Tot_Pymt_Amt),
    avg_medicare_payments: num(row.Avg_Mdcr_Pymt_Amt),
    raw_data: row, import_batch_id: ctx.batchId,
  };
}

// ─── routes ──────────────────────────────────────────────────────────────────

export const TYPED_ROUTES: Record<string, TypedRoute> = {
  hospital_service_area: { table: cmsHospitalServiceArea, key: ["ccn", "zip5", "data_year"], map: mapHospitalServiceArea },
  ...Object.fromEntries(Object.entries(PAC_SETTINGS).map(([type, setting]) => [type, {
    table: cmsPacUtilization, key: ["setting", "summary_level", "ccn", "state", "data_year"], map: mapPacUtilization(setting),
  }])),
  hospital_spending_by_claim: { table: cmsHospitalSpendingByClaim, key: ["ccn", "period", "claim_type", "data_year"], map: mapHospitalSpendingByClaim },
  market_saturation_county: { table: cmsMarketSaturation, key: ["reference_period", "geo_level", "geo_code", "service"], map: mapMarketSaturation },
  market_saturation_cbsa: { table: cmsMarketSaturation, key: ["reference_period", "geo_level", "geo_code", "service"], map: mapMarketSaturation },
  medicare_monthly_enrollment: { table: cmsMonthlyEnrollment, key: ["period", "geo_level", "geo_code"], map: mapMonthlyEnrollment },
  medicare_geographic_variation: { table: cmsGeoVariation, key: ["data_year", "geo_level", "geo_code", "age_level"], map: mapGeoVariation },
  home_health_zip_data: { table: cmsZipServiceArea, key: ["setting", "ccn", "zip5"], map: mapZipServiceArea("hha"), snapshot: { table: "cms_zip_service_area", scope: { column: "setting", value: "hha" } } },
  hospice_zip_data: { table: cmsZipServiceArea, key: ["setting", "ccn", "zip5"], map: mapZipServiceArea("hospice"), snapshot: { table: "cms_zip_service_area", scope: { column: "setting", value: "hospice" } } },
  medicare_physician_by_provider: { table: cmsPhysicianByProvider, key: ["npi", "data_year"], map: mapPhysicianByProvider },
  facility_affiliation: { table: cmsFacilityAffiliation, key: ["npi", "facility_type", "facility_ccn"], map: mapFacilityAffiliation, snapshot: { table: "cms_facility_affiliation" } },
  medicare_dme_by_referring: { table: cmsDmeByReferring, key: ["npi", "data_year"], map: mapDmeByReferring },
  medicare_dme_by_supplier: { table: cmsDmeBySupplier, key: ["data_year", "npi"], map: mapDmeBySupplier },
  medicare_dme_by_referring_service: { table: cmsDmeOrderLine, key: ["data_year", "npi", "hcpcs", "rental"], map: mapDmeOrderLine },
  medicare_dme_by_supplier_service: { table: cmsDmeSupplyLine, key: ["data_year", "npi", "hcpcs", "rental"], map: mapDmeSupplyLine },
  medicare_dme_by_geography_service: { table: cmsDmeGeoService, key: ["data_year", "geo_level", "geo_code", "hcpcs", "rental"], map: mapDmeGeoService },
  physician_certifications: { table: cmsPhysicianCertifications, key: ["npi", "hcpcs_code", "place_of_service", "data_year"], map: mapPhysicianCertification },
  inpatient_drg: { table: cmsInpatientDrg, key: ["ccn", "drg_code", "data_year"], map: mapInpatientDrg },
  ltc_facility_characteristics: { table: cmsLtcFacilityCharacteristics, key: ["ccn", "period_end"], map: mapLtcFacilityCharacteristics },
  licensed_facilities: {
    table: licensedFacilities, key: ["state", "license_type", "facility_key"], map: mapLicensedFacility, needsGeo: true, stateFromParams: true,
    snapshot: { table: "licensed_facilities", scopeFromBatch: ["state", "license_type"] },
  },
};

export const TYPED_IMPORT_TYPES: ReadonlySet<string> = new Set(Object.keys(TYPED_ROUTES));

/** Map a page of rows for a typed route: dropped rows (no key) and duplicates within the page (last wins). */
export function mapTypedRows(route: TypedRoute, rows: any[], ctx: MapContext): { rows: Record<string, unknown>[]; dropped: number } {
  const byKey = new Map<string, Record<string, unknown>>();
  let dropped = 0;
  for (const raw of rows) {
    const mapped = route.map(raw, ctx);
    if (!mapped || route.key.some((k) => mapped[k] == null)) {
      dropped++;
      continue;
    }
    byKey.set(route.key.map((k) => String(mapped[k])).join("|"), mapped);
  }
  return { rows: [...byKey.values()], dropped };
}
