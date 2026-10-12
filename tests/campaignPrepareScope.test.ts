/** prepareCampaignMessages: a campaign can only draw its recipients from its own organization's lead lists. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { client, poolQuery } = vi.hoisted(() => ({
  client: { query: vi.fn(), release: vi.fn() },
  poolQuery: vi.fn(async () => ({ rows: [], rowCount: 0 })),
}));

vi.mock("../server/db", () => ({ db: {}, pool: { connect: async () => client, query: poolQuery } }));
vi.mock("../server/lib/orgQuota", () => ({ consumeQuota: vi.fn(async () => {}) }));
vi.mock("../server/lib/mailer", () => ({ sendMail: vi.fn(), getMailerStatus: () => ({ configured: true, missing: [] }) }));
vi.mock("../server/lib/suppressions", () => ({
  loadSuppressed: vi.fn(async () => new Set<string>()),
  isSuppressed: vi.fn(async () => false),
  addSuppression: vi.fn(),
  normalizeEmail: (e: string) => String(e || "").trim().toLowerCase(),
}));

import { handlePrepareCampaignMessages } from "../server/functions/outreach";

// Organization 2's owner. List 17 belongs to organization 9, list 31 to organization 2.
const OWNER = { email: "owner@riverbend.org", orgId: 2, orgRole: "owner" };
const LISTS = [{ id: 17, org_id: 9 }, { id: 31, org_id: 2 }];
let campaign: Record<string, unknown>;

const sqls = () => client.query.mock.calls.map(([sql]: any[]) => String(sql));

beforeEach(() => {
  vi.clearAllMocks();
  campaign = { id: 5, org_id: 2, subject: "Hello", body: "Hi {{first_name}}", status: "draft", target_list_id: 17 };
  client.query.mockImplementation(async (sql: string, params: any[] = []) => {
    if (/^(SET|RESET|BEGIN|COMMIT|ROLLBACK)/.test(sql)) return { rows: [] };
    if (sql.includes("FROM outreach_campaigns WHERE id = $1 AND org_id = $2")) {
      return { rows: params[1] === campaign.org_id && params[0] === campaign.id ? [campaign] : [] };
    }
    // Like the real table: a lookup that names the organization finds only its lists, one that doesn't finds any.
    if (sql.includes("FROM lead_lists WHERE id = $1")) {
      return { rows: LISTS.filter((l) => l.id === params[0] && (!sql.includes("org_id = $2") || l.org_id === params[1])) };
    }
    if (sql.includes("FROM lead_list_members")) return { rows: [{ npi: "1234567893" }] };
    if (sql.includes("SELECT count(*)::int AS count FROM outreach_messages")) return { rows: [{ count: 0 }] };
    return { rows: [] };
  });
});

describe("prepareCampaignMessages and the campaign's lead list", () => {
  it("refuses a list from another organization with a 404 and reads none of its members", async () => {
    await expect(handlePrepareCampaignMessages({ campaign_id: 5 }, OWNER)).rejects.toMatchObject({ status: 404, message: expect.stringMatching(/Lead list not found/) });
    expect(sqls().some((s) => s.includes("FROM lead_list_members"))).toBe(false);
    expect(sqls().some((s) => s.includes("INSERT INTO outreach_messages"))).toBe(false);
    expect(sqls()).toContain("ROLLBACK");
  });

  it("asks for the list in the campaign's own organization", async () => {
    campaign.target_list_id = 31;
    // Its member has no provider row in this fake, so there is nobody to message, but it got past the list check
    // and read the members of the organization's own list.
    await expect(handlePrepareCampaignMessages({ campaign_id: 5 }, OWNER)).resolves.toMatchObject({ success: true });
    const lookup = client.query.mock.calls.find(([sql]: any[]) => String(sql).includes("FROM lead_lists WHERE id = $1"))!;
    expect(lookup[1]).toEqual([31, 2]);
    expect(sqls().some((s) => s.includes("FROM lead_list_members"))).toBe(true);
  });

  it("still prepares a campaign that targets NPIs and no list", async () => {
    campaign.target_list_id = null;
    campaign.target_npis = ["1234567893"];
    await expect(handlePrepareCampaignMessages({ campaign_id: 5 }, OWNER)).resolves.toMatchObject({ success: true });
    expect(sqls().some((s) => s.includes("FROM lead_lists"))).toBe(false);
  });
});
