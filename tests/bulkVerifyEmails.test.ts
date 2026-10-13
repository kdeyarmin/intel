/**
 * bulkVerifyEmails: which providers each mode picks (the same "checked" marker
 * the email panels count with) and how many are left afterwards. A result that
 * unable to be checked isn't saved, so that provider still matches its mode.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { state } = vi.hoisted(() => ({
  state: { candidates: [] as any[], total: 0, queries: [] as string[], saves: [] as any[][] },
}));

vi.mock("../server/db", () => ({
  db: {},
  pool: {
    connect: async () => ({
      query: async (text: string) => {
        state.queries.push(text);
        if (/^\s*(SET|RESET)/i.test(text)) return { rows: [] };
        if (/count\(\*\)/.test(text)) return { rows: [{ n: state.total }] };
        return { rows: state.candidates };
      },
      release: () => {},
    }),
    query: async (text: string, params: any[]) => {
      state.saves.push(params);
      return { rows: [] };
    },
  },
}));
vi.mock("../server/lib/suppressions", () => ({
  loadSuppressionReasons: async () => new Map(),
  normalizeEmail: (e: string) => String(e || "").trim().toLowerCase(),
}));
vi.mock("../server/lib/emailVerification", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    // "down.example" can't be looked up right now; everything else accepts mail.
    checkDomainCached: async (domain: string) => domain === "down.example"
      ? { domain, hasMX: null, mxCount: 0, mxHosts: [], nullMx: false, hasAddress: null, nxdomain: false, error: "DNS lookup timed out" }
      : { domain, hasMX: true, mxCount: 1, mxHosts: ["mx." + domain], nullMx: false, hasAddress: null, nxdomain: false },
  };
});

import { handleBulkVerifyEmails, stillMatchesMode } from "../server/functions/verification";

const provider = (id: number, email: string) => ({ id, npi: String(1000000000 + id), email, first_name: "A", last_name: "B" });

describe("bulkVerifyEmails", () => {
  beforeEach(() => {
    state.candidates = [];
    state.total = 0;
    state.queries = [];
    state.saves = [];
  });

  it("only re-checks addresses a DNS check already flagged (an AI guess is still unverified)", async () => {
    for (const [mode, where] of [
      ["unverified", "email_analyzed_at IS NULL"],
      ["risky", "email_analyzed_at IS NOT NULL AND email_validation_status = 'risky'"],
      ["invalid", "email_analyzed_at IS NOT NULL AND email_validation_status = 'invalid'"],
      ["reverify", "email_analyzed_at IS NOT NULL AND email_validation_status IN ('risky', 'invalid')"],
    ]) {
      state.queries = [];
      await handleBulkVerifyEmails({ mode, batch_size: 5 });
      const selects = state.queries.filter((q) => /FROM providers/.test(q));
      expect(selects, mode).toHaveLength(2);
      for (const q of selects) expect(q, mode).toContain(where);
    }
  });

  it("still counts risky providers it unable to check as remaining", async () => {
    state.total = 5;
    state.candidates = [provider(1, "a@down.example"), provider(2, "b@down.example")];
    const r = await handleBulkVerifyEmails({ mode: "risky", batch_size: 2 });
    expect(r.summary.unknown).toBe(2);
    expect(state.saves).toHaveLength(0);
    expect(r.remaining).toBe(5);
  });

  it("in re-verify mode, subtracts only providers that are now valid", async () => {
    state.total = 4;
    state.candidates = [provider(1, "a@clinic.org"), provider(2, "b@down.example")];
    const r = await handleBulkVerifyEmails({ mode: "reverify", batch_size: 2 });
    expect(r.summary).toMatchObject({ valid: 1, unknown: 1 });
    expect(r.remaining).toBe(3);
  });

  it("counts unchecked addresses as still unverified", async () => {
    state.total = 3;
    state.candidates = [provider(1, "a@clinic.org"), provider(2, "b@down.example")];
    const r = await handleBulkVerifyEmails({ mode: "unverified", batch_size: 2 });
    expect(r.remaining).toBe(2);
  });
});

describe("stillMatchesMode", () => {
  it("keeps unsaved (unknown) results in every mode that selects by stored state", () => {
    for (const mode of ["unverified", "risky", "invalid", "reverify"]) expect(stillMatchesMode(mode, "unknown"), mode).toBe(true);
    expect(stillMatchesMode("specific_npis", "unknown")).toBe(false);
  });

  it("matches saved results against the mode", () => {
    expect(stillMatchesMode("unverified", "valid")).toBe(false);
    expect(stillMatchesMode("risky", "risky")).toBe(true);
    expect(stillMatchesMode("risky", "invalid")).toBe(false);
    expect(stillMatchesMode("reverify", "invalid")).toBe(true);
    expect(stillMatchesMode("reverify", "valid")).toBe(false);
    expect(stillMatchesMode("specific_npis", "risky")).toBe(false);
  });
});
