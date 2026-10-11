/**
 * The lead scoring job: candidates come from a primary-key walk of
 * provider_locations limited to the configured states, each batch of NPIs is
 * looked up once per table, scores replace the old rows in one transaction,
 * and the run is recorded in rollup_runs and the audit trail.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ audits: [] as any[], lockOk: true, staleRows: 0, failInsert: false }));

vi.mock("../server/db", () => ({
  pool: {},
  db: { insert: () => ({ values: async (row: any) => { h.audits.push(row); } }) },
}));
vi.mock("../server/lib/geo", () => ({
  getGeoIndex: async () => ({ counties: new Map([["42003", { fips: "42003" }]]), zctas: new Map([["15213", { county: "42003" }]]) }),
  zipToCounty: (index: any, zip: string) => (index.zctas.get(zip) ? { fips: index.zctas.get(zip).county, name: "Allegheny County", state: "PA" } : null),
}));

import { DEFAULT_SCORING_RULES } from "../server/lib/leadScoring";
import { leadScoringDue, leadScoringStatus, removeStaleScores, runLeadScoring, settleInterruptedLeadScoring, startLeadScoring, waitForLeadScoring } from "../server/lib/leadScoringJob";

const LOCATIONS = [
  { id: 1, npi: "1111111111", state: "PA", zip: "15213-1234", city: "Pittsburgh", location_type: "Practice" },
  { id: 2, npi: "1111111111", state: "PA", zip: "15213", city: "Pittsburgh", location_type: "Mailing" },
  { id: 3, npi: "2222222222", state: "OH", zip: "43604", city: "Toledo", location_type: "Practice" },
  { id: 4, npi: "3333333333", state: "PA", zip: "16001", city: "Butler", location_type: null },
  { id: 5, npi: "4444444444", state: "PA", zip: "19104", city: "Philadelphia", location_type: "Practice" },
];
const PROVIDERS: Record<string, any> = {
  "1111111111": { npi: "1111111111", entity_type: "Individual", email: "doc@example.com", phone: "412", status: "Active" },
  "3333333333": { npi: "3333333333", entity_type: "Organization", email: null, phone: null, status: "Active" },
  "4444444444": { npi: "4444444444", entity_type: "Individual", email: null, phone: null, status: "Deactivated" },
};

function fakePool() {
  const statements: Array<{ sql: string; params?: any[] }> = [];
  const client = {
    async query(sql: string, params?: any[]) {
      statements.push({ sql, params });
      if (sql.includes("pg_try_advisory_lock")) return { rows: [{ ok: h.lockOk }] };
      if (sql.startsWith("DELETE FROM lead_scores WHERE id IN")) return { rows: [], rowCount: h.staleRows };
      if (sql.startsWith("INSERT INTO lead_scores") && h.failInsert) throw new Error("disk full");
      if (sql.startsWith("SELECT min(id)")) return { rows: [{ lo: 1, hi: 5 }] };
      if (sql.includes("FROM provider_locations")) {
        const [lo, hi, states] = params!;
        return { rows: LOCATIONS.filter((l) => l.id >= lo && l.id < hi && states.includes(l.state) && l.location_type !== "Mailing").map((l) => ({ npi: l.npi, state: l.state, zip5: l.zip.slice(0, 5), city: l.city })) };
      }
      if (sql.includes("FROM providers")) return { rows: params![0].map((n: string) => PROVIDERS[n]).filter(Boolean) };
      if (sql.includes("FROM provider_taxonomies")) return { rows: [{ npi: "1111111111", taxonomy_code: "207Q00000X", taxonomy_description: "Family Medicine", is_primary: true }] };
      if (sql.includes("FROM cms_physician_by_provider")) return { rows: [{ npi: "1111111111", data_year: "2024", benes: 300, services: 2700 }] };
      if (sql.includes("FROM cms_order_referring")) return { rows: [{ npi: "1111111111", partb: true, dme: false, hha: true, pmd: false, hospice: true }] };
      if (sql.includes("FROM cms_facility_affiliation")) return { rows: [] };
      if (sql.includes("FROM rollup_runs")) return { rows: [] };
      return { rows: [] };
    },
    release() {},
  };
  return { statements, pool: { connect: async () => client, query: client.query } };
}

beforeEach(() => {
  h.audits.length = 0;
  h.lockOk = true;
  h.staleRows = 0;
  h.failInsert = false;
});

describe("runLeadScoring", () => {
  it("scores the individual, active providers located in the territory and records the run", async () => {
    const { pool, statements } = fakePool();
    const log = { log: vi.fn(), warn: vi.fn() };
    const r = await runLeadScoring(pool, DEFAULT_SCORING_RULES as any, { log, now: () => new Date("2026-10-11T00:00:00Z") });
    expect(r).toMatchObject({ status: "success", territory: { states: ["PA"], counties: [] }, candidates: 3, scored: 1 });

    const sql = statements.map((s) => s.sql);
    // Candidates: a PK walk under the chunk timeout, filtered to the states.
    expect(sql.find((s) => s.startsWith("SET statement_timeout"))).toBe("SET statement_timeout = '30s'");
    const walk = statements.find((s) => s.sql.includes("FROM provider_locations") && s.sql.includes("id >= $1"))!;
    expect(walk.params).toEqual([1, 6, ["PA"]]);
    // One lookup per table for the batch, then the batch's rows replaced in a transaction.
    const batch = statements.find((s) => s.sql.includes("FROM providers"))!;
    expect(batch.params![0].sort()).toEqual(["1111111111", "3333333333", "4444444444"]);
    const i = sql.indexOf("BEGIN");
    expect(sql[i + 1]).toMatch(/^DELETE FROM lead_scores WHERE npi = ANY/);
    expect(sql[i + 2]).toMatch(/^INSERT INTO lead_scores/);
    expect(sql[i + 3]).toBe("COMMIT");
    const insert = statements[i + 2];
    expect(insert.params![0]).toEqual(["1111111111"]);
    expect(insert.params![1][0]).toBeGreaterThan(80);
    const details = JSON.parse(insert.params![6][0]);
    expect(details.reasons).toEqual(expect.arrayContaining(["Specialty: Family Medicine", "Eligible to order home health, hospice", "300 Medicare beneficiaries (2024)", "Target state: Pittsburgh, PA", "Solo practice"]));
    expect(details.score_breakdown.geographic_priority).toEqual({ value: 100, weight: 10, contribution: 10 });
    // The run row and the audit event.
    expect(sql.filter((s) => s.includes("rollup_runs")).at(-1)).toMatch(/SET status = 'success'/);
    expect(statements.find((s) => s.sql.includes("SET status = 'success'"))!.params).toEqual(["lead_scores", 3, 2, 1, expect.any(Number), JSON.stringify({ territory: { states: ["PA"], counties: [] } })]);
    expect(h.audits).toHaveLength(1);
    expect(h.audits[0]).toMatchObject({ event_type: "scoring_run", user_email: "system@maintenance", details: { scored: 1, candidates: 3, states: ["PA"] } });
    expect(sql.at(-1)).toMatch(/pg_advisory_unlock/);
    expect(log.log).toHaveBeenCalledWith(expect.stringMatching(/Scored 1 of 3 providers in PA/));
  });

  it("removes the older scores a complete run didn't rewrite, after the last batch and before it reports success", async () => {
    h.staleRows = 7;
    const { pool, statements } = fakePool();
    const log = { log: vi.fn(), warn: vi.fn() };
    const start = new Date("2026-10-11T00:00:00Z");
    const r = await runLeadScoring(pool, DEFAULT_SCORING_RULES as any, { log, now: () => start });
    expect(r).toMatchObject({ status: "success", scored: 1, removed: 7 });

    const sql = statements.map((s) => s.sql);
    const stale = sql.findIndex((s) => s.startsWith("DELETE FROM lead_scores WHERE id IN"));
    expect(stale).toBeGreaterThan(sql.lastIndexOf("COMMIT"));
    expect(stale).toBeLessThan(sql.findIndex((s) => s.includes("SET status = 'success'")));
    // "Older" means before this run began; the rows it wrote are stamped at or after it.
    expect(statements[stale].sql).toMatch(/last_calculated IS NULL OR last_calculated < \$1/);
    expect(statements[stale].params![0]).toEqual(start);
    expect(h.audits[0].details).toMatchObject({ scored: 1, removed: 7 });
    expect(log.log).toHaveBeenCalledWith(expect.stringMatching(/removed 7 older scores/));
  });

  it("keeps the older scores when the run fails part-way", async () => {
    h.failInsert = true;
    const { pool, statements } = fakePool();
    const r = await runLeadScoring(pool, DEFAULT_SCORING_RULES as any, { log: { log: vi.fn(), warn: vi.fn() } });
    expect(r.status).toBe("failed");
    expect(statements.some((s) => s.sql.startsWith("DELETE FROM lead_scores WHERE id IN"))).toBe(false);
  });

  it("refuses to score without a configured state", async () => {
    const { pool, statements } = fakePool();
    const rules = DEFAULT_SCORING_RULES.map((r) => (r.rule_type === "geographic_priority" ? { ...r, conditions: { states: [] } } : r));
    const r = await runLeadScoring(pool, rules as any);
    expect(r).toMatchObject({ status: "failed", error: expect.stringMatching(/at least one state/) });
    expect(statements).toHaveLength(0);
  });

  it("scores the states named by a Geographic Priority rule that is switched off, not Pennsylvania", async () => {
    const { pool, statements } = fakePool();
    const rules = DEFAULT_SCORING_RULES.map((r) => (r.rule_type === "geographic_priority" ? { ...r, enabled: false, conditions: { states: ["OH"], counties: [] } } : r));
    const r = await runLeadScoring(pool, rules as any, { log: { log: vi.fn(), warn: vi.fn() } });
    expect(r).toMatchObject({ status: "success", territory: { states: ["OH"], counties: [] } });
    expect(statements.find((s) => s.sql.includes("FROM provider_locations") && s.sql.includes("id >= $1"))!.params![2]).toEqual(["OH"]);
  });

  it("skips when another instance holds the lock", async () => {
    h.lockOk = false;
    const { pool, statements } = fakePool();
    expect((await runLeadScoring(pool, DEFAULT_SCORING_RULES as any)).status).toBe("skipped");
    expect(statements.map((s) => s.sql).some((s) => s.includes("rollup_runs"))).toBe(false);
    expect(statements.map((s) => s.sql).some((s) => s.includes("pg_advisory_unlock"))).toBe(false);
  });

  it("runs once in the background per process", async () => {
    const { pool } = fakePool();
    expect(startLeadScoring(pool, DEFAULT_SCORING_RULES as any)).toEqual({ started: true });
    expect(startLeadScoring(pool, DEFAULT_SCORING_RULES as any)).toEqual({ started: false, reason: "already running" });
    expect((await waitForLeadScoring())!.status).toBe("success");
    expect(startLeadScoring(pool, DEFAULT_SCORING_RULES as any)).toEqual({ started: true });
    await waitForLeadScoring();
  });
});

describe("leadScoringDue", () => {
  const now = Date.parse("2026-10-11T00:00:00Z");
  it("is due when never run or a week old, not while running or fresh", () => {
    expect(leadScoringDue({ running: false, last_success_at: null }, now)).toBe(true);
    expect(leadScoringDue({ running: false, last_success_at: "2026-10-01T00:00:00Z" }, now)).toBe(true);
    expect(leadScoringDue({ running: false, last_success_at: "2026-10-09T00:00:00Z" }, now)).toBe(false);
    expect(leadScoringDue({ running: true, last_success_at: null }, now)).toBe(false);
  });
});

describe("a run a restart interrupted", () => {
  function statusPool(row: { status: string } | null, opts: { lockFree: boolean; unlockFails?: boolean }) {
    const state = { row: row as any };
    const released: unknown[] = [];
    const client = {
      async query(sql: string) {
        if (sql.includes("pg_try_advisory_lock")) return { rows: [{ ok: opts.lockFree }] };
        if (sql.includes("pg_advisory_unlock")) {
          if (opts.unlockFails) throw new Error("connection lost");
          return { rows: [{}] };
        }
        return { rows: [] };
      },
      release(destroy?: unknown) { released.push(destroy); },
    };
    const pool = {
      connect: async () => client,
      async query(sql: string, params?: any[]) {
        if (sql.startsWith("SELECT status FROM rollup_runs")) return { rows: state.row ? [{ status: state.row.status }] : [] };
        if (sql.startsWith("UPDATE rollup_runs")) {
          if (state.row?.status !== "running") return { rowCount: 0, rows: [] };
          state.row = { ...state.row, status: "failed", error: params![1] };
          return { rowCount: 1, rows: [] };
        }
        if (sql.startsWith("SELECT * FROM rollup_runs")) return { rows: state.row ? [state.row] : [] };
        if (sql.includes("FROM lead_scores")) return { rows: [{ n: 12 }] };
        return { rows: [] };
      },
    };
    return { pool, state, released };
  }

  it("is marked failed once no process holds the lock, so the weekly refresh can start again", async () => {
    const { pool, state, released } = statusPool({ status: "running" }, { lockFree: true });
    const status = await leadScoringStatus(pool);
    expect(state.row).toMatchObject({ status: "failed", error: expect.stringMatching(/Interrupted/) });
    expect(status).toMatchObject({ running: false, status: "failed", error: expect.stringMatching(/Interrupted/) });
    expect(leadScoringDue(status)).toBe(true);
    expect(released).toEqual([undefined]);
  });

  it("is left alone while another instance holds the lock", async () => {
    const { pool, state } = statusPool({ status: "running" }, { lockFree: false });
    expect(await settleInterruptedLeadScoring(pool)).toBe(false);
    expect(state.row.status).toBe("running");
    const status = await leadScoringStatus(pool);
    expect(status.running).toBe(true);
    expect(leadScoringDue(status)).toBe(false);
  });

  it("changes nothing for a finished run, and doesn't probe the lock for one", async () => {
    const { pool, state, released } = statusPool({ status: "success" }, { lockFree: true });
    expect(await settleInterruptedLeadScoring(pool)).toBe(false);
    expect(state.row.status).toBe("success");
    expect(released).toEqual([]);
  });

  it("doesn't declare a run dead when the lock can't be released cleanly, and destroys that connection", async () => {
    const { pool, state, released } = statusPool({ status: "running" }, { lockFree: true, unlockFails: true });
    expect(await settleInterruptedLeadScoring(pool)).toBe(false);
    expect(state.row.status).toBe("running");
    expect(released).toEqual([true]);
  });
});

describe("removeStaleScores", () => {
  it("deletes in batches until a short batch says it is done", async () => {
    const counts = [20_000, 20_000, 5];
    const calls: any[][] = [];
    const client = { query: async (_sql: string, params: any[]) => { calls.push(params); return { rowCount: counts.shift() ?? 0 }; } };
    const start = new Date("2026-10-11T00:00:00Z");
    expect(await removeStaleScores(client, start)).toBe(40_005);
    expect(calls).toEqual([[start, 20_000], [start, 20_000], [start, 20_000]]);
  });

  it("is one cheap statement when nothing is stale", async () => {
    const client = { query: vi.fn(async () => ({ rowCount: 0 })) };
    expect(await removeStaleScores(client, new Date())).toBe(0);
    expect(client.query).toHaveBeenCalledTimes(1);
  });
});
