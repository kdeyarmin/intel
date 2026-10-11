// Provider ↔ Medicare facility matching, pure parts. Suggests which nearby
// facilities a provider is likely affiliated with, scoring address, proximity
// (zip/city: there are no coordinates in the data), specialty fit and
// referral ties. Suggestions are reviewed by a person on the matching page.

export interface MatchProvider {
  npi: string;
  name: string;
  isOrganization: boolean;
  taxonomy: string | null;
  address: string | null;
  city: string | null;
  zip: string | null;
}

export interface MatchFacility {
  id: number;
  group: string;
  provider_id: string | null;
  name: string;
  address: string | null;
  city: string | null;
  zip: string | null;
}

export interface FacilityMatch {
  npi: string;
  facility_id: number;
  provider_name: string;
  location_display: string;
  confidence_score: number;
  address_match_score: number;
  proximity_score: number;
  specialization_score: number;
  referral_score: number;
  name_match_score?: number;
  match_reasons: string[];
}

export const FACILITY_GROUP_LABELS: Record<string, string> = {
  hospital: "Hospital",
  home_health: "Home health agency",
  hospice: "Hospice",
  snf: "Skilled nursing facility",
  irf: "Inpatient rehab facility",
  ltch: "Long-term care hospital",
  dme: "Medical equipment supplier",
  community_health: "Community health center",
};

// How well a specialty (taxonomy description keywords) fits each kind of facility.
const SPECIALTY_FIT: Array<{ pattern: RegExp; fit: Partial<Record<string, number>> }> = [
  { pattern: /hospice|palliative/i, fit: { hospice: 100, home_health: 60, snf: 50 } },
  { pattern: /home health|home care/i, fit: { home_health: 100, hospice: 50 } },
  { pattern: /geriatric|nursing facility|skilled nursing|long.?term/i, fit: { snf: 100, ltch: 80, hospice: 60, home_health: 60 } },
  { pattern: /physical medicine|rehabilitation|physical therap|occupational therap|speech/i, fit: { irf: 100, snf: 70, home_health: 60, hospital: 50 } },
  { pattern: /hospitalist|emergency|critical care|anesthesi|surgery|surgeon|radiolog|patholog|cardio|oncolog|neurolog|pulmon|nephrolog|gastro|urolog|orthop/i, fit: { hospital: 100, ltch: 60 } },
  { pattern: /internal medicine|family|general practice|pediatric|obstetric|gynecolog/i, fit: { hospital: 70, community_health: 90, snf: 40 } },
  { pattern: /nurse practitioner|registered nurse|physician assistant/i, fit: { hospital: 60, community_health: 70, home_health: 70, snf: 60, hospice: 60 } },
  { pattern: /durable medical|medical supply|prosthetic|orthotic|oxygen/i, fit: { dme: 100 } },
  { pattern: /psychiatr|psycholog|counsel|social work/i, fit: { community_health: 80, hospital: 50 } },
];

export function specialtyFit(taxonomy: string | null, group: string): number {
  if (!taxonomy) return 0;
  let best = 0;
  for (const { pattern, fit } of SPECIALTY_FIT) if (pattern.test(taxonomy)) best = Math.max(best, fit[group] || 0);
  return best;
}

const STREET_WORDS: Record<string, string> = {
  street: "st", st: "st", avenue: "ave", ave: "ave", road: "rd", rd: "rd", drive: "dr", dr: "dr", boulevard: "blvd", blvd: "blvd",
  lane: "ln", ln: "ln", court: "ct", ct: "ct", highway: "hwy", hwy: "hwy", parkway: "pkwy", pkwy: "pkwy", place: "pl", pl: "pl",
  suite: "", ste: "", floor: "", fl: "", unit: "", north: "n", n: "n", south: "s", s: "s", east: "e", e: "e", west: "w", w: "w",
};
const NAME_STOP = new Set(["the", "of", "and", "inc", "llc", "pc", "pa", "corp", "co", "center", "centre", "health", "medical", "hospital", "services", "care"]);

export function streetTokens(address: string | null): string[] {
  return String(address || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/)
    .map((t) => (t in STREET_WORDS ? STREET_WORDS[t] : t)).filter(Boolean);
}

function jaccard(a: string[], b: string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter += 1;
  return inter / (A.size + B.size - inter);
}

const zip5 = (z: string | null) => String(z || "").replace(/\D/g, "").slice(0, 5);
const norm = (s: string | null) => String(s || "").trim().toLowerCase();

export function addressScore(p: MatchProvider, f: MatchFacility): number {
  const a = streetTokens(p.address);
  const b = streetTokens(f.address);
  if (!a.length || !b.length) return 0;
  const sameNumber = a[0] && /^\d+$/.test(a[0]) && a[0] === b[0];
  const overlap = jaccard(a, b);
  const sameZip = zip5(p.zip) && zip5(p.zip) === zip5(f.zip);
  // Same building number and street on the same zip is effectively the same address.
  return Math.round(Math.min(100, overlap * 70 + (sameNumber ? 20 : 0) + (sameZip && overlap > 0 ? 10 : 0)));
}

export function proximityScore(p: MatchProvider, f: MatchFacility): number {
  const pz = zip5(p.zip);
  const fz = zip5(f.zip);
  if (pz && pz === fz) return 100;
  if (norm(p.city) && norm(p.city) === norm(f.city)) return 70;
  if (pz.length === 5 && fz.length === 5 && pz.slice(0, 3) === fz.slice(0, 3)) return 50;
  return 0;
}

export function nameScore(p: MatchProvider, f: MatchFacility): number | undefined {
  if (!p.isOrganization) return undefined;
  const t = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w && !NAME_STOP.has(w));
  return Math.round(jaccard(t(p.name), t(f.name)) * 100);
}

/**
 * Score one provider against nearby facilities and keep the best few.
 * `referralVolume(facility)` returns how many referrals the provider sent to
 * the facility's NPI (0 when the facility has no NPI or there are none).
 */
export function scoreProviderMatches(
  p: MatchProvider,
  facilities: MatchFacility[],
  referralVolume: (f: MatchFacility) => number,
  { minConfidence = 40, keep = 3 } = {},
): FacilityMatch[] {
  const out: FacilityMatch[] = [];
  for (const f of facilities) {
    const proximity = proximityScore(p, f);
    if (proximity === 0) continue; // nothing nearby to suggest
    const address = addressScore(p, f);
    const specialization = specialtyFit(p.taxonomy, f.group);
    const volume = referralVolume(f);
    const referral = volume > 0 ? Math.min(100, 50 + Math.round(Math.log10(1 + volume) * 25)) : 0;
    const name = nameScore(p, f);

    let confidence = address * 0.35 + proximity * 0.2 + specialization * 0.25 + referral * 0.2;
    if (name !== undefined) confidence = Math.max(confidence, confidence * 0.7 + name * 0.3);
    if (referral > 0) confidence = Math.max(confidence, 60); // a real referral tie is strong evidence on its own
    confidence = Math.round(Math.min(100, confidence));
    if (confidence < minConfidence) continue;

    const reasons: string[] = [];
    if (address >= 60) reasons.push("Practice address matches the facility's address");
    else if (address >= 30) reasons.push("Practice address is similar to the facility's");
    if (proximity === 100) reasons.push("Same ZIP code");
    else if (proximity === 70) reasons.push(`Same city (${f.city})`);
    else if (proximity === 50) reasons.push("Nearby ZIP code");
    if (specialization >= 70) reasons.push(`${p.taxonomy} commonly works with a ${FACILITY_GROUP_LABELS[f.group]?.toLowerCase() || f.group}`);
    if (referral > 0) reasons.push(`Sent ${volume.toLocaleString("en-US")} referrals to this facility`);
    if (name !== undefined && name >= 50) reasons.push("Organization name matches the facility name");

    out.push({
      npi: p.npi,
      facility_id: f.id,
      provider_name: p.name,
      location_display: [f.name, [f.address, f.city].filter(Boolean).join(", "), FACILITY_GROUP_LABELS[f.group]].filter(Boolean).join(" · "),
      confidence_score: confidence,
      address_match_score: address,
      proximity_score: proximity,
      specialization_score: specialization,
      referral_score: referral,
      ...(name !== undefined ? { name_match_score: name } : {}),
      match_reasons: reasons,
    });
  }
  return out.sort((a, b) => b.confidence_score - a.confidence_score || a.facility_id - b.facility_id).slice(0, keep);
}
