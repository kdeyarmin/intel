// POST /api/audit: lets the browser record its own actions (exports, imports,
// scoring runs) without write access to the admin-only AuditEvent entity. The
// server stamps who did it and from where; the client can't choose either.
import { Router, Response } from "express";
import { CLIENT_AUDIT_EVENTS, recordAudit, sanitizeClientDetails, type AuditWriter } from "../lib/audit";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { clientIp, rateLimit } from "../middleware/rateLimit";

export function createAuditRouter(write: AuditWriter = recordAudit) {
  const router = Router();
  router.post("/", authMiddleware, rateLimit("audit", 60, 60_000), async (req: AuthRequest, res: Response) => {
    const eventType = req.body?.event_type;
    if (typeof eventType !== "string" || !CLIENT_AUDIT_EVENTS.has(eventType)) {
      return res.status(400).json({ message: "Unknown audit event type" });
    }
    const details = sanitizeClientDetails(req.body?.details);
    await write({
      event_type: eventType,
      user_email: req.user!.email,
      action: typeof details.action === "string" ? details.action.slice(0, 50) : undefined,
      entity_type: typeof details.entity === "string" ? details.entity.slice(0, 100) : undefined,
      details,
      ip_address: clientIp(req),
    });
    res.status(201).json({ success: true });
  });
  return router;
}
