// Mirror of server/lib/specialtyGroups.ts (tests/specialtyGroups.test.ts keeps
// the two identical). Groups NPPES taxonomies into the specialties people
// search and plan by; see the server file for details.

export const SPECIALTY_GROUPS = [
  { key: "family_medicine", label: "Family Medicine", codes: ["207Q"], words: /family (medicine|practice)/i },
  { key: "internal_medicine", label: "Internal Medicine", codes: ["207R00000X"], words: /^internal medicine$/i },
  { key: "cardiology", label: "Cardiology", codes: ["207RC0000X", "207RC0001X", "207RI0011X", "207RA0001X", "207UN0903X"], words: /cardi(o|ac)/i },
  { key: "geriatrics", label: "Geriatric Medicine", codes: ["207QG0300X", "207RG0300X"], words: /geriatric/i },
  { key: "oncology", label: "Hematology & Oncology", codes: ["207RH0003X", "207RX0202X", "207RH0000X", "2085R0001X", "207VX0201X", "2086X0206X"], words: /oncolog|hematolog/i },
  { key: "pulmonology", label: "Pulmonology", codes: ["207RP1001X", "207RC0200X"], words: /pulmon|critical care/i },
  { key: "gastroenterology", label: "Gastroenterology", codes: ["207RG0100X"], words: /gastroenter/i },
  { key: "nephrology", label: "Nephrology", codes: ["207RN0300X"], words: /nephrolog/i },
  { key: "endocrinology", label: "Endocrinology", codes: ["207RE0101X"], words: /endocrin/i },
  { key: "infectious_disease", label: "Infectious Disease", codes: ["207RI0200X"], words: /infectious/i },
  { key: "rheumatology", label: "Rheumatology", codes: ["207RR0500X"], words: /rheumat/i },
  { key: "orthopedics", label: "Orthopedic Surgery", codes: ["207X"], words: /orthop(a)?edic/i },
  { key: "general_surgery", label: "General Surgery", codes: ["2086"], words: /^surgery$|general surgery/i },
  { key: "psychiatry", label: "Psychiatry", codes: ["2084P08", "2084A0401X", "2084F0202X", "2084P0015X"], words: /psychiatr/i },
  // Counselors, psychoanalysts, behavior analysts, psychologists, social workers, marriage and family therapists.
  { key: "behavioral_health", label: "Behavioral Health", codes: ["101Y", "102L", "103K", "103T", "1041", "106H"], words: /psycholog|behavior analy|mental health|social work|counsel|marriage|family therap/i },
  { key: "neurology", label: "Neurology", codes: ["2084N04", "2084V0102X", "2084N0600X"], words: /neurolog/i },
  { key: "emergency_medicine", label: "Emergency Medicine", codes: ["207P"], words: /emergency/i },
  { key: "obgyn", label: "Obstetrics & Gynecology", codes: ["207V"], words: /obstetric|gynecolog/i },
  { key: "pediatrics", label: "Pediatrics", codes: ["2080"], words: /pediatric/i },
  { key: "dermatology", label: "Dermatology", codes: ["207N"], words: /dermatolog/i },
  { key: "urology", label: "Urology", codes: ["2088"], words: /urolog/i },
  { key: "ophthalmology", label: "Ophthalmology", codes: ["207W"], words: /ophthalm/i },
  { key: "radiology", label: "Radiology", codes: ["2085"], words: /radiolog/i },
  { key: "anesthesiology", label: "Anesthesiology", codes: ["207L"], words: /anesthes/i },
  { key: "pmr", label: "Physical Medicine & Rehabilitation", codes: ["2081"], words: /physical medicine|rehabilitation/i },
  { key: "nurse_practitioner", label: "Nurse Practitioner", codes: ["363L"], words: /nurse practitioner/i },
  { key: "physician_assistant", label: "Physician Assistant", codes: ["363A"], words: /physician assistant/i },
  { key: "physical_therapy", label: "Physical Therapy", codes: ["2251"], words: /physical therap/i },
  { key: "home_health", label: "Home Health", codes: ["251E"], words: /home health/i },
  { key: "hospice", label: "Hospice", codes: ["251G", "315D"], words: /hospice/i },
  { key: "skilled_nursing", label: "Skilled Nursing", codes: ["314000000X", "3140N1450X"], words: /skilled nursing/i },
  { key: "hospital", label: "Hospital", codes: ["282N", "282E", "283X", "273R", "273Y", "281P"], words: /hospital/i },
];

/** Specialties a referral network is usually expected to cover (for gap views). */
export const KEY_SPECIALTY_GROUPS = [
  "family_medicine", "internal_medicine", "cardiology", "orthopedics", "general_surgery", "psychiatry",
  "neurology", "oncology", "dermatology", "emergency_medicine", "obgyn", "pediatrics", "pulmonology",
  "gastroenterology", "nephrology", "urology", "ophthalmology", "endocrinology",
];

const BY_KEY = new Map(SPECIALTY_GROUPS.map((g) => [g.key, g]));
const PREFIXES = SPECIALTY_GROUPS.flatMap((g) => g.codes.map((code) => ({ code, group: g })))
  .sort((a, b) => b.code.length - a.code.length);

export function specialtyGroupLabel(key) {
  return BY_KEY.get(key)?.label || "Other";
}

/** The group for a taxonomy code and/or description; { key: "other" } when nothing matches. */
export function specialtyGroupFor(code, description) {
  const c = (code || "").trim().toUpperCase();
  if (c) {
    const hit = PREFIXES.find((p) => c.startsWith(p.code));
    if (hit) return { key: hit.group.key, label: hit.group.label };
  }
  const d = (description || "").trim();
  if (d) {
    // "Psychiatry & Neurology, Neurology": the part after the comma decides.
    const specialization = d.includes(",") ? d.slice(d.lastIndexOf(",") + 1).trim() : "";
    for (const text of [specialization, d]) {
      if (!text) continue;
      const g = SPECIALTY_GROUPS.find((x) => x.words.test(text));
      if (g) return { key: g.key, label: g.label };
    }
  }
  return { key: "other", label: d || "Unknown" };
}

/** "Individual" / "Organization" from the many spellings NPPES and imports use. */
export function normalizeEntityType(value) {
  const v = String(value ?? "").trim().toLowerCase();
  if (["individual", "1", "npi-1", "person", "i"].includes(v)) return "Individual";
  if (["organization", "organisation", "2", "npi-2", "org", "o"].includes(v)) return "Organization";
  return "Unknown";
}
