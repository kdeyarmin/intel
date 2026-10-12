/**
 * The AI email searches write a provider's email straight through Drizzle, not
 * the entity API. A new address must not keep the old address's DNS check
 * (score, reasons, email_analyzed_at), or the page shows the old verdict.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const { writes } = vi.hoisted(() => ({ writes: [] as Record<string, any>[] }));
vi.mock("../server/db", () => ({
  db: {
    update: () => ({
      set: (data: Record<string, any>) => {
        writes.push(data);
        return { where: async () => [] };
      },
    }),
  },
  pool: {},
}));

// The strict promotion rule (A4.5) requires an independent DNS/MX check;
// stub it valid so the promotion path is exercised without live DNS.
vi.mock("../server/lib/emailVerification", () => ({
  checkDomainCached: async () => ({ hasMX: true }),
  scoreEmail: () => ({ status: "valid", score: 95, confidence: "high", reasons: [], riskFlags: [] }),
}));

import { saveEmailToProvider } from "../server/functions/emailSearchBot";
import { saveEmail } from "../server/functions/providerIntelligenceBot";

const render = (v: any) => new PgDialect().sqlToQuery(v);
const CLEARED = ["email_quality_score", "email_quality_confidence", "email_quality_reasons", "email_quality_risk_flags", "email_analyzed_at"];

function expectStaleCheckCleared(data: Record<string, any>) {
  expect(data.email).toBe("dr.lee@clinic.org");
  for (const col of CLEARED) {
    expect(data[col], col).toBeDefined();
    expect(render(data[col]).sql).toMatch(/IS DISTINCT FROM .* THEN NULL ELSE/);
  }
  // The guessed status doesn't replace a DNS check of the same address.
  expect(render(data.email_validation_status).sql).toContain('"providers"."email_analyzed_at" IS NULL THEN');
}

describe("AI email search saves", () => {
  beforeEach(() => { writes.length = 0; });

  it("emailSearchBot clears the old address's verification", async () => {
    await saveEmailToProvider({ id: 7, npi: "1234567893" }, {
      best_email: "dr.lee@clinic.org", confidence: "high", validation_status: "valid", validation_reason: "Practice domain",
      all_emails: [{ email: "dr.lee@clinic.org", confidence: "high", validation_status: "valid" }],
    });
    expect(writes).toHaveLength(1);
    expectStaleCheckCleared(writes[0]);
  });

  it("providerIntelligenceBot clears the old address's verification", async () => {
    await saveEmail({ id: 7, npi: "1234567893" }, {
      best_email: "dr.lee@clinic.org", email_confidence: "high", email_validation_status: "valid", email_validation_reason: "Practice domain",
      all_emails: [{ email: "dr.lee@clinic.org", confidence: "high", validation_status: "valid" }],
    });
    expect(writes).toHaveLength(1);
    expectStaleCheckCleared(writes[0]);
  });

  it("leaves the stored email and its check alone when nothing is promoted", async () => {
    await saveEmailToProvider({ id: 7, npi: "1234567893" }, { best_email: "guess@clinic.org", confidence: "low", validation_status: "risky", all_emails: [] });
    expect(writes).toHaveLength(1);
    expect(writes[0]).not.toHaveProperty("email");
    expect(writes[0]).not.toHaveProperty("email_analyzed_at");
  });
});
