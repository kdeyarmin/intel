import { describe, it, expect, vi, beforeEach } from "vitest";

const { client, poolQuery, aiCreate, consumeQuota } = vi.hoisted(() => ({
  client: { query: vi.fn(), release: vi.fn() },
  consumeQuota: vi.fn(async () => {}),
  poolQuery: vi.fn(async () => ({ rows: [] })),
  aiCreate: vi.fn(async () => ({ content: [{ type: "text", text: "Call the office manager." }] })),
}));

vi.mock("../server/db", () => ({ pool: { connect: async () => client, query: poolQuery } }));
vi.mock("../server/lib/orgQuota", () => ({ consumeQuota }));
vi.mock("../server/lib/suppressions", () => ({
  isSuppressed: async () => false,
  addSuppression: vi.fn(),
  loadSuppressed: vi.fn(),
  normalizeEmail: (e: string) => e,
}));
vi.mock("@anthropic-ai/sdk", () => ({ default: class { messages = { create: aiCreate }; } }));

import { handleCalculateOutreachScore } from "../server/functions/outreach";

const NPI = "1234567893";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ANTHROPIC_API_KEY = "test-key";
  client.query.mockImplementation(async (sql: string) => {
    if (sql.startsWith("SET") || sql.startsWith("RESET")) return { rows: [] };
    if (sql.includes("FROM providers")) return { rows: [{ npi: NPI, status: "Active", email: "dr@example.com", email_validation_status: "valid", phone: "555", credential: "MD" }] };
    if (sql.includes("provider_service_utilization")) return { rows: [{ n: 3, benes: "420" }] };
    if (sql.includes("count(DISTINCT referred_to_npi)")) return { rows: [{ n: 12 }] };
    if (sql.includes("outreach_messages")) return { rows: [{ sent: 0, opened: 0, responded: 0, bounced: 0 }] };
    return { rows: [{}] };
  });
});

describe("calculateOutreachScore", () => {
  it("is read-only for regular users: no AI call and nothing saved", async () => {
    const out = await handleCalculateOutreachScore({ npi: NPI, with_ai: true }, { role: "user" });
    expect(out).toMatchObject({ success: true, npi: NPI, saved: false });
    expect(aiCreate).not.toHaveBeenCalled();
    expect(poolQuery.mock.calls.some(([sql]: any[]) => String(sql).includes("UPDATE providers"))).toBe(false);
  });

  it("gives platform admins the AI strategy and saves the score", async () => {
    const out = await handleCalculateOutreachScore({ npi: NPI, with_ai: true }, { role: "admin" });
    expect(out).toMatchObject({ saved: true, strategy: "Call the office manager." });
    expect(aiCreate).toHaveBeenCalledTimes(1);
    expect(poolQuery.mock.calls.some(([sql]: any[]) => String(sql).includes("UPDATE providers"))).toBe(true);
  });

  it("lets an organization's owner have the AI strategy, counted against the organization's allowance, without writing the shared provider", async () => {
    const owner = { role: "user", orgRole: "owner", orgId: 5 };
    const out = await handleCalculateOutreachScore({ npi: NPI, with_ai: true }, owner);
    expect(out).toMatchObject({ saved: false, strategy: "Call the office manager." });
    expect(consumeQuota).toHaveBeenCalledWith(owner, "ai_calls");
    expect(aiCreate).toHaveBeenCalledTimes(1);
    // Providers are shared by every customer: only a platform admin stores the score on one.
    expect(poolQuery.mock.calls.some(([sql]: any[]) => String(sql).includes("UPDATE providers"))).toBe(false);
  });

  it("stops at the allowance: no AI call when the organization's day is used up", async () => {
    consumeQuota.mockRejectedValueOnce(Object.assign(new Error("Today's limit of 100 AI requests for your organization has been reached."), { status: 429 }));
    await expect(handleCalculateOutreachScore({ npi: NPI, with_ai: true }, { role: "user", orgRole: "owner", orgId: 5 })).rejects.toMatchObject({ status: 429 });
    expect(aiCreate).not.toHaveBeenCalled();
  });

  it("counts only the caller's own organization's outreach to the provider", async () => {
    await handleCalculateOutreachScore({ npi: NPI }, { role: "user", orgRole: "member", orgId: 5 });
    const call = client.query.mock.calls.find(([sql]: any[]) => String(sql).includes("FROM outreach_messages")) as any[];
    expect(call[0]).toMatch(/WHERE npi = \$1 AND org_id = \$2/);
    expect(call[1]).toEqual([NPI, 5]);
  });

  it("scores the provider's latest-year volume across all service rows and distinct partners", async () => {
    await handleCalculateOutreachScore({ npi: NPI }, { role: "user" });
    const sqls = client.query.mock.calls.map(([sql]: any[]) => String(sql));
    expect(sqls.some((s) => s.includes("SUM(") && s.includes("MAX(data_year)"))).toBe(true);
    expect(sqls.some((s) => s.includes("count(DISTINCT referred_to_npi)"))).toBe(true);
  });
});
