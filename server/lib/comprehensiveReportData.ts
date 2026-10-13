export const REPORT_DATASETS = {
  ownership: [
    "hospital_all_owners", "home_health_all_owners", "hospice_all_owners",
    "snf_all_owners", "nursing_home_ownership", "fqhc_all_owners", "rural_health_clinic_all_owners",
  ],
  costReports: ["hospital_cost_report", "home_health_cost_report", "snf_cost_report"],
  additionalQuality: [
    "hospital_value_based_purchasing", "snf_quality_reporting", "home_health_agencies",
    "nursing_home_mds_quality", "nursing_home_claims_quality", "home_health_vbp", "snf_vbp_facility",
  ],
} as const;

export const ENROLLMENT_DATASETS = [
  "hospital_enrollments", "home_health_enrollments", "hospice_enrollments",
  "snf_enrollments", "fqhc_enrollments", "rural_health_clinic_enrollments",
];

const normalize = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, "");

function fields(row: any): Map<string, unknown> {
  const raw = row.raw_data;
  return new Map(Object.entries(raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {})
    .map(([key, value]) => [normalize(key), value]));
}

function read(raw: Map<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = raw.get(normalize(key));
    if (value == null) continue;
    const text = String(value).trim();
    if (text && !/^(n\/?a|not available|not applicable|not reported|--|—)$/i.test(text)) return text;
  }
  return null;
}

function numeric(value: string | null): number | null {
  if (!value) return null;
  const cleaned = value.replace(/[$,%\s]/g, "").replace(/^\((.*)\)$/, "-$1");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Retain each dataset's own latest release, never combine financial years. */
function latest(rows: any[], types: readonly string[]) {
  const candidates = rows.filter((r) => types.includes(r.facility_type));
  const years = new Map<string, string>();
  for (const r of candidates) {
    const year = String(r.data_year || "");
    if (year > (years.get(r.facility_type) ?? "")) years.set(r.facility_type, year);
  }
  return candidates.filter((r) => String(r.data_year || "") === (years.get(r.facility_type) ?? ""));
}

export function enrollmentIds(rows: any[]) {
  return [...new Set(rows.filter((r) => ENROLLMENT_DATASETS.includes(r.facility_type))
    .map((r) => read(fields(r), "ENROLLMENT ID"))
    .filter((id): id is string => !!id && /^[a-z0-9]{1,25}$/i.test(id)))].slice(0, 10);
}

export function summarizeOwnership(rows: any[]) {
  return latest(rows, REPORT_DATASETS.ownership).slice(0, 30).map((r) => {
    const raw = fields(r);
    const type = read(raw, "TYPE - OWNER", "Owner Type", "Ownership Type");
    return {
      dataset: r.facility_type, dataYear: r.data_year,
      associateId: read(raw, "ASSOCIATE ID - OWNER", "Associate ID - Owner", "ASSOCIATE ID", "Associate ID"),
      ownerName: read(raw, "ORGANIZATION NAME - OWNER", "Owner Name", "Owner Organization Name")
        || [read(raw, "FIRST NAME - OWNER", "Owner First Name"), read(raw, "LAST NAME - OWNER", "Owner Last Name")].filter(Boolean).join(" ")
        || "Name not disclosed",
      percentage: numeric(read(raw, "PERCENTAGE OWNERSHIP", "Ownership Percentage", "Percentage of Ownership")),
      ownerType: type === "I" ? "Individual" : type === "O" ? "Organization" : type,
      role: read(raw, "ROLE TEXT - OWNER", "Role Description", "Owner Role", "Ownership Role"),
    };
  });
}

const COST_METRICS = [
  { label: "Total revenue", keys: ["Total Revenue", "Total Revenues"], format: "money" },
  { label: "Net patient revenue", keys: ["Net Patient Revenue", "Net Patient Revenues"], format: "money" },
  { label: "Total expenses / costs", keys: ["Total Expenses", "Total Operating Expenses", "Total Costs"], format: "money" },
  { label: "Beds", keys: ["Number of Beds", "Total Beds", "Bed Count"], format: "integer" },
  { label: "Visits", keys: ["Total Visits", "Total HHA Visits", "Total Number of Visits"], format: "integer" },
];

export function summarizeCostReports(rows: any[]) {
  return latest(rows, REPORT_DATASETS.costReports).flatMap((r) => {
    const raw = fields(r);
    const period = [read(raw, "Fiscal Year Begin Date", "FY BGN DT"), read(raw, "Fiscal Year End Date", "FY END DT")].filter(Boolean).join(" – ");
    return COST_METRICS.flatMap((m) => {
      const value = numeric(read(raw, ...m.keys));
      return value == null ? [] : [{
        dataset: r.facility_type, dataYear: r.data_year, period: period || null,
        metric: m.label, value, format: m.format,
      }];
    });
  }).slice(0, 15);
}

const QUALITY_METRICS = [
  { label: "Total performance score", keys: ["Total Performance Score", "TPS"] },
  { label: "Clinical outcomes score", keys: ["Clinical Outcomes Domain Score"] },
  { label: "Safety score", keys: ["Safety Domain Score"] },
  { label: "Patient experience score", keys: ["Person and Community Engagement Domain Score", "Patient and Caregiver Centered Experience of Care Care Coordination Domain Score"] },
  { label: "Efficiency score", keys: ["Efficiency and Cost Reduction Domain Score"] },
  { label: "Timely initiation of care", keys: ["How often the home health team began their patients care in a timely manner", "how_often_the_home_health_team_began_their_patients_care_in_d440", "Timely Initiation of Care"] },
  { label: "Improvement in walking", keys: ["How often patients got better at walking or moving around", "Improvement in Ambulation Locomotion"] },
  { label: "Improvement in bed transfers", keys: ["How often patients got better at getting in and out of bed", "Improvement in Bed Transferring"] },
  { label: "Hospital admission", keys: ["How often home health patients had to be admitted to the hospital", "Acute Care Hospitalization"] },
];

export function summarizeAdditionalQuality(rows: any[]) {
  return latest(rows, REPORT_DATASETS.additionalQuality).flatMap((r) => {
    const raw = fields(r);
    const measures: { metric: string; value: string }[] = [];
    const name = read(raw, "Measure Description", "Measure Name", "Measure");
    const score = read(raw, "Score", "Measure Score", "Four Quarter Average Score", "Adjusted Score", "Observed Score");
    if (name && numeric(score) != null) measures.push({ metric: name, value: score! });
    for (const m of QUALITY_METRICS) {
      const value = read(raw, ...m.keys);
      if (numeric(value) != null) measures.push({ metric: m.label, value: value! });
    }
    return measures.slice(0, 5).map((m) => ({
      dataset: r.facility_type, dataYear: r.data_year, ...m,
    }));
  }).slice(0, 20);
}
