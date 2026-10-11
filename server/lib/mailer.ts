import sgMail from "@sendgrid/mail";

// Single place that talks to SendGrid. Used by the /email/send integration and
// by campaign sending (server/functions/outreach.ts).

export interface MailerStatus {
  configured: boolean;
  missing: string[];
}

export function getMailerStatus(): MailerStatus {
  const missing = process.env.SENDGRID_API_KEY ? [] : ["SENDGRID_API_KEY"];
  return { configured: missing.length === 0, missing };
}

// Sender addresses the app is permitted to send from. Configured via
// SENDGRID_FROM_EMAIL (primary) and an optional comma-separated ALLOWED_FROM_EMAILS.
// A caller-supplied `from` is honoured only if it is on this list — otherwise we
// fall back to the configured default. This stops the endpoint being used as an
// open spoofing/spam relay through the app's SendGrid account.
export function allowedFromAddresses(): string[] {
  const list = [
    process.env.SENDGRID_FROM_EMAIL,
    ...(process.env.ALLOWED_FROM_EMAILS || "").split(","),
  ]
    .map((s) => (s || "").trim().toLowerCase())
    .filter(Boolean);
  return list.length > 0 ? list : ["noreply@caremetric.com"];
}

export function resolveFrom(requested?: string): string {
  const allowed = allowedFromAddresses();
  if (requested && allowed.includes(requested.trim().toLowerCase())) return requested.trim();
  return allowed[0];
}

export interface MailMessage {
  to: string;
  from?: string;
  fromName?: string;
  subject: string;
  text: string;
  html?: string;
  /** Echoed back on SendGrid event webhooks (e.g. { message_id: "42" }). */
  customArgs?: Record<string, string>;
  headers?: Record<string, string>;
}

export class MailerNotConfiguredError extends Error {
  constructor(public missing: string[]) {
    super(`Email sending isn't configured (missing ${missing.join(", ")}).`);
    this.name = "MailerNotConfiguredError";
  }
}

export async function sendMail(msg: MailMessage): Promise<{ messageId: string | null }> {
  const status = getMailerStatus();
  if (!status.configured) throw new MailerNotConfiguredError(status.missing);
  sgMail.setApiKey(process.env.SENDGRID_API_KEY as string);
  const from = resolveFrom(msg.from);
  const [response] = await sgMail.send({
    to: msg.to,
    from: msg.fromName ? { email: from, name: msg.fromName } : from,
    subject: msg.subject,
    text: msg.text,
    html: msg.html || msg.text,
    customArgs: msg.customArgs,
    headers: msg.headers,
  });
  const messageId = (response?.headers as Record<string, string> | undefined)?.["x-message-id"] ?? null;
  return { messageId };
}
