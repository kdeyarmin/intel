import { cell, csvRecords, fips, npi, num, periodFromFileName, periodOf, yearOf, zip5 } from "./csv";
import { posSignals, type PosFacility, type PosSignal } from "./pos";

export type LoadRow = Record<string, string | number | boolean | null>;

export type ParsedLoad = {
  table: string;
  columns: string[];
  conflict: string[];
  rows: LoadRow[];
  replaceSignals?: boolean;
};

export type ParseContext = {
  fileName?: string;
  previousPos?: PosFacility[];
  period?: string | null;
};

function text(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function upper2(value: string): string | null {
  const trimmed = value.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(trimmed) ? trimmed : null;
}

function keepLatest(rows: LoadRow[], key: (row: LoadRow) => string, yearKey = "year"): LoadRow[] {
  const best = new Map<string, LoadRow>();
  for (const row of rows) {
    const id = key(row);
    const current = best.get(id);
    if (!current || String(row[yearKey] ?? "") >= String(current[yearKey] ?? "")) best.set(id, row);
  }
  return [...best.values()];
}

function share(part: number | null, total: number | null): number | null {
  if (part == null || total == null || total === 0) return null;
  return Math.round((part / total) * 10000) / 10000;
}

export function parseCdcPlaces(csv: string): LoadRow[] {
  const rows = csvRecords(csv).flatMap((row) => {
    const county = fips(cell(row, ["LocationID", "CountyFIPS", "county_fips", "FIPS"]));
    const measureId = cell(row, ["MeasureId", "measure_id"]);
    if (!county || !measureId) return [];
    return [{
      county_fips: county,
      measure_id: measureId.slice(0, 40),
      measure: text(cell(row, ["Measure", "measure"])),
      data_value: num(cell(row, ["Data_Value", "data_value"])),
      year: yearOf(cell(row, ["Year", "year"])) ,
    }];
  });
  return keepLatest(rows, (row) => `${row.county_fips}|${row.measure_id}`);
}

export function parseHrsaShortage(csv: string): LoadRow[] {
  return csvRecords(csv).flatMap((row) => {
    const county = fips(cell(row, ["County FIPS", "Common State County FIPS Code", "county_fips", "FIPS"]));
    const discipline = cell(row, ["HPSA Discipline Class", "discipline", "Discipline"]).slice(0, 40);
    if (!county || !discipline) return [];
    return [{
      county_fips: county,
      discipline,
      designation_type: cell(row, ["HPSA Designation Type", "designation_type"]).slice(0, 200),
      hpsa_score: num(cell(row, ["HPSA Score", "hpsa_score"])),
      status: text(cell(row, ["HPSA Status", "status"])),
    }];
  });
}

export function parseMaPlanEnrollment(csv: string): LoadRow[] {
  return csvRecords(csv).flatMap((row) => {
    const period = periodOf(cell(row, ["period", "month", "Month", "Enrollment Month"])) || yearOf(cell(row, ["period"]));
    const county = fips(cell(row, ["FIPS", "county_fips", "County FIPS", "SSA"]));
    const organization = cell(row, ["organization", "Organization", "Parent Organization", "Contract Name"]);
    const enrollment = num(cell(row, ["enrollment", "Enrollment"]));
    if (!period || !county || !organization || enrollment == null) return [];
    return [{
      period: period.slice(0, 7),
      county_fips: county,
      state: upper2(cell(row, ["state", "State"])),
      county_name: text(cell(row, ["county_name", "County", "County Name"])),
      organization,
      enrollment: Math.round(enrollment),
      contracts: num(cell(row, ["contracts", "Contracts"])) == null ? null : Math.round(num(cell(row, ["contracts", "Contracts"]))!),
    }];
  });
}

export function parseMaContractCounty(csv: string): LoadRow[] {
  return csvRecords(csv).flatMap((row) => {
    const period = periodOf(cell(row, ["period", "month", "Month"]));
    const county = fips(cell(row, ["FIPS", "county_fips", "County FIPS"]));
    const contract = cell(row, ["contract_id", "Contract ID", "Contract Number"]).slice(0, 16);
    const enrollment = num(cell(row, ["enrollment", "Enrollment"]));
    if (!period || !county || !contract || enrollment == null) return [];
    return [{ period: period.slice(0, 7), county_fips: county, contract_id: contract, enrollment: Math.round(enrollment) }];
  });
}

export function parseMaPenetration(csv: string): LoadRow[] {
  return csvRecords(csv).flatMap((row) => {
    const period = periodOf(cell(row, ["period", "month", "Month"]));
    const county = fips(cell(row, ["FIPS", "county_fips", "County FIPS"]));
    if (!period || !county) return [];
    const eligibles = num(cell(row, ["eligibles", "Eligibles", "MA Eligible"]));
    const enrolled = num(cell(row, ["enrolled", "Enrolled", "MA Enrollment"]));
    let penetration = num(cell(row, ["penetration", "Penetration", "MA Penetration"]));
    if (penetration == null && eligibles && enrolled != null) penetration = enrolled / eligibles;
    return [{
      period: period.slice(0, 7),
      county_fips: county,
      eligibles: eligibles == null ? null : Math.round(eligibles),
      enrolled: enrolled == null ? null : Math.round(enrolled),
      penetration,
    }];
  });
}

export function parseMaStars(csv: string): LoadRow[] {
  return csvRecords(csv).flatMap((row) => {
    const year = yearOf(cell(row, ["rating_year", "Rating Year", "Year"]));
    const contract = cell(row, ["contract_id", "Contract Number", "Contract ID"]).slice(0, 16);
    if (!year || !contract) return [];
    const snp = cell(row, ["snp", "SNP"]).toLowerCase();
    return [{
      rating_year: year,
      contract_id: contract,
      organization_type: text(cell(row, ["organization_type", "Organization Type"])),
      contract_name: text(cell(row, ["contract_name", "Contract Name"])),
      marketing_name: text(cell(row, ["marketing_name", "Organization Marketing Name"])),
      parent_organization: text(cell(row, ["parent_organization", "Parent Organization"])),
      snp: snp.startsWith("y") ? "yes" : snp.startsWith("n") ? "no" : null,
      part_c_rating: num(cell(row, ["part_c_rating", "Part C Summary", "Part C"])),
      part_d_rating: num(cell(row, ["part_d_rating", "Part D Summary", "Part D"])),
      overall_rating: num(cell(row, ["overall_rating", "Overall"])),
    }];
  });
}

export function parseOigLeie(csv: string): LoadRow[] {
  const rows = csvRecords(csv).flatMap((row) => {
    const id = npi(cell(row, ["NPI", "npi"]));
    if (!id) return [];
    const business = cell(row, ["BUSNAME", "business_name"]);
    const last = cell(row, ["LASTNAME", "last_name"]);
    const first = cell(row, ["FIRSTNAME", "first_name"]);
    const name = business || [last, first].filter(Boolean).join(", ");
    return [{
      npi: id,
      name: text(name),
      excl_type: text(cell(row, ["EXCLTYPE", "excl_type"]))?.slice(0, 20) ?? null,
      excl_date: text(cell(row, ["EXCLDATE", "excl_date"]))?.slice(0, 8) ?? null,
      state: upper2(cell(row, ["STATE", "state"])),
    }];
  });
  return keepLatest(rows, (row) => String(row.npi), "excl_date");
}

export function parseOpenPayments(csv: string): LoadRow[] {
  const grouped = new Map<string, { npi: string; state: string | null; year: number; count: number; amount: number }>();
  for (const row of csvRecords(csv)) {
    const id = npi(cell(row, ["Covered_Recipient_NPI", "npi", "NPI"]));
    const year = Number(yearOf(cell(row, ["Program_Year", "program_year", "Year"])) ?? "");
    const amount = num(cell(row, ["Total_Amount_of_Payment_USDollars", "total_amount", "Amount", "amount"]));
    if (!id || !year || amount == null) continue;
    const state = upper2(cell(row, ["Covered_Recipient_State", "recipient_state", "State"]));
    const current = grouped.get(id);
    if (!current || year > current.year) {
      grouped.set(id, { npi: id, state, year, count: 1, amount });
    } else if (year === current.year) {
      current.count += 1;
      current.amount += amount;
      if (!current.state && state) current.state = state;
    }
  }
  return [...grouped.values()].map((row) => ({
    npi: row.npi,
    recipient_state: row.state,
    program_year: row.year,
    payment_count: row.count,
    total_amount: Math.round(row.amount * 100) / 100,
  }));
}

export function parseOptOut(csv: string): LoadRow[] {
  return csvRecords(csv).flatMap((row) => {
    const id = npi(cell(row, ["NPI", "npi"]));
    if (!id) return [];
    return [{
      npi: id,
      name: text(cell(row, ["name", "Name", "First Name"]) + (cell(row, ["Last Name"]) ? ` ${cell(row, ["Last Name"])}` : "")),
      specialty: text(cell(row, ["specialty", "Specialty"])),
      state: upper2(cell(row, ["state", "State"])),
      effective_date: text(cell(row, ["effective_date", "Effective Date"]))?.slice(0, 20) ?? null,
      end_date: text(cell(row, ["end_date", "End Date"]))?.slice(0, 20) ?? null,
    }];
  });
}

export function parsePartdGeo(csv: string): LoadRow[] {
  return csvRecords(csv).flatMap((row) => {
    const county = fips(cell(row, ["county_fips", "FIPS", "GEOID"])) || upper2(cell(row, ["state", "State"]));
    const year = yearOf(cell(row, ["data_year", "Year"]));
    const name = cell(row, ["generic_name", "Generic Name", "Gnrc_Name"]);
    if (!county || !year || !name) return [];
    const opioid = cell(row, ["opioid", "Opioid"]).toLowerCase();
    return [{
      county_fips: county,
      data_year: year,
      generic_name: name,
      claims: num(cell(row, ["claims", "Tot_Clms"])),
      drug_cost: num(cell(row, ["drug_cost", "Tot_Drug_Cst"])),
      beneficiaries: num(cell(row, ["beneficiaries", "Tot_Benes"])),
      opioid: opioid === "true" || opioid === "y" || opioid === "yes" || opioid === "1",
    }];
  });
}

export function parsePartdProvider(csv: string): LoadRow[] {
  return csvRecords(csv).flatMap((row) => {
    const id = npi(cell(row, ["npi", "NPI", "Prscrbr_NPI"]));
    const year = yearOf(cell(row, ["data_year", "Year"]));
    const name = cell(row, ["generic_name", "Generic Name", "Gnrc_Name"]);
    if (!id || !year || !name) return [];
    return [{
      npi: id,
      data_year: year,
      generic_name: name,
      brand_name: text(cell(row, ["brand_name", "Brand Name", "Brnd_Name"])),
      claims: num(cell(row, ["claims", "Tot_Clms"])),
      drug_cost: num(cell(row, ["drug_cost", "Tot_Drug_Cst"])),
      beneficiaries: num(cell(row, ["beneficiaries", "Tot_Benes"])),
    }];
  });
}

export function parseGeoService(csv: string): LoadRow[] {
  return csvRecords(csv).flatMap((row) => {
    const county = fips(cell(row, ["county_fips", "FIPS"])) || upper2(cell(row, ["state", "State"]));
    const year = yearOf(cell(row, ["data_year", "Year"]));
    const code = cell(row, ["hcpcs", "HCPCS", "HCPCS_Cd"]).slice(0, 10);
    if (!county || !year || !code) return [];
    return [{
      county_fips: county,
      data_year: year,
      hcpcs: code,
      description: text(cell(row, ["description", "HCPCS Description"])),
      beneficiaries: num(cell(row, ["beneficiaries", "Tot_Benes"])),
      services: num(cell(row, ["services", "Tot_Srvcs"])),
      payment: num(cell(row, ["payment", "Avg_Mdcr_Pymt_Amt"])),
    }];
  });
}

export function parseMlr(csv: string): LoadRow[] {
  return csvRecords(csv).flatMap((row) => {
    const year = yearOf(cell(row, ["reporting_year", "Year"]));
    const state = upper2(cell(row, ["state", "State"]));
    const market = cell(row, ["market", "Market"]).slice(0, 20);
    const company = cell(row, ["company", "Company"]);
    if (!year || !state || !market || !company) return [];
    return [{
      reporting_year: year,
      state,
      market,
      company,
      mlr: num(cell(row, ["mlr", "MLR"])),
      mlr_denominator: num(cell(row, ["mlr_denominator", "MLR Denominator"])),
      rebate: num(cell(row, ["rebate", "Rebate"])),
    }];
  });
}

export function parseOep(csv: string): LoadRow[] {
  return csvRecords(csv).flatMap((row) => {
    const year = yearOf(cell(row, ["coverage_year", "Year"]));
    const state = upper2(cell(row, ["state", "State"]));
    if (!year || !state) return [];
    return [{
      coverage_year: year,
      state,
      platform: text(cell(row, ["platform", "Platform"]))?.slice(0, 20) ?? null,
      plan_selections: num(cell(row, ["plan_selections", "Plan Selections"])),
      avg_premium: num(cell(row, ["avg_premium", "Average Premium"])),
      avg_premium_after_aptc: num(cell(row, ["avg_premium_after_aptc", "Average Premium After APTC"])),
    }];
  });
}

export function parsePaMco(csv: string): LoadRow[] {
  return csvRecords(csv).flatMap((row) => {
    const period = periodOf(cell(row, ["period", "Month"]));
    const county = cell(row, ["county_name", "County"]);
    const plan = cell(row, ["plan", "Plan"]);
    const enrollment = num(cell(row, ["enrollment", "Enrollment"]));
    if (!period || !county || !plan || enrollment == null) return [];
    return [{ period: period.slice(0, 7), county_name: county, plan, zone: text(cell(row, ["zone", "Zone"]))?.slice(0, 32) ?? null, enrollment: Math.round(enrollment) }];
  });
}

export function parseQhp(csv: string): LoadRow[] {
  return csvRecords(csv).flatMap((row) => {
    const year = yearOf(cell(row, ["plan_year", "Year"]));
    const county = fips(cell(row, ["county_fips", "County FIPS", "FIPS"]));
    const issuer = cell(row, ["issuer_id", "Issuer ID"]).slice(0, 8);
    const name = cell(row, ["issuer_name", "Issuer Name"]);
    const market = cell(row, ["market", "Market"]).slice(0, 20);
    if (!year || !county || !issuer || !name || !market) return [];
    return [{
      plan_year: year,
      county_fips: county,
      issuer_id: issuer,
      issuer_name: name,
      market,
      plan_count: num(cell(row, ["plan_count", "Plan Count"])),
      metals: text(cell(row, ["metals", "Metals"])),
      state_enrollment: num(cell(row, ["state_enrollment", "State Enrollment"])),
    }];
  });
}

export function parsePaAca(csv: string): LoadRow[] {
  return csvRecords(csv).flatMap((row) => {
    const year = yearOf(cell(row, ["plan_year", "Year"]));
    const market = cell(row, ["market", "Market"]).slice(0, 20);
    const company = cell(row, ["company", "Company"]);
    if (!year || !market || !company) return [];
    return [{
      plan_year: year,
      market,
      company,
      on_marketplace: text(cell(row, ["on_marketplace", "On Marketplace"]))?.slice(0, 3) ?? null,
      requested_pct: num(cell(row, ["requested_pct", "Requested"])),
      approved_pct: num(cell(row, ["approved_pct", "Approved"])),
      market_share: num(cell(row, ["market_share", "Market Share"])),
    }];
  });
}

export function parsePhc4County(csv: string): LoadRow[] {
  return csvRecords(csv).flatMap((row) => {
    const period = cell(row, ["period", "Period"]).slice(0, 12);
    const report = cell(row, ["report", "Report"]).slice(0, 40);
    const county = cell(row, ["county_name", "County"]);
    const category = cell(row, ["category", "Category"]);
    const unit = cell(row, ["value_unit", "Unit"]);
    if (!period || !report || !county || !category || !unit) return [];
    return [{
      period,
      report,
      county_name: county,
      category,
      cases: num(cell(row, ["cases", "Cases"])),
      value: num(cell(row, ["value", "Value"])),
      value_unit: unit.slice(0, 32),
    }];
  });
}

export function parsePos(csv: string, period: string | null): PosFacility[] {
  return csvRecords(csv).flatMap((row) => {
    const ccn = cell(row, ["PRVDR_NUM", "ccn", "CCN", "Provider Number"]).replace(/\D/g, "").slice(0, 10);
    const rowPeriod = periodOf(cell(row, ["period", "Period"])) || period;
    if (!ccn || !rowPeriod) return [];
    return [{
      ccn,
      period: rowPeriod.slice(0, 7),
      name: text(cell(row, ["FAC_NAME", "name", "Facility Name"])),
      state: upper2(cell(row, ["STATE_CD", "state", "State"])),
      category_code: text(cell(row, ["PRVDR_CTGRY_CD", "category_code"]))?.slice(0, 8) ?? null,
      control_type: text(cell(row, ["GNRL_CNTL_TYPE_CD", "control_type"]))?.slice(0, 8) ?? null,
      certification_date: text(cell(row, ["CRTFCTN_DT", "certification_date"]))?.slice(0, 10) ?? null,
      termination_date: text(cell(row, ["TRMNTN_EXPRTN_DT", "termination_date"]))?.slice(0, 10) ?? null,
      chow_date: text(cell(row, ["CHOW_DT", "chow_date"]))?.slice(0, 10) ?? null,
    }];
  });
}

export function parseCertificateOfNeed(csv: string): LoadRow[] {
  return csvRecords(csv).flatMap((row) => {
    const state = upper2(cell(row, ["state", "State"]));
    const status = cell(row, ["con_status", "status"]).toLowerCase();
    const source = cell(row, ["source_url", "source"]);
    const asOf = cell(row, ["source_as_of", "as_of"]).slice(0, 10);
    if (!state || !source || !asOf) return [];
    if (status !== "active" && status !== "none" && status !== "similar") return [];
    return [{ state, con_status: status, services: text(cell(row, ["services"])), source_url: source, source_as_of: asOf, note: text(cell(row, ["note"])) }];
  });
}

export function parseHud(csv: string): LoadRow[] {
  return csvRecords(csv).flatMap((row) => {
    const zip = zip5(cell(row, ["ZIP", "zip5", "zip"]));
    const county = fips(cell(row, ["COUNTY", "county_fips", "county"]));
    if (!zip || !county) return [];
    return [{
      zip5: zip,
      county_fips: county,
      residential_ratio: num(cell(row, ["RES_RATIO", "residential_ratio"])),
      total_ratio: num(cell(row, ["TOT_RATIO", "total_ratio"])),
    }];
  });
}

export function parseHcris(csv: string, setting: "hha" | "hospice" | "snf"): LoadRow[] {
  return csvRecords(csv).flatMap((row) => {
    const provider = cell(row, ["provider_id", "Provider CCN", "PRVDR_NUM", "CCN"]).replace(/\s/g, "").slice(0, 10);
    const fiscal = yearOf(cell(row, ["fiscal_year", "Fiscal Year", "FY Begin Date", "FY_BGN_DT"]));
    if (!provider || !fiscal) return [];
    const total = num(cell(row, ["total_patient_revenue", "Total Patient Revenue", "Net Patient Revenue"]));
    const medicare = num(cell(row, ["medicare_revenue", "Medicare Revenue", "Medicare"]));
    const medicaid = num(cell(row, ["medicaid_revenue", "Medicaid Revenue", "Medicaid"]));
    const cost = num(cell(row, ["total_cost", "Total Costs", "Total Cost"]));
    const income = num(cell(row, ["net_income", "Net Income"]));
    return [{
      setting,
      provider_id: provider,
      fiscal_year: fiscal,
      total_patient_revenue: total,
      medicare_revenue: medicare,
      medicaid_revenue: medicaid,
      total_cost: cost,
      net_income: income,
      medicare_share: share(medicare, total),
      margin: share(income, total),
    }];
  });
}

export function parseSdoh(csv: string): LoadRow[] {
  return csvRecords(csv).flatMap((row) => {
    const county = fips(cell(row, ["county_fips", "COUNTYFIPS", "FIPS", "LocationID"]));
    const year = yearOf(cell(row, ["year", "YEAR", "Year"]));
    const measureId = cell(row, ["measure_id", "MeasureId", "measure"]).slice(0, 40);
    if (!county || !year || !measureId) return [];
    return [{
      county_fips: county,
      year,
      measure_id: measureId,
      measure: text(cell(row, ["measure", "Measure", "description"])),
      data_value: num(cell(row, ["data_value", "value", "Value", "ESTIMATE"])),
      source: text(cell(row, ["source", "Source"])) || "AHRQ SDOH",
    }];
  });
}

export function parseSvi(csv: string): LoadRow[] {
  const rows = csvRecords(csv).flatMap((row) => {
    const county = fips(cell(row, ["county_fips", "FIPS", "STCNTY"]));
    const year = yearOf(cell(row, ["year", "YEAR"])) || yearOf(cell(row, ["FIPS"]));
    if (!county || !year) return [];
    return [{
      county_fips: county,
      year,
      rpl_themes: num(cell(row, ["rpl_themes", "RPL_THEMES"])),
      rpl_theme1: num(cell(row, ["rpl_theme1", "RPL_THEME1"])),
      rpl_theme2: num(cell(row, ["rpl_theme2", "RPL_THEME2"])),
      rpl_theme3: num(cell(row, ["rpl_theme3", "RPL_THEME3"])),
      rpl_theme4: num(cell(row, ["rpl_theme4", "RPL_THEME4"])),
    }];
  });
  return keepLatest(rows, (row) => String(row.county_fips));
}

export function parseWages(csv: string, series: "qcew" | "oews"): LoadRow[] {
  return csvRecords(csv).flatMap((row) => {
    const area = fips(cell(row, ["area_code", "area_fips", "FIPS"])) || upper2(cell(row, ["area", "state", "State"]));
    const year = yearOf(cell(row, ["year", "Year"]));
    const occupation = cell(row, ["occupation", "occ_title", "industry_title", "Industry"]);
    if (!area || !year || !occupation) return [];
    const named = cell(row, ["series"]).toLowerCase();
    return [{
      area_code: area,
      year,
      series: named === "qcew" || named === "oews" ? named : series,
      occupation,
      employment: num(cell(row, ["employment", "tot_emp", "annual_avg_emplvl"])),
      avg_wage: num(cell(row, ["avg_wage", "a_mean", "avg_annual_pay"])),
    }];
  });
}

export function parseAhcah(csv: string): LoadRow[] {
  return csvRecords(csv).flatMap((row) => {
    const ccn = cell(row, ["ccn", "CCN", "Facility ID"]).replace(/\D/g, "");
    if (!/^\d{6}$/.test(ccn)) return [];
    return [{
      ccn,
      facility_name: text(cell(row, ["facility_name", "Facility Name", "name"])),
      state: upper2(cell(row, ["state", "State"])),
      city: text(cell(row, ["city", "City"])),
      listed_on: text(cell(row, ["listed_on", "as_of", "Date"]))?.slice(0, 10) ?? null,
    }];
  });
}

const HCRIS_SETTING: Record<string, "hha" | "hospice" | "snf"> = {
  hcris_hha: "hha",
  hcris_hospice: "hospice",
  hcris_snf: "snf",
};

export function parseReferenceDataset(id: string, csv: string, ctx: ParseContext = {}): ParsedLoad & { signals?: PosSignal[] } {
  const table = (name: string, columns: string[], conflict: string[], rows: LoadRow[]): ParsedLoad => ({ table: name, columns, conflict, rows });
  switch (id) {
    case "cdc_places":
      return table("cdc_places_county", ["county_fips", "measure_id", "measure", "data_value", "year"], ["county_fips", "measure_id"], parseCdcPlaces(csv));
    case "hrsa_shortage":
      return table("hrsa_shortage", ["county_fips", "discipline", "designation_type", "hpsa_score", "status"], ["county_fips", "discipline", "designation_type"], parseHrsaShortage(csv));
    case "cms_ma_plan_enrollment":
      return table("cms_ma_plan_enrollment", ["period", "county_fips", "state", "county_name", "organization", "enrollment", "contracts"], ["period", "county_fips", "organization"], parseMaPlanEnrollment(csv));
    case "cms_ma_contract_county":
      return table("cms_ma_contract_county", ["period", "county_fips", "contract_id", "enrollment"], ["period", "county_fips", "contract_id"], parseMaContractCounty(csv));
    case "cms_ma_penetration":
      return table("cms_ma_penetration", ["period", "county_fips", "eligibles", "enrolled", "penetration"], ["period", "county_fips"], parseMaPenetration(csv));
    case "cms_ma_star":
      return table("cms_ma_star", ["rating_year", "contract_id", "organization_type", "contract_name", "marketing_name", "parent_organization", "snp", "part_c_rating", "part_d_rating", "overall_rating"], ["rating_year", "contract_id"], parseMaStars(csv));
    case "oig_leie":
      return table("oig_exclusions", ["npi", "name", "excl_type", "excl_date", "state"], ["npi"], parseOigLeie(csv));
    case "cms_open_payments":
      return table("cms_open_payment_totals", ["npi", "recipient_state", "program_year", "payment_count", "total_amount"], ["npi"], parseOpenPayments(csv));
    case "medicare_opt_out":
      return table("medicare_opt_out", ["npi", "name", "specialty", "state", "effective_date", "end_date"], ["npi"], parseOptOut(csv));
    case "cms_partd_geo_drug":
      return table("cms_partd_geo_drug", ["county_fips", "data_year", "generic_name", "claims", "drug_cost", "beneficiaries", "opioid"], ["county_fips", "data_year", "generic_name"], parsePartdGeo(csv));
    case "cms_partd_provider_drug":
      return table("cms_partd_provider_drug", ["npi", "data_year", "generic_name", "brand_name", "claims", "drug_cost", "beneficiaries"], ["npi", "data_year", "generic_name"], parsePartdProvider(csv));
    case "cms_geo_service":
      return table("cms_geo_service", ["county_fips", "data_year", "hcpcs", "description", "beneficiaries", "services", "payment"], ["county_fips", "data_year", "hcpcs"], parseGeoService(csv));
    case "cms_mlr":
      return table("cms_mlr", ["reporting_year", "state", "market", "company", "mlr", "mlr_denominator", "rebate"], ["reporting_year", "state", "market", "company"], parseMlr(csv));
    case "cms_oep_state":
      return table("cms_oep_state", ["coverage_year", "state", "platform", "plan_selections", "avg_premium", "avg_premium_after_aptc"], ["coverage_year", "state"], parseOep(csv));
    case "pa_mco_enrollment":
      return table("pa_mco_enrollment", ["period", "county_name", "plan", "zone", "enrollment"], ["period", "county_name", "plan"], parsePaMco(csv));
    case "qhp_county_issuer":
      return table("qhp_county_issuer", ["plan_year", "county_fips", "issuer_id", "issuer_name", "market", "plan_count", "metals", "state_enrollment"], ["plan_year", "county_fips", "issuer_id", "market"], parseQhp(csv));
    case "pa_aca_rate":
      return table("pa_aca_rate", ["plan_year", "market", "company", "on_marketplace", "requested_pct", "approved_pct", "market_share"], ["plan_year", "market", "company"], parsePaAca(csv));
    case "phc4_county_stat":
      return table("phc4_county_stat", ["period", "report", "county_name", "category", "cases", "value", "value_unit"], ["period", "report", "county_name", "category"], parsePhc4County(csv));
    case "certificate_of_need":
      return table("certificate_of_need", ["state", "con_status", "services", "source_url", "source_as_of", "note"], ["state"], parseCertificateOfNeed(csv));
    case "hud_zip_county":
      return table("hud_zip_county", ["zip5", "county_fips", "residential_ratio", "total_ratio"], ["zip5", "county_fips"], parseHud(csv));
    case "hcris_hha":
    case "hcris_hospice":
    case "hcris_snf":
      return table("hcris_cost_summary", ["setting", "provider_id", "fiscal_year", "total_patient_revenue", "medicare_revenue", "medicaid_revenue", "total_cost", "net_income", "medicare_share", "margin"], ["setting", "provider_id", "fiscal_year"], parseHcris(csv, HCRIS_SETTING[id]));
    case "ahrq_sdoh":
      return table("county_sdoh", ["county_fips", "year", "measure_id", "measure", "data_value", "source"], ["county_fips", "year", "measure_id"], parseSdoh(csv));
    case "cdc_svi":
      return table("cdc_svi_county", ["county_fips", "year", "rpl_themes", "rpl_theme1", "rpl_theme2", "rpl_theme3", "rpl_theme4"], ["county_fips", "year"], parseSvi(csv));
    case "bls_qcew":
      return table("bls_wage", ["area_code", "year", "series", "occupation", "employment", "avg_wage"], ["area_code", "year", "series", "occupation"], parseWages(csv, "qcew"));
    case "bls_oews":
      return table("bls_wage", ["area_code", "year", "series", "occupation", "employment", "avg_wage"], ["area_code", "year", "series", "occupation"], parseWages(csv, "oews"));
    case "cms_ahcah":
      return table("cms_ahcah", ["ccn", "facility_name", "state", "city", "listed_on"], ["ccn"], parseAhcah(csv));
    case "cms_pos": {
      const period = ctx.period || periodFromFileName(ctx.fileName || "") || null;
      const facilities = parsePos(csv, period);
      const signals = posSignals(ctx.previousPos, facilities);
      return {
        table: "cms_pos_facility",
        columns: ["ccn", "period", "name", "state", "category_code", "control_type", "certification_date", "termination_date", "chow_date"],
        conflict: ["ccn", "period"],
        rows: facilities,
        signals,
      };
    }
    default:
      throw new Error(`Unknown reference dataset ${id}`);
  }
}
