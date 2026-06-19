// Pure, dependency-free helpers for the DME Provider Report + email finder.
//
// DME suppliers live in `medicare_facilities` under the
// `medical_equipment_suppliers` facility type (the CMS DMEPOS supplier
// directory). They are keyed by `provider_id` and carry name/address columns
// plus a `raw_data` blob with the original directory row. Emails are not part of
// that dataset, so the report's AI email-finder writes results into
// `enrichment_records` (keyed by the supplier's provider_id) tagged with the
// source below. Keeping the parsing/ranking logic here — free of db/Anthropic
// imports — lets it be unit-tested from Node without booting the server.

export const DME_FACILITY_TYPE = "medical_equipment_suppliers";
export const DME_EMAIL_SOURCE = "dme_email_finder";

const VALIDATION_RANK: Record<string, number> = { valid: 3, risky: 2, unknown: 1, invalid: 0 };
const CONFIDENCE_RANK: Record<string, number> = { high: 3, medium: 2, low: 1 };

const EMAIL_LIKE = /[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}/;

/** Map an LLM "confidence" label to a numeric score for enrichment_records.confidence. */
export function confidenceToScore(confidence?: string | null): number | null {
  switch ((confidence || "").toLowerCase()) {
    case "high": return 0.9;
    case "medium": return 0.6;
    case "low": return 0.3;
    default: return null;
  }
}

/**
 * Rank inferred email candidates best-first: a more trustworthy validation
 * status wins, then higher confidence. Mirrors the ordering the provider email
 * bots use so the report's "best email" is chosen consistently.
 */
export function rankEmailCandidates<T extends { confidence?: string | null; validation_status?: string | null }>(emails: T[]): T[] {
  return [...emails].sort((a, b) => {
    const v = (VALIDATION_RANK[(b.validation_status || "").toLowerCase()] || 0)
            - (VALIDATION_RANK[(a.validation_status || "").toLowerCase()] || 0);
    if (v !== 0) return v;
    return (CONFIDENCE_RANK[(b.confidence || "").toLowerCase()] || 0)
         - (CONFIDENCE_RANK[(a.confidence || "").toLowerCase()] || 0);
  });
}

/**
 * Collect every distinct email found for a DME supplier, primary first.
 *
 * The finder persists the full ranked candidate list in
 * `enrichment_details.all_emails` and the promoted top pick in `new_value`. A
 * supplier can legitimately have several mailboxes (info@, sales@, billing@, …),
 * so the report surfaces all of them. The primary is listed first, then the
 * remaining candidates in rank order, then any directory email, de-duplicated
 * case-insensitively.
 */
export function collectDMEEmails(
  enriched: { new_value?: string | null; enrichment_details?: any } | null | undefined,
  directoryEmail?: string | null,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (e: unknown) => {
    if (typeof e !== "string") return;
    const v = e.trim();
    if (!v) return;
    const key = v.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(v);
  };
  push(enriched?.new_value);
  const all = enriched?.enrichment_details?.all_emails;
  if (Array.isArray(all)) {
    for (const c of all) push(typeof c === "string" ? c : c?.email);
  }
  push(directoryEmail);
  return out;
}

function coerceObject(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === "string") {
    try { const p = JSON.parse(raw); return p && typeof p === "object" ? p as Record<string, unknown> : {}; }
    catch { return {}; }
  }
  if (typeof raw === "object") return raw as Record<string, unknown>;
  return {};
}

/**
 * Best-effort extraction of contact hints from a DME supplier's raw directory
 * row. The CMS DMEPOS file's exact column names vary by vintage, so we scan keys
 * by substring rather than assuming a fixed schema. Used both to seed the AI
 * email finder with better context and to surface a phone/website/NPI in the
 * report without shipping the whole raw_data blob to the client.
 */
export function extractDMEContact(rawData: unknown): {
  npi: string | null;
  phone: string | null;
  website: string | null;
  email: string | null;
} {
  const obj = coerceObject(rawData);
  let npi: string | null = null;
  let phone: string | null = null;
  let website: string | null = null;
  let email: string | null = null;

  for (const [k, vRaw] of Object.entries(obj)) {
    if (vRaw == null) continue;
    const val = String(vRaw).trim();
    if (!val) continue;
    const key = k.toLowerCase();

    if (!email && (key.includes("email") || key.includes("e_mail") || EMAIL_LIKE.test(val))) {
      const m = val.match(EMAIL_LIKE);
      if (m) email = m[0];
    }
    if (!npi && key.includes("npi")) {
      const digits = val.replace(/\D/g, "");
      if (digits.length === 10) npi = digits;
    }
    if (!phone && (key.includes("phone") || key.includes("telephone") || key.startsWith("tel"))) {
      const digits = val.replace(/\D/g, "");
      if (digits.length >= 10) phone = val;
    }
    if (!website && (key.includes("website") || key.includes("url") || key.includes("web_address") || key.includes("homepage"))) {
      website = val;
    }
  }

  return { npi, phone, website, email };
}

/** Normalize a state filter to an uppercase 2-letter code, or null when absent. */
export function normalizeState(state: unknown): string | null {
  if (typeof state !== "string") return null;
  const s = state.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(s) ? s : null;
}

/** Derive a progress view of a background email-finder task from its metadata. */
export function computeJobProgress(metadata: any): {
  total: number;
  processed: number;
  found: number;
  errors: number;
  percent: number;
} {
  const m = metadata || {};
  const total = Number(m.total_items || 0);
  const processed = Number(m.processed_items || 0);
  const found = Number(m.success_count || 0);
  const errors = Number(m.error_count || 0);
  const percent = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;
  return { total, processed, found, errors, percent };
}
