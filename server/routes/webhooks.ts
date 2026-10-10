import express, { Router, Request, Response } from "express";
import { pool } from "../db";
import { rateLimit } from "../middleware/rateLimit";
import { mapSendgridEvent, verifySendgridSignature } from "../lib/sendgridEvents";
import { advancedStatusSql, foldMessageEvents } from "../functions/outreachHelpers";
import { addSuppression } from "../lib/suppressions";

const router = Router();

// SendGrid Event Webhook. Mounted before express.json() because the signature
// covers the raw body. Configure in SendGrid: Settings → Mail Settings → Event
// Webhook → POST https://<app>/api/webhooks/sendgrid with signing enabled, and
// set SENDGRID_WEBHOOK_PUBLIC_KEY to the verification key it shows.
router.post(
  "/sendgrid",
  rateLimit("sendgrid_webhook", 600, 60_000),
  express.raw({ type: "*/*", limit: "5mb" }),
  async (req: Request, res: Response) => {
    const publicKey = process.env.SENDGRID_WEBHOOK_PUBLIC_KEY;
    if (!publicKey) {
      // Without a key we can't tell real events from forged ones.
      return res.status(503).json({ message: "Event webhook isn't configured (SENDGRID_WEBHOOK_PUBLIC_KEY)." });
    }
    const ok = verifySendgridSignature(
      publicKey,
      req.body as Buffer,
      req.header("X-Twilio-Email-Event-Webhook-Signature"),
      req.header("X-Twilio-Email-Event-Webhook-Timestamp"),
    );
    if (!ok) return res.status(401).json({ message: "Invalid signature" });

    let events: unknown;
    try {
      events = JSON.parse((req.body as Buffer).toString("utf8"));
    } catch {
      return res.status(400).json({ message: "Invalid JSON" });
    }
    if (!Array.isArray(events)) return res.status(400).json({ message: "Expected an array of events" });

    const updates = events.slice(0, 2000)
      .map((raw) => mapSendgridEvent(raw as Record<string, any>))
      .filter((u): u is NonNullable<typeof u> => u !== null);

    // Suppressions: once per address and reason.
    const suppressions = new Map<string, { email: string; reason: NonNullable<(typeof updates)[number]["suppressReason"]> }>();
    for (const u of updates) {
      if (u.suppressReason && u.email) suppressions.set(`${u.email.toLowerCase()}|${u.suppressReason}`, { email: u.email, reason: u.suppressReason });
    }
    for (const { email, reason } of suppressions.values()) {
      try {
        await addSuppression(email, reason, "sendgrid");
      } catch (e: any) {
        console.error("[sendgrid webhook] failed to record suppression:", e?.message);
      }
    }

    // Message updates: one set-based statement for the whole batch. The
    // status rule runs inside it, so it holds under concurrent deliveries.
    const summaries = foldMessageEvents(updates);
    let applied = 0;
    if (summaries.length > 0) {
      try {
        const result = await pool.query(
          `UPDATE outreach_messages m SET
              updated_date = now(),
              opened_at = COALESCE(m.opened_at, e.opened_at),
              clicked_at = COALESCE(m.clicked_at, e.clicked_at),
              bounced_at = COALESCE(m.bounced_at, e.bounced_at),
              status = ${advancedStatusSql("m.status", "e.status")},
              error_message = COALESCE(e.error, m.error_message)
             FROM unnest($1::int[], $2::text[], $3::timestamptz[], $4::timestamptz[], $5::timestamptz[], $6::text[])
               AS e(id, status, opened_at, clicked_at, bounced_at, error)
            WHERE m.id = e.id`,
          [
            summaries.map((s) => s.messageId),
            summaries.map((s) => s.status),
            summaries.map((s) => s.openedAt),
            summaries.map((s) => s.clickedAt),
            summaries.map((s) => s.bouncedAt),
            summaries.map((s) => s.error),
          ],
        );
        applied = result.rowCount ?? 0;
      } catch (e: any) {
        console.error("[sendgrid webhook] failed to apply events:", e?.message);
        return res.status(500).json({ message: "Failed to apply events" });
      }
    }
    res.json({ received: events.length, applied });
  },
);

export default router;
