/**
 * The Imports panel's "Generate Analysis" button. The function samples the rows
 * an import stored, asks the model for a structured assessment and keeps it on
 * the batch, which is what the panel renders. The sample must be found by key
 * (the tables hold millions of rows), the model's answer must be validated
 * before it is stored, and only a platform admin with an API key gets that far.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    batch: null as any,
    sample: [] as any[],
    sampleError: null as Error | null,
    reply: "" as string | null,
    updates: [] as Record<string, any>[],
    audits: [] as Record<string, any>[],
    prompts: [] as any[],
    transactions: 0,
  },
}));

function chain(result: () => Promise<any[]>) {
  const c: any = { from: () => c, where: () => c, orderBy: () => c, limit: () => result() };
  return c;
}

vi.mock("../server/db", () => ({
  db: {
    select: () => chain(async () => (state.batch ? [state.batch] : [])),
    update: () => ({
      set: (data: Record<string, any>) => ({
        where: async () => {
          state.updates.push(data);
          return [];
        },
      }),
    }),
    transaction: async (fn: (tx: any) => Promise<any>) => {
      state.transactions++;
      return fn({
        execute: async () => [],
        select: () => chain(async () => {
          if (state.sampleError) throw state.sampleError;
          return state.sample;
        }),
      });
    },
  },
  pool: {},
}));
vi.mock("../server/lib/audit", () => ({
  recordAudit: async (entry: Record<string, any>) => {
    state.audits.push(entry);
  },
}));
vi.mock("../server/functions/stubs", () => ({
  notConfigured: (error: string, extra: Record<string, unknown> = {}) => ({ success: false, notConfigured: true, error, ...extra }),
}));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = {
      create: async (args: any) => {
        state.prompts.push(args);
        return { content: state.reply === null ? [] : [{ type: "text", text: state.reply }] };
      },
    };
  },
}));

import {
  buildPrompt,
  cleanSample,
  completenessPercent,
  handleAnalyzeImportedDataset,
  parseAnalysis,
  resolveSampleSource,
} from "../server/functions/analyzeImportedDataset";
import { TYPED_ROUTES } from "../server/functions/cmsTypedTables";
import { providers, medicareFacilities, cmsOrderReferring, providerServiceUtilization } from "../server/db/schema";
import { CLAUDE_MODELS } from "../server/lib/aiModels";

const meta = { model: "test-model", sampleSize: 3, now: new Date("2026-10-12T12:00:00Z") };
const GOOD_REPLY = JSON.stringify({
  completeness_score: 82,
  quality_score: 74,
  completeness_report: "Most fields are filled.",
  quality_issues: ["Some zips lack the +4"],
  trends_anomalies: ["One hospital reports zero discharges"],
  key_metrics_summary: "20 hospitals sampled.",
  overall_assessment: "Usable.",
});
const admin = { id: 9001, email: "admin@example.com", role: "admin" };
// The limiter allows ten analyses a minute per user; the sampling-failure tests use their own so `admin` keeps its budget.
const sampler = { id: 9002, email: "sampler@example.com", role: "admin" };

describe("which table holds an import's rows", () => {
  it("follows the importer's routing", () => {
    expect(resolveSampleSource("nppes_registry")).toEqual({ kind: "table", table: providers });
    expect(resolveSampleSource("nppes_monthly_full")).toEqual({ kind: "table", table: providers });
    expect(resolveSampleSource("hospital_service_area")).toEqual({ kind: "table", table: TYPED_ROUTES.hospital_service_area.table });
    expect(resolveSampleSource("cms_order_referring")).toEqual({ kind: "table", table: cmsOrderReferring });
    expect(resolveSampleSource("provider_service_utilization")).toEqual({ kind: "table", table: providerServiceUtilization });
    // The legacy name the importer still accepts.
    expect(resolveSampleSource("cms_utilization")).toEqual({ kind: "table", table: providerServiceUtilization });
  });

  it("treats every other import type as a facility dataset kept under its own facility_type", () => {
    expect(resolveSampleSource("nursing_home_providers")).toEqual({ kind: "facility", facilityType: "nursing_home_providers" });
  });

  it("refuses names that aren't an import type", () => {
    for (const bad of [null, undefined, "", "  ", "x", "Robert'); DROP TABLE providers;--", "has space", "UPPER"]) {
      expect(resolveSampleSource(bad as any), String(bad)).toBeNull();
    }
  });
});

describe("the sample the model sees", () => {
  it("drops bookkeeping columns and bounds long values", () => {
    const [row] = cleanSample([{
      id: 5,
      created_date: new Date(),
      updated_date: new Date(),
      name: "x".repeat(500),
      notes: { deep: "y".repeat(500) },
      small: { a: 1 },
      n: 3,
      empty: null,
    }]);
    expect(Object.keys(row)).toEqual(["name", "notes", "small", "n", "empty"]);
    expect((row.name as string).length).toBe(201);
    expect(String(row.notes).endsWith("…")).toBe(true);
    expect(row.small).toEqual({ a: 1 });
  });

  it("measures completeness over the fields that remain", () => {
    expect(completenessPercent([{ a: 1, b: "", c: null }, { a: 2, b: "x", c: undefined }])).toBe(50);
    expect(completenessPercent([])).toBe(0);
  });

  it("tells the model what it is looking at and not to invent", () => {
    const prompt = buildPrompt("hospital_service_area", 64, "[{\"a\":1}]", 1);
    expect(prompt).toContain("Import Type: hospital_service_area");
    expect(prompt).toContain("64%");
    expect(prompt).toContain("do not invent facts");
    expect(prompt).toContain("[{\"a\":1}]");
  });
});

describe("validating the model's answer", () => {
  it("accepts a bare or fenced JSON object, even with prose around it", () => {
    for (const reply of [GOOD_REPLY, "```json\n" + GOOD_REPLY + "\n```", "Here you go:\n" + GOOD_REPLY + "\nHope that helps."]) {
      const a = parseAnalysis(reply, meta)!;
      expect(a.completeness_score).toBe(82);
      expect(a.quality_score).toBe(74);
      expect(a.quality_issues).toEqual(["Some zips lack the +4"]);
      expect(a.model).toBe("test-model");
      expect(a.sample_size).toBe(3);
      expect(a.generated_at).toBe("2026-10-12T12:00:00.000Z");
    }
  });

  it("clamps scores and bounds what the panel will render", () => {
    const a = parseAnalysis(JSON.stringify({
      completeness_score: 250,
      quality_score: "-4",
      completeness_report: "r".repeat(5000),
      quality_issues: ["ok", "", 7, "q".repeat(900), ...Array.from({ length: 30 }, (_, i) => `issue ${i}`)],
    }), meta)!;
    expect(a.completeness_score).toBe(100);
    expect(a.quality_score).toBe(0);
    expect(a.completeness_report.length).toBe(1500);
    expect(a.quality_issues).toHaveLength(10);
    expect(a.quality_issues[1].length).toBe(300);
    expect(a.trends_anomalies).toEqual([]);
  });

  it("rejects an answer without usable scores or without JSON", () => {
    for (const reply of [null, undefined, "", "no json here", "{not json}", JSON.stringify({ quality_score: 50 }), JSON.stringify({ completeness_score: "n/a", quality_score: 1 })]) {
      expect(parseAnalysis(reply as any, meta), String(reply)).toBeNull();
    }
  });

  it("does not read an absent or blank score as a real zero", () => {
    // Number(null), Number(""), Number(" ") and Number([]) are all 0.
    for (const missing of [null, "", "   ", [], [5], true, {}]) {
      for (const field of ["completeness_score", "quality_score"]) {
        const reply = JSON.stringify({ completeness_score: 60, quality_score: 70, [field]: missing });
        expect(parseAnalysis(reply, meta), `${field}: ${JSON.stringify(missing)}`).toBeNull();
      }
    }
    // A genuine zero, or a number sent as a string, is still a score.
    const a = parseAnalysis(JSON.stringify({ completeness_score: 0, quality_score: " 85 " }), meta)!;
    expect([a.completeness_score, a.quality_score]).toEqual([0, 85]);
  });
});

describe("handleAnalyzeImportedDataset", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    state.batch = { id: 12, import_type: "hospital_service_area", status: "completed" };
    state.sample = [
      { id: 1, created_date: new Date(), ccn: "390001", zip5: "19001", data_year: 2024, patients: 12 },
      { id: 2, created_date: new Date(), ccn: "390002", zip5: "", data_year: 2024, patients: null },
    ];
    state.sampleError = null;
    state.reply = GOOD_REPLY;
    state.updates = [];
    state.audits = [];
    state.prompts = [];
    state.transactions = 0;
  });

  it("is for platform admins only", async () => {
    for (const user of [null, undefined, { id: 1, role: "user" }, { id: 2, role: "user", orgRole: "owner" }]) {
      await expect(handleAnalyzeImportedDataset({ batch_id: 12 }, user as any)).rejects.toMatchObject({ status: 403 });
    }
    expect(state.prompts).toHaveLength(0);
    // A platform admin who is not the `admin` role still qualifies (users.is_platform_admin).
    const res: any = await handleAnalyzeImportedDataset({ batch_id: 12 }, { id: 3, role: "user", isPlatformAdmin: true });
    expect(res.success).toBe(true);
  });

  it("says it isn't configured, without touching the database, when there is no API key", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res: any = await handleAnalyzeImportedDataset({ batch_id: 12 }, admin);
    expect(res).toMatchObject({ success: false, notConfigured: true, batch_id: 12 });
    expect(res.error).toContain("ANTHROPIC_API_KEY");
    expect(state.transactions).toBe(0);
    expect(state.prompts).toHaveLength(0);
  });

  it("needs a batch id and a batch that exists", async () => {
    await expect(handleAnalyzeImportedDataset({}, admin)).rejects.toMatchObject({ status: 400 });
    await expect(handleAnalyzeImportedDataset({ batch_id: "abc" }, admin)).rejects.toMatchObject({ status: 400 });
    await expect(handleAnalyzeImportedDataset({ batch_id: -3 }, admin)).rejects.toMatchObject({ status: 400 });
    state.batch = null;
    await expect(handleAnalyzeImportedDataset({ batch_id: 12 }, admin)).rejects.toMatchObject({ status: 404 });
  });

  it("samples the rows, asks the model with them, stores the validated answer and audits it", async () => {
    const res: any = await handleAnalyzeImportedDataset({ batch_id: 12 }, admin);
    expect(res.success).toBe(true);
    expect(res.analysis).toMatchObject({ completeness_score: 82, quality_score: 74, sample_size: 2, model: CLAUDE_MODELS.HAIKU });

    expect(state.transactions).toBe(1);
    expect(state.prompts).toHaveLength(1);
    const call = state.prompts[0];
    expect(call.model).toBe(CLAUDE_MODELS.HAIKU);
    const prompt: string = call.messages[0].content;
    expect(prompt).toContain("Import Type: hospital_service_area");
    expect(prompt).toContain("390001");
    expect(prompt).not.toContain("created_date");
    // Two rows of four fields once id and created_date are gone; two of the eight are empty.
    expect(prompt).toContain("(filled fields vs total fields) is 75%");

    expect(state.updates).toEqual([{ ai_analysis: res.analysis }]);
    expect(state.audits).toHaveLength(1);
    expect(state.audits[0]).toMatchObject({
      event_type: "ai_analysis",
      user_email: "admin@example.com",
      entity_type: "import_batch",
      entity_id: 12,
      details: { import_type: "hospital_service_area", sample_size: 2 },
    });
  });

  it("keeps the prompt inside its budget by sending fewer rows", async () => {
    state.sample = Array.from({ length: 20 }, (_, r) => Object.fromEntries(Array.from({ length: 60 }, (_, c) => [`col_${c}`, `${r}-${c}-${"z".repeat(190)}`])));
    const res: any = await handleAnalyzeImportedDataset({ batch_id: 12 }, admin);
    expect(res.success).toBe(true);
    expect(res.analysis.sample_size).toBeLessThan(20);
    expect(res.analysis.sample_size).toBeGreaterThan(0);
    expect(state.prompts[0].messages[0].content.length).toBeLessThan(26_000);
  });

  it("answers plainly, spending nothing, for an import type it can't read or one with no rows", async () => {
    state.batch = { id: 12, import_type: "Not A Type", status: "completed" };
    let res: any = await handleAnalyzeImportedDataset({ batch_id: 12 }, admin);
    expect(res).toMatchObject({ success: false });
    expect(res.error).toContain("isn't available");

    state.batch = { id: 12, import_type: "hospital_service_area", status: "completed" };
    state.sample = [];
    res = await handleAnalyzeImportedDataset({ batch_id: 12 }, admin);
    expect(res).toMatchObject({ success: false });
    expect(res.error).toContain("nothing to analyze");
    expect(state.prompts).toHaveLength(0);
    expect(state.updates).toHaveLength(0);
  });

  it("reports a sampling timeout instead of failing the request", async () => {
    // PostgreSQL's query_canceled, as the driver raises it and as Drizzle wraps it.
    for (const error of [
      Object.assign(new Error("canceling statement due to statement timeout"), { code: "57014" }),
      Object.assign(new Error("Failed query: select ..."), { cause: { code: "57014" } }),
    ]) {
      state.sampleError = error;
      const res: any = await handleAnalyzeImportedDataset({ batch_id: 12 }, sampler);
      expect(res).toMatchObject({ success: false });
      expect(res.error).toContain("timed out");
    }
    expect(state.prompts).toHaveLength(0);
  });

  it("does not call any other database failure a timeout", async () => {
    for (const error of [
      Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5432"), { code: "ECONNREFUSED" }),
      Object.assign(new Error('relation "medicare_facilities" does not exist'), { code: "42P01" }),
      Object.assign(new Error("Failed query: select ..."), { cause: { code: "28P01" } }),
      new Error("canceling statement due to statement timeout"),
    ]) {
      state.sampleError = error;
      await expect(handleAnalyzeImportedDataset({ batch_id: 12 }, sampler), error.message).rejects.toBe(error);
    }
    expect(state.prompts).toHaveLength(0);
    expect(state.updates).toHaveLength(0);
  });

  it("stores nothing when the model's answer isn't usable", async () => {
    for (const reply of [null, "I cannot do that.", JSON.stringify({ quality_score: 40 })]) {
      state.reply = reply;
      const res: any = await handleAnalyzeImportedDataset({ batch_id: 12 }, admin);
      expect(res, String(reply)).toMatchObject({ success: false });
      expect(res.error).toContain("usable analysis");
    }
    expect(state.updates).toHaveLength(0);
    expect(state.audits).toHaveLength(0);
  });

  it("is rate-limited per user, because every call spends tokens", async () => {
    const user = { id: 424242, email: "burst@example.com", role: "admin" };
    for (let i = 0; i < 10; i++) {
      const res: any = await handleAnalyzeImportedDataset({ batch_id: 12 }, user);
      expect(res.success, `call ${i + 1}`).toBe(true);
    }
    await expect(handleAnalyzeImportedDataset({ batch_id: 12 }, user)).rejects.toMatchObject({ status: 429 });
    // Someone else is unaffected.
    const other: any = await handleAnalyzeImportedDataset({ batch_id: 12 }, { ...admin, id: 424243 });
    expect(other.success).toBe(true);
  });
});
