import express, { Router, Request, Response } from "express";
import { pool } from "../db";
import { rateLimit } from "../middleware/rateLimit";
import { mapSendgridEvent, verifySendgridSignature } from "../lib/sendgridEvents";
import { shouldAdvanceStatus } from "../functions/outreachHelpers";
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

    let applied = 0;
    for (const raw of events.slice(0, 2000)) {
      const update = mapSendgridEvent(raw as Record<string, any>);
      if (!update) continue;
      try {
        if (update.suppressReason && update.email) {
          await addSuppression(update.email, update.suppressReason, "sendgrid");
        }
        const { rows } = await pool.query("SELECT status FROM outreach_messages WHERE id = $1", [update.messageId]);
        if (!rows[0]) continue;
        const sets: string[] = ["updated_date = now()"];
        const values: unknown[] = [update.messageId];
        if (update.timestampColumn) {
          values.push(update.at);
          sets.push(`${update.timestampColumn} = COALESCE(${update.timestampColumn}, $${values.length})`);
        }
        if (update.status && shouldAdvanceStatus(rows[0].status, update.status)) {
          values.push(update.status);
          sets.push(`status = $${values.length}`);
        }
        if (update.error) {
          values.push(update.error);
          sets.push(`error_message = $${values.length}`);
        }
        await pool.query(`UPDATE outreach_messages SET ${sets.join(", ")} WHERE id = $1`, values);
        applied += 1;
      } catch (e: any) {
        console.error("[sendgrid webhook] failed to apply event:", e?.message);
      }
    }
    res.json({ received: events.length, applied });
  },
);

export default router;
