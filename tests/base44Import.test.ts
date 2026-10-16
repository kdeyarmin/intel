import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyPlan, assertApplyAllowed, type Queryable } from "../scripts/base44/apply";
import { planImport, summarize } from "../scripts/base44/plan";

const root = path.resolve(import.meta.dirname, "..");

function memoryDb(seedUsers: Record<string, unknown>[] = []) {
  let next = 10;
  const tables = new Map<string, Record<string, unknown>[]>();
  tables.set("users", seedUsers.map((row) => ({ ...row })));
  const map: { entity: string; source_id: string; target_id: number }[] = [];
  const db: Queryable = {
    async query(text, params = []) {
      if (text.startsWith("SELECT id FROM organizations")) {
        return { rows: params[0] === 1 ? [{ id: 1 }] : [] };
      }
      if (text.startsWith("SELECT target_id")) {
        const hit = map.find((row) => row.entity === params[0] && row.source_id === params[1]);
        return { rows: hit ? [{ target_id: hit.target_id }] : [] };
      }
      if (text.startsWith("SELECT id FROM users")) {
        const hit = (tables.get("users") ?? []).find((row) => String(row.email).toLowerCase() === String(params[0]).toLowerCase());
        return { rows: hit ? [{ id: hit.id }] : [] };
      }
      if (text.startsWith("INSERT INTO base44_import_map")) {
        map.push({ entity: String(params[0]), source_id: String(params[1]), target_id: Number(params[3]) });
        return { rows: [] };
      }
      if (text.startsWith("INSERT INTO organization_members")) return { rows: [] };
      const match = /^INSERT INTO ([a-z_]+) \(([^)]+)\)/.exec(text);
      if (!match) throw new Error(`Unexpected SQL: ${text}`);
      const id = next++;
      const row: Record<string, unknown> = { id };
      match[2].split(", ").forEach((column, index) => { row[column] = params[index]; });
      const list = tables.get(match[1]) ?? [];
      list.push(row);
      tables.set(match[1], list);
      return { rows: [{ id }] };
    },
  };
  return { db, tables, map };
}

describe("Base44 import plan", () => {
  const bundle = {
    User: [
      { id: "u1", email: "Ada@Example.com", role: "admin", password: "hunter2", full_name: "Ada" },
      { id: "u2", email: "ada@example.com", role: "user" },
      { id: "u3", email: "not-an-email", role: "user" },
    ],
    CrmAccount: [
      { id: "a1", name: "Quiet Manor", account_type: "nursing home", city: "Pittsburgh", phone: "4125551212", npi: "123", website: "https://quiet.example" },
      { id: "a2", name: "Quiet Manor", account_type: "snf", city: "Pittsburgh" },
    ],
    CrmContact: [
      { id: "c1", account_id: "a1", name: "Pat Lee", role: "director of nursing", email: "pat@quiet.example" },
      { id: "c2", account_id: "missing", name: "Nobody" },
      { id: "c3", account_id: "a1", role: "admin" },
    ],
    CrmActivity: [{ id: "v1", accountId: "a1", kind: "visit", activity_date: "2026-10-01", user_email: "ada@example.com" }],
    CrmReferral: [{ id: "r1", account_id: "a1", received_on: "2026-10-02", outcome: "admitted", patient_name: "Hidden" }],
    OutreachCampaign: [{ id: "k1", name: "Fall mailer", status: "draft" }],
    CrmCampaignTouch: [{ id: "t1", account_id: "a1", campaign_id: "k1", touched_on: "2026-10-03" }],
    Provider: { __count: 12 },
    CampaignTask: [{ id: "task1", name: "Call back" }],
    Mystery: [{ id: "m1", name: "Unknown entity" }],
    CrmAccountNote: "logo https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/6993c62145573ca8a97ad4a9/file.png",
  };

  it("plans invited users, drops passwords, and reports mismatches", () => {
    const plan = planImport(bundle, { existingEmails: ["kept@example.com"], orgId: 1 });
    const summary = summarize(plan);
    const ada = plan.rows.find((row) => row.sourceId === "u1");
    expect(ada).toMatchObject({ action: "insert", table: "users", values: { email: "ada@example.com", status: "invited", role: "admin", is_platform_admin: true } });
    expect(ada?.values.password).toBeUndefined();
    expect(ada?.warnings).toContain("password was not copied");
    expect(plan.rows.find((row) => row.sourceId === "u2")?.action).toBe("unchanged");
    expect(plan.rows.find((row) => row.sourceId === "u3")).toMatchObject({ action: "skip", reason: "missing or invalid email" });
    expect(summary.byEntity.CrmAccount).toMatchObject({ insert: 1, skip: 1 });
    expect(plan.rows.find((row) => row.sourceId === "c2")).toMatchObject({ action: "skip", reason: "parent was not imported" });
    expect(plan.rows.find((row) => row.sourceId === "c3")).toMatchObject({ action: "skip", reason: "missing name" });
    expect(plan.rows.find((row) => row.sourceId === "r1")?.warnings).toContain("patient name was not imported");
    expect(plan.rows.find((row) => row.sourceId === "r1")?.values.patient_name).toBeUndefined();
    expect(summary.bulk).toEqual([{ entity: "Provider", count: 12 }]);
    expect(summary.dropped).toEqual([{ entity: "CampaignTask", count: 1 }]);
    expect(summary.unmapped).toEqual([{ entity: "Mystery", count: 1 }]);
    expect(summary.files).toBe(0);
  });

  it("collects Base44 storage URLs from imported rows", () => {
    const plan = planImport({
      CrmAccount: [{ id: "a1", name: "Quiet Manor", note: "see https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/app/logo.png" }],
    });
    expect(plan.files).toEqual([{ url: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/app/logo.png", fileName: "logo.png" }]);
  });

  it("refuses to apply against a remote database unless explicitly allowed", () => {
    expect(() => assertApplyAllowed("postgresql://u:p@intel.proxy.rlwy.net:5432/railway", false)).toThrow(/Refusing to write/);
    expect(() => assertApplyAllowed("postgresql://caremetric:caremetric@127.0.0.1:5432/caremetric", false)).not.toThrow();
  });

  it("inserts an invited user once and links a second run to the same row", async () => {
    const plan = planImport({
      User: [{ id: "u1", email: "ada@example.com", role: "user", password: "hunter2", full_name: "Ada" }],
      CrmAccount: [{ id: "a1", name: "Quiet Manor", city: "Pittsburgh", claimed_by_email: "ada@example.com" }],
    }, { orgId: 1 });
    const store = memoryDb();
    const first = await applyPlan(plan, store.db, { orgId: 1, hashPassword: async (plain) => `hashed:${plain}` });
    expect(first.inserted).toBe(2);
    const user = store.tables.get("users")?.[0];
    expect(user).toMatchObject({ email: "ada@example.com", status: "invited", role: "user" });
    expect(String(user?.password_hash)).toMatch(/^hashed:/);
    expect(String(user?.password_hash)).not.toContain("hunter2");
    const account = store.tables.get("crm_accounts")?.[0];
    expect(account?.org_id).toBe(1);
    expect(account?.claimed_by_user_id).toBe(user?.id);
    const second = await applyPlan(plan, store.db, { orgId: 1, hashPassword: async () => "unused" });
    expect(second.inserted).toBe(0);
    expect(second.unchanged).toBe(2);
    expect(store.tables.get("users")).toHaveLength(1);
  });

  it("does not overwrite an existing Railway user", async () => {
    const plan = planImport({
      User: [{ id: "u1", email: "ada@example.com", role: "admin", password: "hunter2" }],
    }, { orgId: 1, existingEmails: ["ada@example.com"] });
    const store = memoryDb([{ id: 5, email: "ada@example.com", password_hash: "existing", status: "active" }]);
    const report = await applyPlan(plan, store.db, { orgId: 1, hashPassword: async () => "unused" });
    expect(report.inserted).toBe(0);
    expect(report.unchanged).toBe(1);
    expect(store.tables.get("users")).toEqual([{ id: 5, email: "ada@example.com", password_hash: "existing", status: "active" }]);
  });
});

describe("Base44 runtime leftovers", () => {
  it("does not depend on the Base44 SDK or the hosted storage bucket", () => {
    const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
    expect(pkg.dependencies["@base44/sdk"]).toBeUndefined();
    expect(pkg.dependencies["@base44/vite-plugin"]).toBeUndefined();
    expect(pkg.name).toBe("caremetric-intel");
    const html = readFileSync(path.join(root, "index.html"), "utf8");
    expect(html).not.toContain("supabase.co");
    expect(html).toContain("/brand/caremetric-mark.png");
    const branding = readFileSync(path.join(root, "src/lib/branding.js"), "utf8");
    expect(branding).not.toContain("base44-prod");
  });
});
