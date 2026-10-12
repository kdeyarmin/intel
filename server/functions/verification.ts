// Data checks that call out to the real world: NPI Registry validation, email
// verification (DNS/MX, no paid service), and connection tests for data
// source URLs. Outbound requests to user-supplied URLs go through safeFetch.
import { pool } from "../db";
import { inSequence } from "../lib/pgSequence";
import { apiKeyHeaders, checkUrl, type CheckResult } from "../lib/connectorCheck";
import { decorateRow } from "../lib/entityFields";
import { buildNpiValidationRecord, isValidNpi } from "../lib/npiValidation";
import { lookupNpi, NppesUnavailableError } from "../lib/nppesClient";
import { checkDomainCached, scoreEmail, type EmailScore } from "../lib/emailVerification";
import { loadSuppressionReasons, normalizeEmail } from "../lib/suppressions";

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function withClient<T>(timeout: string, fn: (client: any) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query(`SET statement_timeout = '${timeout}'`);
    return await fn(client);
  } finally {
    await client.query("RESET statement_timeout").catch(() => {});
    client.release();
  }
}

// ─── NPI Registry ────────────────────────────────────────────────────────────

export async function handleValidateProviderNPI(payload: any) {
  const npi = String(payload?.npi || "").trim();
  if (!/^\d{10}$/.test(npi)) throw new HttpError(400, "A 10-digit NPI is required.");
  if (!isValidNpi(npi)) {
    return { success: false, error: `${npi} isn't a valid NPI: its check digit doesn't match. Check for a typo.` };
  }

  let result: any | null;
  try {
    result = await lookupNpi(npi);
  } catch (e) {
    if (e instanceof NppesUnavailableError) return { success: false, error: e.message };
    throw e;
  }

  const local = await withClient("10s", async (client) => {
    const [p, l, t] = await inSequence([
      () => client.query("SELECT entity_type, first_name, last_name, organization_name, credential, status FROM providers WHERE npi = $1 LIMIT 1", [npi]),
      // The practice location if there is one (a provider can have many rows).
      () => client.query(
        "SELECT address_1, address_2, city, state, zip, phone, location_type FROM provider_locations WHERE npi = $1 ORDER BY (location_type = 'Practice') DESC NULLS LAST LIMIT 1",
        [npi],
      ),
      () => client.query("SELECT taxonomy_code FROM provider_taxonomies WHERE npi = $1 AND is_primary = true LIMIT 1", [npi]),
    ]);
    const location = l.rows[0] || null;
    return { provider: p.rows[0] || null, location, primaryTaxonomyCode: t.rows[0]?.taxonomy_code || null };
  });
  // Always the full comparison: this is the one record everyone sees for the
  // NPI, so a caller can't save an empty discrepancy list over it.
  const record = buildNpiValidationRecord(npi, result, local);

  // One stored record per NPI (the details live in the jsonb column, which the
  // entity API spreads back onto the row). The update-or-insert runs under a
  // per-NPI transaction lock so two concurrent checks can't both insert.
  // Older data can hold duplicate rows for an NPI; all of them are updated, so
  // whichever one a reader picks is current.
  const row = await withClient("10s", async (client) => {
    const values = [npi, record.status, JSON.stringify(record)];
    await client.query("BEGIN");
    try {
      await client.query("SELECT pg_advisory_xact_lock(hashtext('provider_npi_validation:' || $1))", [npi]);
      const updated = await client.query(
        `UPDATE provider_npi_validations SET validation_status = $2, validation_details = $3::jsonb, validated_at = now(), updated_date = now()
          WHERE npi = $1 RETURNING *`,
        values,
      );
      const newest = updated.rows.reduce((a: any, b: any) => (a && a.id > b.id ? a : b), null);
      const saved = newest ?? (await client.query(
        `INSERT INTO provider_npi_validations (npi, validation_status, validation_details, validated_at)
         VALUES ($1, $2, $3::jsonb, now()) RETURNING *`,
        values,
      )).rows[0];
      await client.query("COMMIT");
      return saved;
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    }
  });

  return { success: true, validation: decorateRow("ProviderNPIValidation", row) };
}

// ─── Email verification ──────────────────────────────────────────────────────

interface VerifiedEmail extends EmailScore {
  npi: string | null;
  name: string | null;
  email: string;
  dns: { hasMX: boolean | null; mxCount: number } | null;
}

async function verifyEmailAddress(email: string, suppression: string | null): Promise<Omit<VerifiedEmail, "npi" | "name">> {
  const normalized = normalizeEmail(email);
  const domain = normalized.split("@")[1];
  const dnsCheck = domain && normalized.includes("@") ? await checkDomainCached(domain) : null;
  const scored = scoreEmail(normalized, dnsCheck, suppression);
  return { ...scored, email, dns: dnsCheck && !dnsCheck.error ? { hasMX: dnsCheck.hasMX, mxCount: dnsCheck.mxCount } : null };
}

const displayName = (p: any) =>
  p.organization_name || [p.first_name, p.last_name].filter(Boolean).join(" ") || p.npi;

async function saveEmailResult(providerId: number, r: Omit<VerifiedEmail, "npi" | "name">) {
  if (r.status === "unknown") return; // a DNS hiccup shouldn't overwrite a real result
  // Only if the provider still has the address that was checked: an edit
  // during the check would otherwise get the old address's verdict.
  await pool.query(
    `UPDATE providers SET email_validation_status = $2, email_validation_reason = $3, email_quality_score = $4,
            email_quality_confidence = $5, email_quality_reasons = $6::jsonb, email_quality_risk_flags = $7::jsonb,
            email_analyzed_at = now(), updated_date = now()
      WHERE id = $1 AND lower(email) = lower($8)`,
    [providerId, r.status, r.reasons[0] || null, r.score, r.confidence, JSON.stringify(r.reasons), JSON.stringify(r.riskFlags), r.email],
  );
}

/** Verify one provider's email (provider_id or npi), or a bare `email` without saving anything. */
export async function handleVerifyProviderEmail(payload: any) {
  if (!payload?.provider_id && !payload?.npi && payload?.email) {
    const email = String(payload.email).trim();
    const reasons = await loadSuppressionReasons([email]);
    return { success: true, npi: null, name: null, ...(await verifyEmailAddress(email, reasons.get(normalizeEmail(email)) || null)) };
  }

  const { rows } = payload?.provider_id
    ? await pool.query("SELECT id, npi, email, first_name, last_name, organization_name FROM providers WHERE id = $1", [Number(payload.provider_id)])
    : await pool.query("SELECT id, npi, email, first_name, last_name, organization_name FROM providers WHERE npi = $1 LIMIT 1", [String(payload?.npi || "")]);
  const provider = rows[0];
  if (!provider) throw new HttpError(404, "Provider not found.");
  if (!provider.email) return { success: false, error: "This provider has no email address to verify." };

  const reasons = await loadSuppressionReasons([provider.email]);
  const result = await verifyEmailAddress(provider.email, reasons.get(normalizeEmail(provider.email)) || null);
  await saveEmailResult(provider.id, result);
  return { success: true, npi: provider.npi, name: displayName(provider), ...result };
}

// "Checked" means a DNS check of the current address (email_analyzed_at set).
// The AI email search writes its own guess at the status without one, so those
// addresses count as unverified, not risky or invalid. The email panels count
// with the same marker (src/components/emailBot/emailCheck.js).
const BULK_MODES: Record<string, string> = {
  unverified: "email_analyzed_at IS NULL",
  reverify: "email_analyzed_at IS NOT NULL AND email_validation_status IN ('risky', 'invalid')",
  risky: "email_analyzed_at IS NOT NULL AND email_validation_status = 'risky'",
  invalid: "email_analyzed_at IS NOT NULL AND email_validation_status = 'invalid'",
};
const HAS_EMAIL = "email IS NOT NULL AND email <> ''";
const MAX_SPECIFIC_NPIS = 100;

/**
 * Whether a provider checked in this mode still matches the mode afterwards.
 * An `unknown` result isn't saved, so the row keeps whatever made it match.
 */
export function stillMatchesMode(mode: string, status: EmailScore["status"]): boolean {
  if (mode === "specific_npis") return false;
  if (status === "unknown") return true;
  if (mode === "reverify") return status === "risky" || status === "invalid";
  return status === mode;
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const index = i++;
      out[index] = await fn(items[index]);
    }
  }));
  return out;
}

/** Admin: verify a batch of provider emails (by mode, or a list of NPIs). */
export async function handleBulkVerifyEmails(payload: any) {
  const mode = String(payload?.mode || "unverified");
  const batchSize = Math.min(Math.max(Number(payload?.batch_size) || 10, 1), 100);

  const { candidates, total } = await withClient("15s", async (client) => {
    if (mode === "specific_npis") {
      const npis = [...new Set<string>((Array.isArray(payload?.npis) ? payload.npis : []).map(String).filter((n: string) => /^\d{10}$/.test(n)))];
      if (npis.length === 0) throw new HttpError(400, "Choose at least one provider.");
      // Refused rather than cut short, so a caller never thinks unchecked
      // providers were done. The page sends larger selections in chunks.
      if (npis.length > MAX_SPECIFIC_NPIS) throw new HttpError(400, `Verify at most ${MAX_SPECIFIC_NPIS} providers per request.`);
      const { rows } = await client.query(
        `SELECT id, npi, email, first_name, last_name, organization_name FROM providers WHERE npi = ANY($1) AND ${HAS_EMAIL}`,
        [npis],
      );
      return { candidates: rows, total: rows.length };
    }
    const where = BULK_MODES[mode];
    if (!where) throw new HttpError(400, `Unknown mode '${mode}'.`);
    const [{ rows }, count] = await Promise.all([
      client.query(
        `SELECT id, npi, email, first_name, last_name, organization_name FROM providers
          WHERE ${HAS_EMAIL} AND ${where} ORDER BY email_analyzed_at NULLS FIRST, id LIMIT $1`,
        [batchSize],
      ),
      client.query(`SELECT count(*)::int AS n FROM providers WHERE ${HAS_EMAIL} AND ${where}`),
    ]);
    return { candidates: rows, total: count.rows[0].n as number };
  });

  const reasons = await loadSuppressionReasons(candidates.map((c: any) => c.email));
  const results: VerifiedEmail[] = await mapWithConcurrency(candidates, 5, async (p: any) => {
    const r = await verifyEmailAddress(p.email, reasons.get(normalizeEmail(p.email)) || null);
    await saveEmailResult(p.id, r);
    return { npi: p.npi, name: displayName(p), ...r };
  });

  const verified = results.filter((r) => r.status !== "unknown").length;
  const stillMatching = results.filter((r) => stillMatchesMode(mode, r.status)).length;
  return {
    success: true,
    verified,
    batch_processed: results.length,
    total_candidates: total,
    remaining: Math.max(0, total - results.length + stillMatching),
    summary: {
      valid: results.filter((r) => r.status === "valid").length,
      risky: results.filter((r) => r.status === "risky").length,
      invalid: results.filter((r) => r.status === "invalid").length,
      unknown: results.filter((r) => r.status === "unknown").length,
    },
    results,
  };
}

// ─── Connection tests ────────────────────────────────────────────────────────

/** Admin: check that a data URL is reachable and returns data. Nothing is saved. */
export async function handleTestCMSUrl(payload: any) {
  const url = String(payload?.url || "").trim();
  if (!url) throw new HttpError(400, "Enter a URL to check.");
  const check = await checkUrl(url);
  return { success: true, ok: check.status !== "failed", check };
}

/** Admin: call a saved connector's URL with its API key and record the outcome on the connector. */
export async function handleTestCMSApiConnector(payload: any) {
  const id = Number(payload?.connector_id);
  if (!Number.isInteger(id)) throw new HttpError(400, "connector_id is required.");
  const { rows } = await pool.query("SELECT * FROM cms_api_connectors WHERE id = $1", [id]);
  if (!rows[0]) throw new HttpError(404, "Connector not found.");
  const connector = decorateRow("CMSApiConnector", rows[0]);
  const url = connector.api_url || connector.api_endpoint;
  if (!url) return { success: false, error: "Add the connector's base URL first." };

  const check: CheckResult = await checkUrl(url, {
    headers: { accept: "application/json, */*", ...apiKeyHeaders(connector.api_key, connector.api_key_header) },
  });
  const testFields = { test_status: check.status, test_message: check.message, last_tested_at: new Date().toISOString() };
  const { rows: [updated] } = await pool.query(
    `UPDATE cms_api_connectors SET config = COALESCE(config, '{}'::jsonb) || $2::jsonb, updated_date = now()
      WHERE id = $1 RETURNING *`,
    [id, JSON.stringify(testFields)],
  );
  const saved = decorateRow("CMSApiConnector", updated);
  return { success: true, ok: check.status !== "failed", check, connector: saved };
}
