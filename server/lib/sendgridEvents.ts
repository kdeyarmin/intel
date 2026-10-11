// SendGrid Event Webhook: signature verification + event → message update
// mapping. Pure so both can be unit-tested.
import crypto from "crypto";

/**
 * SendGrid signs (timestamp + raw body) with ECDSA P-256 / SHA-256. The public
 * key from the SendGrid console is base64 DER (SPKI); the signature is base64.
 */
export function verifySendgridSignature(
  publicKeyBase64: string,
  rawBody: Buffer | string,
  signatureBase64: string | undefined,
  timestamp: string | undefined,
): boolean {
  if (!publicKeyBase64 || !signatureBase64 || !timestamp) return false;
  try {
    const key = crypto.createPublicKey({ key: Buffer.from(publicKeyBase64, "base64"), format: "der", type: "spki" });
    const payload = Buffer.concat([Buffer.from(timestamp, "utf8"), Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, "utf8")]);
    return crypto.verify("sha256", payload, { key, dsaEncoding: "der" }, Buffer.from(signatureBase64, "base64"));
  } catch {
    return false;
  }
}

export interface EventUpdate {
  /** Our outreach_messages id (campaign sends only); null for direct sends. */
  messageId: number | null;
  status: "delivered" | "opened" | "clicked" | "bounced" | null;
  /** outreach_messages timestamp column to set (first occurrence wins). */
  timestampColumn: "opened_at" | "clicked_at" | "bounced_at" | null;
  at: Date;
  email: string | null;
  suppressReason: "bounced" | "spam_report" | "unsubscribed" | null;
  error: string | null;
}

export function mapSendgridEvent(event: Record<string, any>): EventUpdate | null {
  const update = mapEvent(event);
  // Without our message id (a direct send, not a campaign) there's no message
  // to update, but a bounce, spam report or unsubscribe still suppresses the address.
  if (!update || (update.messageId === null && !(update.suppressReason && update.email))) return null;
  return update;
}

function mapEvent(event: Record<string, any>): EventUpdate | null {
  if (!event || typeof event !== "object") return null;
  const id = Number(event.message_id);
  const messageId = Number.isInteger(id) && id > 0 ? id : null;
  const at = event.timestamp ? new Date(Number(event.timestamp) * 1000) : new Date();
  const email = typeof event.email === "string" ? event.email : null;
  const base = { messageId, at, email, status: null, timestampColumn: null, suppressReason: null, error: null } as EventUpdate;
  switch (event.event) {
    case "delivered":
      return { ...base, status: "delivered" };
    case "open":
      return { ...base, status: "opened", timestampColumn: "opened_at" };
    case "click":
      return { ...base, status: "clicked", timestampColumn: "clicked_at" };
    case "bounce":
    case "dropped":
      return {
        ...base,
        status: "bounced",
        timestampColumn: "bounced_at",
        suppressReason: "bounced",
        error: String(event.reason || event.response || event.event).slice(0, 500),
      };
    case "spamreport":
      return { ...base, suppressReason: "spam_report" };
    case "unsubscribe":
    case "group_unsubscribe":
      return { ...base, suppressReason: "unsubscribed" };
    default:
      return null;
  }
}
