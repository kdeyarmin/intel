import { describe, it, expect, vi, beforeEach } from "vitest";

const { client, poolQuery, aiCreate } = vi.hoisted(() => ({
  client: { query: vi.fn(), release: vi.fn() },
  poolQuery: vi.fn(async () => ({ rows: [] })),
  aiCreate: vi.fn(async () => ({ content: [{ type: "text", text: "Call the office manager." }] })),
}));

vi.mock("../server/db", () => ({ pool: { connect: async () => client, query: poolQuery } }));
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

  it("gives admins the AI strategy and saves the score", async () => {
    const out = await handleCalculateOutreachScore({ npi: NPI, with_ai: true }, { role: "admin" });
    expect(out).toMatchObject({ saved: true, strategy: "Call the office manager." });
    expect(aiCreate).toHaveBeenCalledTimes(1);
    expect(poolQuery.mock.calls.some(([sql]: any[]) => String(sql).includes("UPDATE providers"))).toBe(true);
  });

  it("scores the provider's latest-year volume across all service rows and distinct partners", async () => {
    await handleCalculateOutreachScore({ npi: NPI }, { role: "user" });
    const sqls = client.query.mock.calls.map(([sql]: any[]) => String(sql));
    expect(sqls.some((s) => s.includes("SUM(") && s.includes("MAX(data_year)"))).toBe(true);
    expect(sqls.some((s) => s.includes("count(DISTINCT referred_to_npi)"))).toBe(true);
  });
});
