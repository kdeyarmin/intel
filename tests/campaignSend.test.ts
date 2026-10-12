/** handleSendCampaignMessages: queue cap and recovery when the pre-send suppression check fails. */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { client, poolQuery, sendMail, loadSuppressed, consumeQuota } = vi.hoisted(() => ({
  client: { query: vi.fn(), release: vi.fn() },
  poolQuery: vi.fn(async () => ({ rows: [], rowCount: 0 })),
  sendMail: vi.fn(async () => ({ messageId: "sg-1" })),
  loadSuppressed: vi.fn(async () => new Set<string>()),
  consumeQuota: vi.fn(async () => {}),
}));

vi.mock("../server/db", () => ({ db: {}, pool: { connect: async () => client, query: poolQuery } }));
vi.mock("../server/lib/orgQuota", () => ({ consumeQuota }));
vi.mock("../server/lib/mailer", () => ({ sendMail, getMailerStatus: () => ({ configured: true, missing: [] }) }));
vi.mock("../server/lib/suppressions", () => ({
  loadSuppressed,
  isSuppressed: vi.fn(async () => false),
  addSuppression: vi.fn(),
  normalizeEmail: (e: string) => String(e || "").trim().toLowerCase(),
}));

import { handleSendCampaignMessages } from "../server/functions/outreach";

const OWNER = { email: "owner@clinic.org", orgId: 1, orgRole: "owner" };
let queued = 2;
const CLAIMED = [
  { id: 11, npi: "1234567893", recipient_email: "a@clinic.org", subject: "Hi", body: "Hello" },
  { id: 12, npi: "1234567894", recipient_email: "b@clinic.org", subject: "Hi", body: "Hello" },
];

beforeEach(() => {
  vi.clearAllMocks();
  queued = 2;
  process.env.OUTREACH_PHYSICAL_ADDRESS = "1 Main St, Pittsburgh, PA 15222";
  process.env.PUBLIC_APP_URL = "https://app.test";
  client.query.mockImplementation(async (sql: string) => {
    if (sql.startsWith("SET") || sql.startsWith("RESET")) return { rows: [] };
    if (sql.includes("FROM outreach_campaigns WHERE id")) return { rows: [{ id: 1, status: "ready" }] };
    if (sql.includes("SELECT count(*)::int AS count FROM outreach_messages")) return { rows: [{ count: queued }] };
    if (sql.includes("SET status = 'sending'") && sql.includes("RETURNING")) return { rows: CLAIMED };
    if (sql.includes("WITH r AS")) return { rows: [{ remaining: 0, status: "completed" }] };
    return { rows: [] };
  });
});

const campaignLookup = () => client.query.mock.calls.find(([sql]: any[]) => String(sql).includes("FROM outreach_campaigns WHERE id")) as any[] | undefined;
const claimedAnything = () => client.query.mock.calls.some(([sql]: any[]) => String(sql).includes("SET status = 'sending'"));

describe("sendCampaignMessages", () => {
  it("refuses a queue over the 5,000-recipient cap before claiming anything", async () => {
    queued = 5001;
    await expect(handleSendCampaignMessages({ campaign_id: 1 }, OWNER)).rejects.toMatchObject({ status: 400 });
    expect(claimedAnything()).toBe(false);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("puts claimed messages back in the queue when the suppression check fails", async () => {
    loadSuppressed.mockRejectedValueOnce(new Error("statement timeout"));
    await expect(handleSendCampaignMessages({ campaign_id: 1 }, OWNER)).rejects.toThrow("statement timeout");
    expect(claimedAnything()).toBe(true);
    expect(sendMail).not.toHaveBeenCalled();
    const requeue = poolQuery.mock.calls.find(([sql]: any[]) => String(sql).includes("SET status = 'pending'")) as any[] | undefined;
    expect(requeue).toBeDefined();
    expect(requeue![0]).toContain("status = 'sending'");
    expect(requeue![1]).toEqual([[11, 12]]);
  });

  it("sends each claimed message with the compliance footer and unsubscribe headers", async () => {
    const out = await handleSendCampaignMessages({ campaign_id: 1 }, OWNER);
    expect(out).toMatchObject({ success: true, results: { sent: 2 } });
    const msg = (sendMail.mock.calls[0] as any[])[0];
    expect(msg.text).toContain("1 Main St, Pittsburgh, PA 15222");
    expect(msg.customArgs).toEqual({ message_id: "11", campaign_id: "1" });
    expect(msg.headers["List-Unsubscribe"]).toMatch(/^<https:\/\/app\.test\/api\/public\/unsubscribe\?t=.+>$/);
    expect(msg.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    // The batch counts against the caller's organization's daily email allowance.
    expect(consumeQuota).toHaveBeenCalledWith(OWNER, "emails_sent", 2);
  });

  it("only finds a campaign in the caller's own organization, and nothing without one", async () => {
    await handleSendCampaignMessages({ campaign_id: 1 }, OWNER);
    const lookup = campaignLookup()!;
    expect(lookup[0]).toMatch(/WHERE id = \$1 AND org_id = \$2/);
    expect(lookup[1]).toEqual([1, 1]);

    // Another organization's campaign id is a campaign that doesn't exist.
    client.query.mockClear();
    sendMail.mockClear();
    client.query.mockImplementation(async (sql: string) => (sql.includes("FROM outreach_campaigns WHERE id") ? { rows: [] } : { rows: [] }));
    await expect(handleSendCampaignMessages({ campaign_id: 99 }, OWNER)).rejects.toMatchObject({ status: 404, message: "Campaign not found" });
    expect(claimedAnything()).toBe(false);
    expect(sendMail).not.toHaveBeenCalled();

    await expect(handleSendCampaignMessages({ campaign_id: 1 }, { email: "x@y.org", orgId: null })).rejects.toMatchObject({ status: 403 });
    await expect(handleSendCampaignMessages({ campaign_id: 1 })).rejects.toMatchObject({ status: 403 });
  });
});
