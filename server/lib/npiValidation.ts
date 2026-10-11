// Pure NPI helpers: the check-digit test and turning an NPPES registry result
// into the record the provider page shows (and compares with our data).

/** NPI check digit: Luhn over "80840" + the 10 digits (CMS's card-issuer prefix). */
export function isValidNpi(npi: unknown): boolean {
  const s = String(npi ?? "").trim();
  if (!/^[12]\d{9}$/.test(s)) return false;
  const digits = `80840${s}`;
  let sum = 0;
  for (let i = 0; i < digits.length; i += 1) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

export type NpiStatus = "active" | "deactivated" | "not_found";

export interface NpiValidationRecord {
  npi: string;
  is_valid: boolean;
  status: NpiStatus;
  npi_type: "individual" | "organization" | null;
  first_name: string | null;
  last_name: string | null;
  organization_name: string | null;
  credentials: string[];
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  taxonomies: Array<{ code: string; description: string; primary: boolean; state: string | null; license: string | null }>;
  enumeration_date: string | null;
  registry_last_updated: string | null;
  discrepancies: string[];
  checked_at: string;
}

const clean = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
  return s ? s : null;
};

const norm = (v: unknown) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

// USPS-style abbreviations, so "123 Main Street" and "123 MAIN ST." compare equal.
const STREET_WORDS: Record<string, string> = {
  street: "st", avenue: "ave", road: "rd", drive: "dr", boulevard: "blvd", lane: "ln", court: "ct",
  place: "pl", parkway: "pkwy", highway: "hwy", circle: "cir", terrace: "ter", square: "sq",
  suite: "ste", floor: "fl", building: "bldg", north: "n", south: "s", east: "e", west: "w",
};
const streetKey = (v: unknown) =>
  String(v ?? "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean)
    .map((w) => STREET_WORDS[w] ?? w).join(" ");
const zip5 = (v: unknown) => String(v ?? "").replace(/\D/g, "").slice(0, 5);
const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "").slice(-10);

export interface LocalProviderData {
  provider?: { entity_type?: string | null; first_name?: string | null; last_name?: string | null; organization_name?: string | null; credential?: string | null; status?: string | null } | null;
  location?: { address_1?: string | null; city?: string | null; state?: string | null; zip?: string | null; phone?: string | null } | null;
  primaryTaxonomyCode?: string | null;
}

/**
 * Build the stored validation record from an NPPES API v2.1 result (null when
 * the registry has no such NPI: never issued, or deactivated — NPPES omits
 * deactivated NPIs from the API). Discrepancies compare against our copy.
 */
export function buildNpiValidationRecord(
  npi: string,
  result: any | null,
  local: LocalProviderData = {},
  now: Date = new Date(),
): NpiValidationRecord {
  const checked_at = now.toISOString();
  if (!result) {
    const discrepancies = local.provider && !/deactivat/i.test(local.provider.status || "")
      ? ["Not in the NPI Registry, but marked active here. The NPI may have been deactivated."]
      : [];
    return {
      npi, is_valid: false, status: "not_found", npi_type: null,
      first_name: null, last_name: null, organization_name: null, credentials: [],
      address: null, city: null, state: null, zip: null, phone: null, taxonomies: [],
      enumeration_date: null, registry_last_updated: null, discrepancies, checked_at,
    };
  }

  const basic = result.basic || {};
  const addresses: any[] = Array.isArray(result.addresses) ? result.addresses : [];
  const practice = addresses.find((a) => a.address_purpose === "LOCATION") || addresses[0] || {};
  const deactivated = !!basic.deactivation_date && !basic.reactivation_date;
  const npiType = result.enumeration_type === "NPI-2" ? "organization" : result.enumeration_type === "NPI-1" ? "individual" : null;
  const credentials = clean(basic.credential)
    ? String(basic.credential).split(/[,;]/).map((c) => c.trim()).filter(Boolean)
    : [];
  const taxonomies = (Array.isArray(result.taxonomies) ? result.taxonomies : []).map((t: any) => ({
    code: String(t.code || ""),
    description: String(t.desc || t.description || ""),
    primary: t.primary === true || t.primary === "Y",
    state: clean(t.state),
    license: clean(t.license),
  }));
  const zip = clean(practice.postal_code);

  const record: NpiValidationRecord = {
    npi,
    is_valid: !deactivated,
    status: deactivated ? "deactivated" : "active",
    npi_type: npiType,
    first_name: clean(basic.first_name),
    last_name: clean(basic.last_name),
    organization_name: clean(basic.organization_name),
    credentials,
    address: [clean(practice.address_1), clean(practice.address_2)].filter(Boolean).join(", ") || null,
    city: clean(practice.city),
    state: clean(practice.state),
    zip: zip ? (zip.length === 9 ? `${zip.slice(0, 5)}-${zip.slice(5)}` : zip) : null,
    phone: clean(practice.telephone_number),
    taxonomies,
    enumeration_date: clean(basic.enumeration_date),
    registry_last_updated: clean(basic.last_updated),
    discrepancies: [],
    checked_at,
  };
  record.discrepancies = findDiscrepancies(record, local);
  return record;
}

function findDiscrepancies(r: NpiValidationRecord, local: LocalProviderData): string[] {
  const out: string[] = [];
  const p = local.provider;
  if (p) {
    if (r.npi_type === "organization") {
      if (p.organization_name && r.organization_name && norm(p.organization_name) !== norm(r.organization_name)) {
        out.push(`Organization name: "${p.organization_name}" here, "${r.organization_name}" in the registry.`);
      }
    } else {
      const ours = `${p.first_name || ""} ${p.last_name || ""}`.trim();
      const theirs = `${r.first_name || ""} ${r.last_name || ""}`.trim();
      if (ours && theirs && norm(ours) !== norm(theirs)) out.push(`Name: "${ours}" here, "${theirs}" in the registry.`);
      if (p.credential && r.credentials.length && !r.credentials.some((c) => norm(c) === norm(p.credential))) {
        out.push(`Credential: "${p.credential}" here, "${r.credentials.join(", ")}" in the registry.`);
      }
    }
    if (r.status === "deactivated" && !/deactivat/i.test(p.status || "")) {
      out.push("The registry lists this NPI as deactivated, but it's marked active here.");
    }
  }
  const l = local.location;
  if (l) {
    const ourAddr = [l.address_1, l.city, l.state].filter(Boolean).join(", ");
    const theirAddr = [r.address, r.city, r.state].filter(Boolean).join(", ");
    // The registry's first address line, to compare streets (a move within
    // the same ZIP keeps city, state and ZIP).
    const registryStreet = (r.address || "").split(",")[0];
    const addrDiffers = (l.city && r.city && norm(l.city) !== norm(r.city))
      || (l.state && r.state && norm(l.state) !== norm(r.state))
      || (l.zip && r.zip && zip5(l.zip) !== zip5(r.zip))
      || (l.address_1 && registryStreet && streetKey(l.address_1) !== streetKey(registryStreet));
    if (addrDiffers) out.push(`Practice address: "${ourAddr}" here, "${theirAddr}" in the registry.`);
    if (l.phone && r.phone && digits(l.phone) !== digits(r.phone)) {
      out.push(`Practice phone: ${l.phone} here, ${r.phone} in the registry.`);
    }
  }
  if (local.primaryTaxonomyCode) {
    const primary = r.taxonomies.find((t) => t.primary);
    if (primary && primary.code && primary.code !== local.primaryTaxonomyCode) {
      out.push(`Primary specialty: ${local.primaryTaxonomyCode} here, ${primary.code} (${primary.description}) in the registry.`);
    }
  }
  return out;
}
