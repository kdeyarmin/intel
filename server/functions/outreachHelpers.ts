// Pure helpers for campaign outreach (no DB / network), unit-tested from Node.
import crypto from "crypto";
import { isValidEmailSyntax } from "./emailValidation";

// ─── Merge fields ────────────────────────────────────────────────────────────

export const MERGE_FIELDS = [
  "provider_name",
  "first_name",
  "last_name",
  "credential",
  "specialty",
  "organization_name",
  "location_city",
  "location_state",
  "npi",
] as const;

export type MergeVars = Partial<Record<(typeof MERGE_FIELDS)[number], string>>;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Replace {{field}} tokens. Unknown or empty fields become "" so a recipient
 * never sees a raw "{{specialty}}".
 */
export function renderTemplate(template: string, vars: MergeVars): string {
  return String(template || "").replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) =>
    String((vars as Record<string, string | undefined>)[key] ?? ""),
  );
}

/** Plain-text email body → minimal safe HTML. */
export function textToHtml(text: string): string {
  return escapeHtml(text).replace(/\r?\n/g, "<br>");
}

export function buildMergeVars(
  provider: Record<string, any>,
  taxonomy?: Record<string, any> | null,
  location?: Record<string, any> | null,
): MergeVars {
  const isOrg = provider.entity_type === "Organization";
  const first = (provider.first_name || "").trim();
  const last = (provider.last_name || "").trim();
  const fullName = [first, last].filter(Boolean).join(" ");
  const providerName = isOrg
    ? provider.organization_name || ""
    : fullName
      ? `${/\b(MD|DO)\b/i.test(provider.credential || "") ? "Dr. " : ""}${fullName}`
      : "";
  return {
    provider_name: providerName,
    first_name: isOrg ? provider.organization_name || "" : first,
    last_name: last,
    credential: provider.credential || "",
    specialty: taxonomy?.taxonomy_description || "",
    organization_name: provider.organization_name || "",
    location_city: location?.city || "",
    location_state: location?.state || "",
    npi: provider.npi || "",
  };
}

// ─── Recipients ──────────────────────────────────────────────────────────────

export type RecipientStatus = "ok" | "no_email" | "invalid_email" | "suppressed" | "duplicate";

export function classifyRecipient(
  provider: { email?: string | null; email_validation_status?: string | null },
  suppressed: ReadonlySet<string>,
  seen: Set<string>,
): RecipientStatus {
  const email = (provider.email || "").trim().toLowerCase();
  if (!email) return "no_email";
  if (provider.email_validation_status === "invalid" || !isValidEmailSyntax(email)) return "invalid_email";
  if (suppressed.has(email)) return "suppressed";
  if (seen.has(email)) return "duplicate";
  seen.add(email);
  return "ok";
}

// ─── Unsubscribe links ───────────────────────────────────────────────────────

const b64url = (buf: Buffer) => buf.toString("base64url");

function signEmail(email: string, secret: string): string {
  return b64url(crypto.createHmac("sha256", secret).update(email).digest()).slice(0, 32);
}

export function buildUnsubscribeToken(email: string, secret: string): string {
  const normalized = email.trim().toLowerCase();
  return `${b64url(Buffer.from(normalized))}.${signEmail(normalized, secret)}`;
}

/** The email an unsubscribe token was issued for, or null if it was tampered with. */
export function verifyUnsubscribeToken(token: string, secret: string): string | null {
  const [payload, sig] = String(token || "").split(".");
  if (!payload || !sig) return null;
  let email: string;
  try {
    email = Buffer.from(payload, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const expected = signEmail(email, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return email;
}

// ─── Compliance footer (CAN-SPAM: physical address + working opt-out) ───────

export function appendComplianceFooter(
  body: { text: string; html: string },
  opts: { physicalAddress: string; unsubscribeUrl: string; senderName?: string },
): { text: string; html: string } {
  const who = opts.senderName || "CareMetric Healthcare Advisors";
  const text = `${body.text}\n\n--\nYou're receiving this because ${who} is reaching out to healthcare providers in your area.\nUnsubscribe: ${opts.unsubscribeUrl}\n${opts.physicalAddress}`;
  const html = `${body.html}<br><br><hr style="border:none;border-top:1px solid #ddd">`
    + `<p style="font-size:12px;color:#666">You're receiving this because ${escapeHtml(who)} is reaching out to healthcare providers in your area. `
    + `<a href="${escapeHtml(opts.unsubscribeUrl)}">Unsubscribe</a><br>${escapeHtml(opts.physicalAddress)}</p>`;
  return { text, html };
}

// ─── Campaign metrics ────────────────────────────────────────────────────────

export interface MessageCounts {
  total: number;
  pending: number;
  sending: number;
  failed: number;
  suppressed: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  responded: number;
  bounced: number;
}

const rate = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);

export function buildCampaignMetrics(c: MessageCounts) {
  return {
    total_recipients: c.total,
    pending: c.pending + c.sending,
    sent: c.sent,
    delivered: c.delivered,
    opened: c.opened,
    clicked: c.clicked,
    responded: c.responded,
    bounced: c.bounced,
    failed: c.failed,
    suppressed: c.suppressed,
    open_rate: rate(c.opened, c.sent),
    click_rate: rate(c.clicked, c.sent),
    response_rate: rate(c.responded, c.sent),
    bounce_rate: rate(c.bounced, c.sent),
  };
}

// Delivery events only ever move a message forward (an "open" arriving before
// "delivered" must not be overwritten by it).
const STATUS_RANK: Record<string, number> = {
  pending: 0, sending: 1, sent: 2, delivered: 3, opened: 4, clicked: 5, responded: 6,
};

export function shouldAdvanceStatus(current: string | null | undefined, next: string): boolean {
  if (current === "bounced" || current === "failed" || current === "suppressed") return false;
  if (next === "bounced") return true;
  return (STATUS_RANK[next] ?? -1) > (STATUS_RANK[current || "pending"] ?? -1);
}

const TERMINAL_STATUSES = ["bounced", "failed", "suppressed"];

/**
 * SQL for the status a message should take when `next` arrives, given its
 * current `current` status: shouldAdvanceStatus, evaluated in the UPDATE
 * itself so concurrent webhook deliveries can't move a message backwards.
 */
export function advancedStatusSql(current: string, next: string): string {
  const rank = (expr: string) =>
    `(CASE ${expr} ${Object.entries(STATUS_RANK).map(([s, r]) => `WHEN '${s}' THEN ${r}`).join(" ")} ELSE -1 END)`;
  return `CASE
    WHEN ${current} IN (${TERMINAL_STATUSES.map((s) => `'${s}'`).join(", ")}) THEN ${current}
    WHEN ${next} = 'bounced' THEN 'bounced'
    WHEN ${next} IS NOT NULL AND ${rank(next)} > ${rank(`COALESCE(${current}, 'pending')`)} THEN ${next}
    ELSE ${current}
  END`;
}

export interface MessageEventSummary {
  messageId: number;
  status: string | null;
  openedAt: Date | null;
  clickedAt: Date | null;
  bouncedAt: Date | null;
  error: string | null;
}

type FoldableEvent = {
  messageId: number;
  status: string | null;
  timestampColumn: "opened_at" | "clicked_at" | "bounced_at" | null;
  at: Date;
  error: string | null;
};

/** One summary per message: its furthest status, earliest timestamps and last error. */
export function foldMessageEvents(updates: FoldableEvent[]): MessageEventSummary[] {
  const byId = new Map<number, MessageEventSummary>();
  const earliest = (a: Date | null, b: Date) => (a && a <= b ? a : b);
  for (const u of updates) {
    const s = byId.get(u.messageId) ?? {
      messageId: u.messageId, status: null, openedAt: null, clickedAt: null, bouncedAt: null, error: null,
    };
    if (u.status && (s.status === null || shouldAdvanceStatus(s.status, u.status))) s.status = u.status;
    if (u.timestampColumn === "opened_at") s.openedAt = earliest(s.openedAt, u.at);
    if (u.timestampColumn === "clicked_at") s.clickedAt = earliest(s.clickedAt, u.at);
    if (u.timestampColumn === "bounced_at") s.bouncedAt = earliest(s.bouncedAt, u.at);
    if (u.error) s.error = u.error;
    byId.set(u.messageId, s);
  }
  return [...byId.values()];
}

// SendGrid rejects the whole request on 401/403 (bad key, unverified sender)
// and 429 (rate limit): nothing went out, so the message can be retried.
// Other errors (e.g. a 400 for one bad address) belong to that message alone.
export function isRetryableSendError(err: any): boolean {
  const code = Number(err?.code ?? err?.response?.statusCode);
  return code === 401 || code === 403 || code === 429;
}

export function sendErrorReason(err: any): string {
  return String(err?.response?.body?.errors?.[0]?.message || err?.message || "Send failed").slice(0, 500);
}

// ─── Outreach score ──────────────────────────────────────────────────────────

export interface OutreachFeatures {
  status?: string | null;
  email?: string | null;
  emailValidationStatus?: string | null;
  /** The address unsubscribed, bounced or reported spam. */
  emailSuppressed?: boolean;
  hasPhone: boolean;
  beneficiaries: number | null;
  referralPartners: number;
  messagesSent: number;
  opened: number;
  responded: number;
  bounced: number;
  hasSpecialty: boolean;
  hasLocation: boolean;
  hasCredential: boolean;
}

export function computeOutreachScore(f: OutreachFeatures) {
  if (f.status && /deactivat/i.test(f.status)) {
    return {
      score: 0,
      components: { reachability: 0, volume: 0, network: 0, engagement: 0, completeness: 0 },
      factors: ["NPI is deactivated"],
      strategy: "Skip: this NPI is deactivated.",
    };
  }

  const factors: string[] = [];
  const hasEmail = !!f.email && isValidEmailSyntax(f.email);
  let reachability = 0;
  if (hasEmail && f.emailSuppressed) { factors.push("Email has opted out of outreach"); }
  else if (hasEmail && f.emailValidationStatus === "valid") { reachability += 25; factors.push("Verified email on file"); }
  else if (hasEmail && f.emailValidationStatus === "invalid") { factors.push("Email on file is invalid"); }
  else if (hasEmail) { reachability += 15; factors.push("Unverified email on file"); }
  else factors.push("No email on file");
  if (f.hasPhone) { reachability += 10; factors.push("Phone number on file"); }
  reachability = Math.min(35, reachability);

  const benes = Math.max(0, f.beneficiaries || 0);
  const volume = benes > 0 ? Math.min(25, Math.round((25 * Math.log10(1 + benes)) / Math.log10(2001))) : 0;
  if (benes > 0) factors.push(`${benes.toLocaleString("en-US")} Medicare beneficiaries`);

  const partners = Math.max(0, f.referralPartners || 0);
  const network = partners > 0 ? Math.min(20, Math.round((20 * Math.log10(1 + partners)) / Math.log10(51))) : 0;
  if (partners > 0) factors.push(`${partners} referral partner${partners === 1 ? "" : "s"}`);

  let engagement = 5;
  if (f.messagesSent > 0) {
    if (f.opened > 0) { engagement += 2; factors.push("Opened past outreach"); }
    if (f.responded > 0) { engagement += 5; factors.push("Responded to past outreach"); }
    if (f.bounced > 0) { engagement -= 5; factors.push("Past outreach bounced"); }
    if (f.opened === 0 && f.responded === 0 && f.bounced === 0) engagement -= 2;
  }
  engagement = Math.max(0, Math.min(10, engagement));

  const known = [f.hasSpecialty, f.hasLocation, f.hasPhone, hasEmail, f.hasCredential].filter(Boolean).length;
  const completeness = Math.round((known / 5) * 10);

  const score = reachability + volume + network + engagement + completeness;

  let strategy: string;
  if (!hasEmail && !f.hasPhone) strategy = "Find contact details first — there is no email or phone on file.";
  else if (hasEmail && f.emailSuppressed && !f.hasPhone) strategy = "Don't email: this address opted out. Reach out by phone or another channel if appropriate.";
  else if (hasEmail && f.emailSuppressed) strategy = "Don't email: this address opted out. Use the phone number on file instead.";
  else if (f.responded > 0) strategy = "Warm lead: follow up personally on the earlier conversation.";
  else if (score >= 70) strategy = "High priority: include in the next campaign and follow up by phone.";
  else if (score >= 45) strategy = "Good fit: add to a nurture campaign.";
  else strategy = "Low priority: enrich the profile before investing outreach time.";

  return { score, components: { reachability, volume, network, engagement, completeness }, factors, strategy };
}
