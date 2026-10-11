// Server-side audit trail (the audit_events table / AuditEvent entity).
// Writes are best-effort: a failed audit insert is logged, never surfaced to
// the user, and never undoes the action being audited.
import { db } from "../db";
import { auditEvents } from "../db/schema";

export interface AuditEntry {
  event_type: string;
  user_email: string | null;
  action?: string;
  entity_type?: string;
  entity_id?: string | number | null;
  details?: Record<string, unknown>;
  ip_address?: string | null;
  /** The organization the event belongs to (its owners see it on Security Audit). */
  org_id?: number | null;
}

export type AuditWriter = (entry: AuditEntry) => Promise<void>;

export const recordAudit: AuditWriter = async (entry) => {
  try {
    await db.insert(auditEvents).values({
      event_type: entry.event_type,
      user_email: entry.user_email ?? "anonymous",
      action: entry.action ?? null,
      entity_type: entry.entity_type ?? null,
      entity_id: entry.entity_id == null ? null : String(entry.entity_id),
      details: entry.details ?? {},
      ip_address: entry.ip_address?.slice(0, 50) ?? null,
    });
  } catch (e: any) {
    console.warn(`[audit] Failed to record ${entry.event_type}:`, e?.message || e);
  }
};

// Account events written by the server. Clients can't write these through
// POST /api/audit (see CLIENT_AUDIT_EVENTS).
export const ACCOUNT_EVENT = "account";

// Events the browser may record (it can't write the AuditEvent entity
// directly; that is admin-only). The server stamps who and from where.
export const CLIENT_AUDIT_EVENTS: ReadonlySet<string> = new Set(["import", "user_action", "scoring_run", "export"]);

/** Keeps client-supplied details small and JSON-plain. */
export function sanitizeClientDetails(details: unknown): Record<string, unknown> {
  if (!details || typeof details !== "object" || Array.isArray(details)) return {};
  let json: string;
  try {
    json = JSON.stringify(details);
  } catch {
    return {};
  }
  if (json.length > 8_000) {
    const action = (details as any).action;
    return { truncated: true, action: typeof action === "string" ? action.slice(0, 200) : null };
  }
  return JSON.parse(json);
}
