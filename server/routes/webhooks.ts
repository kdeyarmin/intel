import express, { Router, Request, Response } from "express";
import { pool } from "../db";
import { rateLimit } from "../middleware/rateLimit";
import { mapSendgridEvent, verifySendgridSignature } from "../lib/sendgridEvents";
import { advancedStatusSql, foldMessageEvents } from "../functions/outreachHelpers";
import { addSuppressions } from "../lib/suppressions";

const router = Router();

/** Emails the active admins about an organization that now pays for two subscriptions. Never throws. */
async function tellAdminsOfDuplicate(orgId: number, duplicate: { kept: string; previous: string }): Promise<void> {
  try {
    const [{ notifyDuplicateSubscription }, { defaultAccountDeps }] = await Promise.all([import("../lib/billingNotices"), import("../lib/accountDeps")]);
    const { rows } = await pool.query("SELECT name FROM organizations WHERE id = $1", [orgId]);
    await notifyDuplicateSubscription(defaultAccountDeps(pool), { id: orgId, name: rows[0]?.name ?? `organization ${orgId}` }, duplicate);
  } catch (e: any) {
    console.warn("[stripe webhook] couldn't notify the admins of a duplicate subscription:", e?.message || e);
  }
}

// Stripe webhook (subscriptions for organizations). Configure the endpoint in
// Stripe as POST https://<app>/api/webhooks/stripe and set
// STRIPE_WEBHOOK_SECRET to its signing secret. The signature covers the raw
// body, so this is mounted before express.json() too.
router.post(
  "/stripe",
  rateLimit("stripe_webhook", 600, 60_000),
  express.raw({ type: "*/*", limit: "2mb" }),
  async (req: Request, res: Response) => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    const key = process.env.STRIPE_SECRET_KEY;
    if (!secret || !key) return res.status(503).json({ message: "Stripe webhook isn't configured (STRIPE_WEBHOOK_SECRET)." });
    let event: any;
    let stripe: any;
    try {
      const { default: Stripe } = await import("stripe");
      stripe = new Stripe(key);
      event = stripe.webhooks.constructEvent(req.body as Buffer, req.header("stripe-signature") ?? "", secret);
    } catch (e: any) {
      return res.status(400).json({ message: `Invalid Stripe signature: ${String(e?.message || e).slice(0, 120)}` });
    }
    try {
      const [{ applyStripeEvent }, { recordAudit }] = await Promise.all([import("../lib/billing"), import("../lib/audit")]);
      // Events stamped to the same second can't be ordered by their time: the subscription is then read from Stripe.
      const result = await applyStripeEvent(event, pool, console, { audit: recordAudit, fetchSubscription: (id) => stripe.subscriptions.retrieve(id) });
      if (result.handled && result.org_id) {
        const { publishSessionUserChange } = await import("../lib/sessionUsers");
        const { rows } = await pool.query("SELECT user_id FROM organization_members WHERE org_id = $1", [result.org_id]);
        for (const r of rows) publishSessionUserChange(Number(r.user_id));
      }
      // Who was approved is for the audit trail, not for Stripe's copy of the response.
      const { approved: _approved, ...outcome } = result;
      res.json({ received: true, ...outcome });
      // A second live subscription means the customer is being charged twice. The admins hear of it after Stripe has
      // its answer, so a slow or broken mail provider can't delay or fail the acknowledgement.
      if (result.duplicate_subscription && result.org_id) void tellAdminsOfDuplicate(result.org_id, result.duplicate_subscription);
    } catch (e: any) {
      console.error("[stripe webhook] failed:", e?.message || e);
      res.status(500).json({ message: "Failed to apply the event" });
    }
  },
);

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

    // Suppressions (bounces, spam reports, unsubscribes) in one statement. If
    // it fails, answer 5xx so SendGrid retries the batch: a dropped
    // suppression means the address could be emailed again. Re-applying the
    // message updates on a retry is harmless (they only move forward).
    const suppressions = updates
      .filter((u) => u.suppressReason && u.email)
      .map((u) => ({ email: u.email as string, reason: u.suppressReason as string }));
    try {
      await addSuppressions(suppressions, "sendgrid");
    } catch (e: any) {
      console.error("[sendgrid webhook] failed to record suppressions:", e?.message);
      return res.status(500).json({ message: "Failed to record suppressions" });
    }

    // Message updates: one set-based statement for the whole batch. The
    // status rule runs inside it, so it holds under concurrent deliveries.
    const summaries = foldMessageEvents(
      updates.filter((u): u is typeof u & { messageId: number } => u.messageId !== null),
    );
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
