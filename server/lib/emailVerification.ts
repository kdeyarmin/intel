// Email verification without a paid service: syntax, the domain's DNS (does it
// exist, does it accept mail), and well-known risk patterns. It never contacts
// the mail server, so "valid" means the domain accepts mail, not that the
// mailbox is known to exist.
import dns from "dns";
import { isValidEmailSyntax } from "../functions/emailValidation";

export interface DnsResolver {
  resolveMx(domain: string): Promise<Array<{ exchange: string; priority: number }>>;
  resolve4(domain: string): Promise<string[]>;
  resolve6(domain: string): Promise<string[]>;
}

export interface DomainCheck {
  domain: string;
  /** null when DNS couldn't answer (timeout / server failure). */
  hasMX: boolean | null;
  mxCount: number;
  mxHosts: string[];
  /** RFC 7505 "null MX": the domain explicitly accepts no mail. */
  nullMx: boolean;
  hasAddress: boolean | null;
  nxdomain: boolean;
  error?: string;
}

const NOT_FOUND_CODES = new Set(["ENOTFOUND", "NXDOMAIN"]);
const NO_DATA_CODES = new Set(["ENODATA", "ENOTIMP"]);

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  return Promise.race([
    p,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error("DNS lookup timed out"), { code: "ETIMEOUT" })), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

export async function checkDomain(domain: string, resolver: DnsResolver = dns.promises, timeoutMs = 5000): Promise<DomainCheck> {
  const base: DomainCheck = { domain, hasMX: null, mxCount: 0, mxHosts: [], nullMx: false, hasAddress: null, nxdomain: false };
  try {
    const mx = await withTimeout(resolver.resolveMx(domain), timeoutMs);
    const hosts = mx.sort((a, b) => a.priority - b.priority).map((r) => r.exchange).filter((h) => h && h !== ".");
    if (mx.length > 0 && hosts.length === 0) return { ...base, hasMX: false, nullMx: true };
    if (hosts.length > 0) return { ...base, hasMX: true, mxCount: hosts.length, mxHosts: hosts.slice(0, 5) };
  } catch (e: any) {
    if (NOT_FOUND_CODES.has(e?.code)) return { ...base, hasMX: false, hasAddress: false, nxdomain: true };
    if (!NO_DATA_CODES.has(e?.code)) return { ...base, error: e?.code === "ETIMEOUT" ? "DNS lookup timed out" : `DNS error (${e?.code || "unknown"})` };
  }
  // No MX records: mail falls back to the domain's own address (RFC 5321 §5.1).
  const settle = async (p: Promise<string[]>) => {
    try { return (await withTimeout(p, timeoutMs)).length > 0; } catch (e: any) {
      if (NOT_FOUND_CODES.has(e?.code)) return "nx" as const;
      return NO_DATA_CODES.has(e?.code) ? false : null;
    }
  };
  const [a, aaaa] = await Promise.all([settle(resolver.resolve4(domain)), settle(resolver.resolve6(domain))]);
  if (a === "nx" || aaaa === "nx") return { ...base, hasMX: false, hasAddress: false, nxdomain: true };
  if (a === true || aaaa === true) return { ...base, hasMX: false, hasAddress: true };
  // "No address" needs both families to have answered: one timing out leaves
  // the question open, and that's "couldn't check", not "invalid".
  if (a === null || aaaa === null) return { ...base, hasMX: false, error: "DNS lookup failed" };
  return { ...base, hasMX: false, hasAddress: false };
}

const domainCache = new Map<string, { at: number; check: DomainCheck }>();

/** Test seam: forget cached domain results and the resolver probe. */
export function clearEmailDnsCache() {
  domainCache.clear();
  mxProbe = null;
}
const DOMAIN_TTL_MS = 60 * 60 * 1000;

let mxProbe: { at: number; ok: boolean } | null = null;

/**
 * Some resolvers (locked-down containers, odd corporate DNS) can't answer MX
 * queries at all. Without this probe every domain would look like it has no
 * mail servers; with it, those results come back as "couldn't check".
 */
async function resolverAnswersMx(resolver?: DnsResolver): Promise<boolean> {
  if (mxProbe && Date.now() - mxProbe.at < DOMAIN_TTL_MS) return mxProbe.ok;
  const probe = await checkDomain("gmail.com", resolver);
  mxProbe = { at: Date.now(), ok: probe.hasMX === true };
  return mxProbe.ok;
}

/** checkDomain with a one-hour per-domain cache (failed lookups aren't cached). */
export async function checkDomainCached(domain: string, resolver?: DnsResolver): Promise<DomainCheck> {
  const key = domain.toLowerCase();
  const hit = domainCache.get(key);
  if (hit && Date.now() - hit.at < DOMAIN_TTL_MS) return hit.check;
  let check = await checkDomain(key, resolver);
  if (check.hasMX === false && !check.nxdomain && !check.nullMx && !(await resolverAnswersMx(resolver))) {
    check = { ...check, hasMX: null, error: "This server's DNS can't look up mail (MX) records, so the domain couldn't be checked." };
  }
  if (!check.error) {
    if (domainCache.size > 5000) domainCache.delete(domainCache.keys().next().value as string);
    domainCache.set(key, { at: Date.now(), check });
  }
  return check;
}

export const ROLE_LOCAL_PARTS = new Set([
  "info", "office", "contact", "admin", "frontdesk", "front.desk", "reception", "billing", "support", "sales",
  "hello", "appointments", "scheduling", "marketing", "hr", "careers", "jobs", "team", "mail", "inquiries",
  "referrals", "help", "webmaster", "postmaster",
]);
const NO_REPLY = /^(no-?reply|do-?not-?reply|bounce|mailer-daemon)/i;

export const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com", "temp-mail.org", "yopmail.com",
  "trashmail.com", "sharklasers.com", "getnada.com", "dispostable.com", "maildrop.cc", "throwawaymail.com",
  "fakeinbox.com", "mintemail.com", "mohmal.com", "emailondeck.com",
]);

export const FREEMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "hotmail.com", "outlook.com", "live.com", "msn.com", "aol.com",
  "icloud.com", "me.com", "mac.com", "protonmail.com", "proton.me", "comcast.net", "att.net", "verizon.net",
  "sbcglobal.net", "ymail.com", "gmx.com", "zoho.com",
]);

export type EmailStatus = "valid" | "risky" | "invalid" | "unknown";

export interface EmailScore {
  status: EmailStatus;
  score: number | null;
  confidence: "high" | "medium" | "low";
  reasons: string[];
  riskFlags: string[];
  recommendation: string;
}

/** Combine syntax, DNS and pattern checks into a status and 0–100 score. */
export function scoreEmail(email: string, dnsCheck: DomainCheck | null, suppression?: string | null): EmailScore {
  const e = String(email || "").trim().toLowerCase();
  if (!isValidEmailSyntax(e)) {
    return { status: "invalid", score: 0, confidence: "high", reasons: ["Not a valid email address format."], riskFlags: ["bad_syntax"], recommendation: "Find a correct address before reaching out." };
  }
  if (suppression === "bounced") {
    return { status: "invalid", score: 5, confidence: "high", reasons: ["An earlier email to this address bounced."], riskFlags: ["bounced"], recommendation: "Don't use this address; find a new one." };
  }
  const [local, domain] = e.split("@");

  if (DISPOSABLE_DOMAINS.has(domain)) {
    return { status: "invalid", score: 5, confidence: "high", reasons: ["Disposable (throwaway) email domain."], riskFlags: ["disposable"], recommendation: "Don't use; disposable inboxes expire." };
  }
  if (NO_REPLY.test(local)) {
    return { status: "invalid", score: 10, confidence: "high", reasons: ["A no-reply address doesn't receive mail."], riskFlags: ["no_reply"], recommendation: "Find a monitored address for this provider." };
  }
  if (!dnsCheck || dnsCheck.error) {
    return { status: "unknown", score: null, confidence: "low", reasons: [dnsCheck?.error || "The domain couldn't be checked."], riskFlags: [], recommendation: "Try again later." };
  }
  if (dnsCheck.nxdomain) {
    return { status: "invalid", score: 0, confidence: "high", reasons: [`The domain ${domain} doesn't exist.`], riskFlags: ["no_domain"], recommendation: "The address is wrong; find a new one." };
  }
  if (dnsCheck.nullMx) {
    return { status: "invalid", score: 0, confidence: "high", reasons: [`${domain} is set up not to accept any email.`], riskFlags: ["null_mx"], recommendation: "The address can't receive mail; find a new one." };
  }

  const reasons: string[] = [];
  const riskFlags: string[] = [];
  let score: number;
  if (dnsCheck.hasMX) {
    score = 85;
    reasons.push(`${domain} accepts email (${dnsCheck.mxCount} mail server${dnsCheck.mxCount === 1 ? "" : "s"}).`);
  } else if (dnsCheck.hasAddress) {
    score = 45;
    reasons.push(`${domain} has no mail (MX) records; delivery relies on a fallback and often fails.`);
    riskFlags.push("no_mx");
  } else {
    return { status: "invalid", score: 5, confidence: "high", reasons: [`${domain} has no mail servers.`], riskFlags: ["no_mx"], recommendation: "The address can't receive mail; find a new one." };
  }

  if (ROLE_LOCAL_PARTS.has(local)) {
    score -= 10;
    reasons.push("Shared mailbox (like info@ or office@); it reaches the practice, not a specific person.");
    riskFlags.push("role_account");
  }
  if (FREEMAIL_DOMAINS.has(domain)) {
    score -= 5;
    reasons.push("Personal mailbox at a free email provider.");
    riskFlags.push("free_email");
  }
  // Reasons come from email_suppressions (see sendgridEvents.ts); anything
  // other than a spam complaint is an opt-out (unsubscribe link or SendGrid).
  const spamComplaint = suppression === "spam_report";
  if (spamComplaint) {
    reasons.push("The recipient marked an earlier email as spam.");
    riskFlags.push("spam_complaint");
  } else if (suppression) {
    reasons.push("This address opted out of outreach emails.");
    riskFlags.push("opted_out");
  }

  const status: EmailStatus = score >= 70 ? "valid" : score >= 40 ? "risky" : "invalid";
  const recommendation = spamComplaint
    ? "Don't email: the recipient reported an earlier email as spam."
    : suppression
      ? "Don't email: the recipient opted out."
      : status === "valid"
        ? riskFlags.includes("role_account") ? "OK to use; address it to the practice." : "OK to use."
        : "Use with care; look for a better address if this one bounces.";
  // DNS can't confirm the mailbox itself, so a "valid" result is medium confidence.
  return { status, score, confidence: status === "valid" ? "medium" : "low", reasons, riskFlags, recommendation };
}
