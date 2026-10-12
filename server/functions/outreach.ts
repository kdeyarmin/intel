// Campaign outreach: turn a campaign + lead list into personalised messages,
// send them through SendGrid, and roll delivery events up into metrics.
// Sending is for an organization's owners (these functions are not in
// PUBLIC_FUNCTIONS), and every campaign id is checked against the caller's
// organization: another organization's campaign answers 404.
import crypto from "crypto";
import { pool } from "../db";
import { inSequence } from "../lib/pgSequence";
import { getMailerStatus, sendMail } from "../lib/mailer";
import { consumeQuota } from "../lib/orgQuota";
import { recordAudit } from "../lib/audit";
import { assertBillableOrg } from "../lib/entitlements";
import { isPlatformAdmin } from "../lib/roles";
import { addSuppression, isSuppressed, loadSuppressed, normalizeEmail } from "../lib/suppressions";
import { CLAUDE_MODELS } from "../lib/aiModels";
import {
  appendComplianceFooter,
  buildCampaignMetrics,
  buildMergeVars,
  buildUnsubscribeToken,
  classifyRecipient,
  computeOutreachScore,
  isRetryableSendError,
  renderTemplate,
  sendErrorReason,
  textToHtml,
  verifyUnsubscribeToken,
  type MessageCounts,
  type RecipientStatus,
} from "./outreachHelpers";

const MAX_RECIPIENTS = 5000;
const SEND_CONCURRENCY = 5;
const STUCK_SENDING_MINUTES = 15;

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function notConfigured(error: string, missing: string[], extra: Record<string, unknown> = {}) {
  return { success: false as const, notConfigured: true as const, missing, error, ...extra };
}

/** Secret for signing unsubscribe links; stable across restarts in production (JWT_SECRET is required there). */
export function unsubscribeSecret(): string {
  const base = process.env.UNSUBSCRIBE_SECRET || process.env.JWT_SECRET || "caremetric-dev-unsubscribe";
  return crypto.createHmac("sha256", base).update("outreach-unsubscribe").digest("hex");
}

/** What's still needed (besides the email API key) before mail can legally go out. */
export function sendingRequirements(): string[] {
  const missing = [...getMailerStatus().missing];
  if (!process.env.OUTREACH_PHYSICAL_ADDRESS) missing.push("OUTREACH_PHYSICAL_ADDRESS");
  if (!process.env.PUBLIC_APP_URL) missing.push("PUBLIC_APP_URL");
  return missing;
}

export function unsubscribeUrl(email: string): string {
  const base = (process.env.PUBLIC_APP_URL || "").replace(/\/+$/, "");
  return `${base}/api/public/unsubscribe?t=${encodeURIComponent(buildUnsubscribeToken(email, unsubscribeSecret()))}`;
}

/**
 * The postal-address/unsubscribe footer and one-click unsubscribe headers that
 * every outreach email carries (campaigns and direct sends). Call only once
 * sendingRequirements() is empty.
 */
export function withComplianceFooter(recipient: string, body: { text: string; html: string }) {
  const unsubscribe = unsubscribeUrl(normalizeEmail(recipient));
  const { text, html } = appendComplianceFooter(body, {
    physicalAddress: process.env.OUTREACH_PHYSICAL_ADDRESS as string,
    unsubscribeUrl: unsubscribe,
  });
  return {
    text,
    html,
    headers: {
      "List-Unsubscribe": `<${unsubscribe}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
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

/** The signed-in caller, as the dispatcher passes it (req.user). */
export interface Caller {
  email?: string;
  role?: string;
  orgId?: number | null;
  orgRole?: string | null;
  isPlatformAdmin?: boolean;
}

/** The organization a caller's campaign work is limited to; an account in none can't touch campaigns. */
function orgOf(user: Caller | undefined): number {
  if (user?.orgId == null) throw new HttpError(403, "Your account isn't part of an organization yet.");
  return user.orgId;
}

/**
 * The caller's organization must be billable before cost-incurring work. The
 * functions dispatcher gates this too; the check lives here as well so the
 * handler is safe however it is invoked.
 */
async function assertBillableCallerOrg(user: Caller | undefined): Promise<void> {
  const orgId = orgOf(user);
  const { rows } = await pool.query("SELECT status FROM organizations WHERE id = $1", [orgId]);
  assertBillableOrg(rows[0] ? { status: rows[0].status } : undefined);
}

/**
 * The campaign, which must belong to the caller's organization: a campaign id
 * from another organization answers 404, exactly like one that doesn't exist.
 * (Platform administrators work in their own organization like everyone else.)
 */
async function loadCampaign(client: any, campaignId: number, user: Caller | undefined, { forUpdate = false } = {}) {
  const { rows } = await client.query(
    `SELECT * FROM outreach_campaigns WHERE id = $1 AND org_id = $2${forUpdate ? " FOR UPDATE" : ""}`, [campaignId, orgOf(user)]);
  if (!rows[0]) throw new HttpError(404, "Campaign not found");
  return rows[0];
}

const chunk = <T,>(arr: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, (i + 1) * size));

// ─── Prepare ─────────────────────────────────────────────────────────────────

export async function handlePrepareCampaignMessages(payload: any, user?: Caller) {
  const campaignId = Number(payload?.campaign_id);
  if (!Number.isInteger(campaignId)) throw new HttpError(400, "campaign_id is required");

  return withClient("30s", async (client) => {
    // The row lock serialises concurrent prepares (e.g. two admins pressing
    // Send at once): the second one sees the first one's messages and adds none.
    await client.query("BEGIN");
    try {
      const result = await prepareLocked(client, campaignId, user);
      await client.query("COMMIT");
      // Best-effort and never throws, so auditing after the commit can't undo the prepare.
      await recordAudit({
        event_type: "campaign",
        user_email: user?.email ?? null,
        action: "prepare_campaign_messages",
        entity_type: "outreach_campaign",
        entity_id: campaignId,
        details: {
          messages_created: result.results.messages_created,
          total_recipients: result.results.total_recipients,
          skipped: result.results.skipped,
        },
        org_id: orgOf(user),
      });
      return result;
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    }
  });
}

async function prepareLocked(client: any, campaignId: number, user: Caller | undefined) {
  const campaign = await loadCampaign(client, campaignId, user, { forUpdate: true });
  if (!campaign.subject || !campaign.body) {
    throw new HttpError(400, "Add a subject and message before preparing this campaign.");
  }

  let npis: string[] = [];
  if (campaign.target_list_id) {
    // The list must be the campaign's own organization's. target_list_id is an ordinary column an owner can
    // set to any number, and reading another organization's list would copy its members, their emails
    // included, into this organization's messages: an id from another organization answers 404, like one
    // that doesn't exist.
    const { rows: [ownList] } = await client.query("SELECT id FROM lead_lists WHERE id = $1 AND org_id = $2", [campaign.target_list_id, campaign.org_id]);
    if (!ownList) throw new HttpError(404, "Lead list not found. Choose one of your organization's lead lists for this campaign.");
    // One over the cap, to tell "exactly the cap" from "too many".
    const { rows } = await client.query(
      "SELECT DISTINCT npi FROM lead_list_members WHERE list_id = $1 AND npi IS NOT NULL LIMIT $2",
      [campaign.target_list_id, MAX_RECIPIENTS + 1],
    );
    npis = rows.map((r: any) => r.npi);
  } else if (Array.isArray(campaign.target_npis)) {
    npis = [...new Set<string>(campaign.target_npis.map(String))];
  }
  // Refuse rather than silently send to an arbitrary part of the list.
  if (npis.length > MAX_RECIPIENTS) {
    throw new HttpError(
      400,
      `This campaign targets more than ${MAX_RECIPIENTS.toLocaleString()} providers. Split the lead list into smaller lists and send a campaign to each.`,
    );
  }
  if (npis.length === 0) {
    throw new HttpError(400, "This campaign has no recipients. Choose a lead list with providers in it.");
  }

  const { rows: existingRows } = await client.query(
    "SELECT npi, lower(recipient_email) AS email FROM outreach_messages WHERE campaign_id = $1",
    [campaignId],
  );
  const alreadyQueued = new Set<string>(existingRows.map((r: any) => r.npi));
  const seenEmails = new Set<string>(existingRows.map((r: any) => r.email).filter(Boolean));

  const toFetch = npis.filter((n) => !alreadyQueued.has(n));
  const providers: any[] = [];
  const taxonomyByNpi = new Map<string, any>();
  const locationByNpi = new Map<string, any>();
  for (const part of chunk(toFetch, 1000)) {
    const [p, t, l] = await inSequence([
      () => client.query(
        "SELECT npi, entity_type, first_name, last_name, organization_name, credential, status, email, email_validation_status FROM providers WHERE npi = ANY($1)",
        [part],
      ),
      () => client.query(
        "SELECT npi, taxonomy_description, is_primary FROM provider_taxonomies WHERE npi = ANY($1)",
        [part],
      ),
      () => client.query(
        "SELECT npi, city, state, location_type FROM provider_locations WHERE npi = ANY($1)",
        [part],
      ),
    ]);
    providers.push(...p.rows);
    for (const row of t.rows) {
      const cur = taxonomyByNpi.get(row.npi);
      if (!cur || (row.is_primary && !cur.is_primary)) taxonomyByNpi.set(row.npi, row);
    }
    for (const row of l.rows) {
      const cur = locationByNpi.get(row.npi);
      if (!cur || (row.location_type === "Practice" && cur.location_type !== "Practice")) locationByNpi.set(row.npi, row);
    }
  }

  const suppressed = await loadSuppressed(providers.map((p) => p.email).filter(Boolean));
  const skipped: Record<Exclude<RecipientStatus, "ok"> | "not_found", number> = {
    not_found: toFetch.length - providers.length,
    no_email: 0,
    invalid_email: 0,
    suppressed: 0,
    duplicate: npis.length - toFetch.length,
  };
  const rows: any[] = [];
  for (const provider of providers) {
    const status = classifyRecipient(provider, suppressed, seenEmails);
    if (status !== "ok") {
      skipped[status] += 1;
      continue;
    }
    const vars = buildMergeVars(provider, taxonomyByNpi.get(provider.npi), locationByNpi.get(provider.npi));
    rows.push({
      npi: provider.npi,
      email: provider.email.trim(),
      name: vars.provider_name || null,
      subject: renderTemplate(campaign.subject, vars),
      body: renderTemplate(campaign.body, vars),
    });
  }

  for (const part of chunk(rows, 500)) {
    const values: any[] = [];
    const tuples = part.map((r, i) => {
      values.push(campaignId, campaign.org_id, r.npi, r.email, r.name, r.subject, r.body);
      const o = i * 7;
      return `($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5}, $${o + 6}, $${o + 7}, 'pending')`;
    });
    await client.query(
      `INSERT INTO outreach_messages (campaign_id, org_id, npi, recipient_email, recipient_name, subject, body, status) VALUES ${tuples.join(", ")}`,
      values,
    );
  }

  const { rows: [{ count }] } = await client.query(
    "SELECT count(*)::int AS count FROM outreach_messages WHERE campaign_id = $1",
    [campaignId],
  );
  const nextStatus = campaign.status === "draft" || !campaign.status ? "ready" : campaign.status;
  await client.query(
    "UPDATE outreach_campaigns SET total_recipients = $2, status = $3, updated_date = now() WHERE id = $1",
    [campaignId, count, nextStatus],
  );

  return {
    success: true,
    results: { messages_created: rows.length, total_recipients: count, skipped },
    campaign_status: nextStatus,
  };
}

// ─── Send ────────────────────────────────────────────────────────────────────

async function mapWithConcurrency<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const item = items[i++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}

export async function handleSendCampaignMessages(payload: any, user?: Caller) {
  // Sending email costs money: a past_due or canceled organization may not send.
  await assertBillableCallerOrg(user);
  const campaignId = Number(payload?.campaign_id);
  if (!Number.isInteger(campaignId)) throw new HttpError(400, "campaign_id is required");
  const batchSize = Math.min(Math.max(Number(payload?.batch_size) || 50, 1), 100);

  const prepared = await withClient("15s", async (client) => {
    const campaign = await loadCampaign(client, campaignId, user);
    // The list may have been deleted after the messages were prepared, and
    // sending never re-checked it: stop here instead of sending to a list
    // that no longer exists.
    if (campaign.target_list_id) {
      const { rows: [list] } = await client.query(
        "SELECT id FROM lead_lists WHERE id = $1 AND org_id = $2",
        [campaign.target_list_id, campaign.org_id],
      );
      if (!list) throw new HttpError(404, "The lead list this campaign targets was deleted. Choose one of your organization's lead lists before sending.");
    }
    const { rows: [{ count }] } = await client.query(
      "SELECT count(*)::int AS count FROM outreach_messages WHERE campaign_id = $1", [campaignId]);
    // Preparation never queues more than the cap; refuse a queue that does.
    if (count > MAX_RECIPIENTS) {
      throw new HttpError(
        400,
        `This campaign has more than ${MAX_RECIPIENTS.toLocaleString()} queued messages, so it won't be sent. Create a new campaign for a smaller lead list.`,
      );
    }
    return count > 0;
  });
  // First send on a new campaign builds the message list.
  const preparation = prepared ? null : await handlePrepareCampaignMessages({ campaign_id: campaignId }, user);

  const missing = sendingRequirements();
  if (missing.length > 0) {
    return notConfigured(
      `Email sending isn't configured yet (missing ${missing.join(", ")}). Messages are prepared and will go out once it is.`,
      missing,
      { results: preparation?.results },
    );
  }

  const claimed: any[] = await withClient("15s", async (client) => {
    // Never resend a message whose send was interrupted — its delivery is unknown.
    await client.query(
      `UPDATE outreach_messages SET status = 'failed', error_message = 'Delivery status unknown (sending was interrupted)', updated_date = now()
        WHERE campaign_id = $1 AND status = 'sending' AND updated_date < now() - interval '${STUCK_SENDING_MINUTES} minutes'`,
      [campaignId],
    );
    const { rows } = await client.query(
      `UPDATE outreach_messages SET status = 'sending', updated_date = now()
        WHERE id IN (SELECT id FROM outreach_messages WHERE campaign_id = $1 AND status = 'pending'
                      ORDER BY id LIMIT $2 FOR UPDATE SKIP LOCKED)
        RETURNING id, npi, recipient_email, subject, body`,
      [campaignId, batchSize],
    );
    await client.query(
      "UPDATE outreach_campaigns SET status = 'sending', start_date = COALESCE(start_date, now()), updated_date = now() WHERE id = $1",
      [campaignId],
    );
    return rows;
  });

  // Claimed messages that were never handed to SendGrid go back in the queue.
  const requeueUnsent = () => pool.query(
    "UPDATE outreach_messages SET status = 'pending', updated_date = now() WHERE id = ANY($1::int[]) AND status = 'sending'",
    [claimed.map((m) => m.id)],
  );

  // Someone may have unsubscribed since the list was prepared. If this check
  // fails, nothing has been sent yet, so requeue rather than leave the batch
  // stuck in 'sending' (which later counts as failed).
  let suppressed: Set<string>;
  try {
    suppressed = await loadSuppressed(claimed.map((m) => m.recipient_email));
  } catch (e) {
    await requeueUnsent().catch((err: any) => console.error("[sendCampaignMessages] requeue failed:", err?.message));
    throw e;
  }
  // The organization's daily email allowance covers the whole batch; over it,
  // nothing is sent and the batch goes back in the queue.
  try {
    await consumeQuota(user as any, "emails_sent", claimed.length);
  } catch (e) {
    await requeueUnsent().catch((err: any) => console.error("[sendCampaignMessages] requeue failed:", err?.message));
    throw e;
  }
  const outcome = { sent: 0, failed: 0, suppressed: 0 };
  let rejected: string | null = null;

  await mapWithConcurrency(claimed, SEND_CONCURRENCY, async (message) => {
    if (rejected) return; // left in 'sending' and requeued below
    const email = normalizeEmail(message.recipient_email);
    if (suppressed.has(email)) {
      outcome.suppressed += 1;
      await pool.query("UPDATE outreach_messages SET status = 'suppressed', updated_date = now() WHERE id = $1", [message.id]);
      return;
    }
    const { text, html, headers } = withComplianceFooter(
      email,
      { text: message.body || "", html: textToHtml(message.body || "") },
    );
    try {
      const { messageId } = await sendMail({
        to: message.recipient_email,
        subject: message.subject || "",
        text,
        html,
        customArgs: { message_id: String(message.id), campaign_id: String(campaignId) },
        headers,
      });
      outcome.sent += 1;
      await pool.query(
        "UPDATE outreach_messages SET status = 'sent', sent_at = now(), provider_message_id = $2, error_message = NULL, updated_date = now() WHERE id = $1",
        [message.id, messageId],
      );
    } catch (e: any) {
      if (isRetryableSendError(e)) {
        rejected = rejected || sendErrorReason(e);
        return;
      }
      outcome.failed += 1;
      await pool.query(
        "UPDATE outreach_messages SET status = 'failed', error_message = $2, updated_date = now() WHERE id = $1",
        [message.id, sendErrorReason(e)],
      );
    }
  });

  if (rejected) {
    // SendGrid refused the request itself, so these were never sent: requeue them.
    await requeueUnsent();
  }

  // One statement, so a concurrent request that found nothing to send can't
  // overwrite "completed" with a stale "sending".
  const { remaining, status } = await withClient("15s", async (client) => {
    const { rows: [row] } = await client.query(
      `WITH r AS (SELECT count(*)::int AS remaining FROM outreach_messages
                   WHERE campaign_id = $1 AND status IN ('pending', 'sending'))
       UPDATE outreach_campaigns c
          SET status = CASE WHEN r.remaining > 0 THEN 'sending' ELSE 'completed' END,
              end_date = CASE WHEN r.remaining > 0 THEN c.end_date ELSE COALESCE(c.end_date, now()) END,
              created_by = COALESCE(c.created_by, $2), updated_date = now()
         FROM r WHERE c.id = $1
       RETURNING r.remaining, c.status`,
      [campaignId, user?.email || null],
    );
    return row;
  });

  const results = { ...outcome, remaining, messages_created: preparation?.results.messages_created ?? 0, skipped: preparation?.results.skipped };
  // Best-effort: the send already happened, the audit only records it.
  await recordAudit({
    event_type: "campaign",
    user_email: user?.email ?? null,
    action: "send_campaign_messages",
    entity_type: "outreach_campaign",
    entity_id: campaignId,
    details: { ...results, sendgrid_refused: rejected },
    org_id: orgOf(user),
  });
  if (rejected) {
    return {
      success: false,
      error: `SendGrid refused to send (${rejected}). Check SENDGRID_API_KEY and the verified sender address, then resume sending.`,
      results,
      campaign_status: status,
    };
  }
  return { success: true, results, campaign_status: status };
}

// ─── Metrics ─────────────────────────────────────────────────────────────────

export async function handleTrackCampaignMetrics(payload: any, user?: Caller) {
  const campaignId = Number(payload?.campaign_id);
  if (!Number.isInteger(campaignId)) throw new HttpError(400, "campaign_id is required");
  return withClient("15s", async (client) => {
    await loadCampaign(client, campaignId, user);
    const { rows: [c] } = await client.query(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE status = 'pending')::int AS pending,
              count(*) FILTER (WHERE status = 'sending')::int AS sending,
              count(*) FILTER (WHERE status = 'failed')::int AS failed,
              count(*) FILTER (WHERE status = 'suppressed')::int AS suppressed,
              count(*) FILTER (WHERE sent_at IS NOT NULL)::int AS sent,
              count(*) FILTER (WHERE status IN ('delivered', 'opened', 'clicked', 'responded'))::int AS delivered,
              count(*) FILTER (WHERE opened_at IS NOT NULL)::int AS opened,
              count(*) FILTER (WHERE clicked_at IS NOT NULL)::int AS clicked,
              count(*) FILTER (WHERE responded_at IS NOT NULL)::int AS responded,
              count(*) FILTER (WHERE bounced_at IS NOT NULL)::int AS bounced
         FROM outreach_messages WHERE campaign_id = $1`,
      [campaignId],
    );
    const metrics = buildCampaignMetrics(c as MessageCounts);
    // Merge so the conversions/revenue entered in the outcomes panel survive.
    await client.query(
      "UPDATE outreach_campaigns SET metrics = COALESCE(metrics, '{}'::jsonb) || jsonb_build_object('delivery', $2::jsonb), updated_date = now() WHERE id = $1",
      [campaignId, JSON.stringify(metrics)],
    );
    // Best-effort: the metrics were already stored.
    await recordAudit({
      event_type: "campaign",
      user_email: user?.email ?? null,
      action: "track_campaign_metrics",
      entity_type: "outreach_campaign",
      entity_id: campaignId,
      details: { sent: metrics.sent, delivered: metrics.delivered, opened: metrics.opened, clicked: metrics.clicked, responded: metrics.responded, bounced: metrics.bounced, failed: metrics.failed },
      org_id: orgOf(user),
    });
    return {
      success: true,
      metrics,
      tracking: { webhookConfigured: !!process.env.SENDGRID_WEBHOOK_PUBLIC_KEY },
    };
  });
}

/**
 * Record a campaign's conversions and revenue. Merged into metrics in one
 * statement, so it can't overwrite the delivery counts that
 * trackCampaignMetrics keeps in the same column.
 */
export async function handleSaveCampaignOutcomes(payload: any, user?: Caller) {
  const campaignId = Number(payload?.campaign_id);
  if (!Number.isInteger(campaignId) || campaignId <= 0) throw new HttpError(400, "campaign_id is required");
  const conversions = Number(payload?.conversions ?? 0);
  const revenue = Number(payload?.revenue ?? 0);
  if (!Number.isInteger(conversions) || conversions < 0 || !Number.isFinite(revenue) || revenue < 0) {
    throw new HttpError(400, "Conversions must be a whole number and revenue zero or more.");
  }
  const { rows } = await pool.query(
    `UPDATE outreach_campaigns
        SET metrics = COALESCE(metrics, '{}'::jsonb) || jsonb_build_object('conversions', $2::numeric, 'revenue', $3::numeric),
            updated_date = now()
      WHERE id = $1 AND org_id = $4
      RETURNING metrics`,
    [campaignId, conversions, revenue, orgOf(user)],
  );
  if (!rows[0]) throw new HttpError(404, "Campaign not found");
  // Best-effort: the outcomes were already stored.
  await recordAudit({
    event_type: "campaign",
    user_email: user?.email ?? null,
    action: "save_campaign_outcomes",
    entity_type: "outreach_campaign",
    entity_id: campaignId,
    details: { conversions, revenue },
    org_id: orgOf(user),
  });
  return { success: true, metrics: rows[0].metrics };
}

// ─── Unsubscribe ─────────────────────────────────────────────────────────────

export async function handleUnsubscribeToken(token: string): Promise<string | null> {
  const email = verifyUnsubscribeToken(token, unsubscribeSecret());
  if (!email) return null;
  await addSuppression(email, "unsubscribed", "link");
  await pool.query(
    "UPDATE outreach_messages SET status = 'suppressed', updated_date = now() WHERE lower(recipient_email) = $1 AND status = 'pending'",
    [email],
  );
  return email;
}

// ─── Outreach score ──────────────────────────────────────────────────────────

async function aiStrategy(summary: Record<string, unknown>): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const res = await anthropic.messages.create({
      model: CLAUDE_MODELS.HAIKU,
      max_tokens: 200,
      messages: [{
        role: "user",
        content: `In two sentences, recommend how a healthcare sales rep should approach this provider. Be specific and practical; do not invent facts.\n${JSON.stringify(summary)}`,
      }],
    });
    const block = res.content.find((b: any) => b.type === "text") as any;
    return block?.text?.trim() || null;
  } catch (e: any) {
    console.warn("[outreachScore] AI strategy failed:", e?.message);
    return null;
  }
}

/**
 * Outreach score for one provider. Public, so for regular users it's read-only:
 * the deterministic score, no AI strategy (which costs tokens) and nothing
 * saved. An organization's owner can also ask for the AI strategy (counted
 * against the organization's daily allowance); only a platform admin stores the
 * score on the provider, which every customer shares.
 */
export async function handleCalculateOutreachScore(payload: any, user?: Caller) {
  // The provider record is shared by every customer, so only a platform admin writes the score back to it.
  // An organization's owner may ask for the AI strategy (counted against the organization's allowance);
  // anyone else gets the deterministic score.
  const platform = isPlatformAdmin(user);
  const wantsAi = (platform || user?.orgRole === "owner") && !!payload?.with_ai;
  const npi = String(payload?.npi || "").trim();
  if (!/^\d{10}$/.test(npi)) throw new HttpError(400, "A 10-digit npi is required");

  const features = await withClient("15s", async (client) => {
    const [p, t, l, u, r, m] = await inSequence([
      () => client.query("SELECT npi, status, email, email_validation_status, phone, credential FROM providers WHERE npi = $1 LIMIT 1", [npi]),
      () => client.query("SELECT 1 FROM provider_taxonomies WHERE npi = $1 LIMIT 1", [npi]),
      () => client.query("SELECT phone FROM provider_locations WHERE npi = $1 LIMIT 20", [npi]),
      // Medicare volume: every service row of the provider's latest year (one
      // row is one HCPCS code), summed the same way as the provider report.
      () => client.query(
        `SELECT count(*)::int AS n,
                COALESCE(SUM(CASE WHEN total_unique_benes ~ '^[0-9]+(\\.[0-9]+)?$' THEN total_unique_benes::numeric END), 0) AS benes
           FROM provider_service_utilization
          WHERE npi = $1
            AND data_year = (SELECT MAX(data_year) FROM provider_service_utilization WHERE npi = $1)`,
        [npi],
      ),
      // Partners, not rows: a pair has one row per data year.
      () => client.query(
        `SELECT count(DISTINCT referred_to_npi)::int AS n
           FROM (SELECT referred_to_npi FROM cms_referrals WHERE npi = $1 AND referred_to_npi IS NOT NULL LIMIT 1000) x`,
        [npi],
      ),
      // The caller's own organization's outreach to this provider (another customer's is not theirs to see).
      () => client.query(
        `SELECT count(*) FILTER (WHERE sent_at IS NOT NULL)::int AS sent, count(opened_at)::int AS opened,
                count(responded_at)::int AS responded, count(bounced_at)::int AS bounced
           FROM outreach_messages WHERE npi = $1 AND org_id = $2`,
        [npi, user?.orgId ?? -1],
      ),
    ]);
    const provider = p.rows[0];
    if (!provider) throw new HttpError(404, "Provider not found");
    return {
      status: provider.status,
      email: provider.email,
      emailValidationStatus: provider.email_validation_status,
      hasPhone: !!provider.phone || l.rows.some((row: any) => !!row.phone),
      beneficiaries: u.rows[0]?.n ? Number(u.rows[0].benes) || 0 : null,
      referralPartners: r.rows[0]?.n || 0,
      messagesSent: m.rows[0]?.sent || 0,
      opened: m.rows[0]?.opened || 0,
      responded: m.rows[0]?.responded || 0,
      bounced: m.rows[0]?.bounced || 0,
      hasSpecialty: t.rows.length > 0,
      hasLocation: l.rows.length > 0,
      hasCredential: !!provider.credential,
      emailSuppressed: false,
    };
  });
  if (features.email) features.emailSuppressed = await isSuppressed(features.email);

  const result = computeOutreachScore(features);
  if (wantsAi) await consumeQuota(user as any, "ai_calls");
  const strategy = wantsAi
    ? (await aiStrategy({ score: result.score, factors: result.factors })) || result.strategy
    : result.strategy;

  if (platform) {
    await pool.query(
      `UPDATE providers SET ai_outreach_score = $2, ai_outreach_strategy = $3, ai_engagement_factors = $4::jsonb,
              ai_outreach_scored_at = now(), updated_date = now() WHERE npi = $1`,
      [npi, result.score, strategy, JSON.stringify({ components: result.components, factors: result.factors })],
    );
  }

  return { success: true, npi, ...result, strategy, saved: platform };
}
