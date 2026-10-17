import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyPlan, assertApplyAllowed, importedFileUrl, poolApplyDb, rewriteStoredUrls, type Queryable } from "../scripts/base44/apply";
import { importSource, planImport, summarize } from "../scripts/base44/plan";

const root = path.resolve(import.meta.dirname, "..");

function memoryDb(seedUsers: Record<string, unknown>[] = []) {
  let next = 10;
  const tables = new Map<string, Record<string, unknown>[]>();
  tables.set("users", seedUsers.map((row) => ({ ...row })));
  const map: { entity: string; source_id: string; target_id: number }[] = [];
  const members: { org_id: number; user_id: number }[] = [];
  const query: Queryable["query"] = async (text, params = []) => {
    if (text === "BEGIN" || text === "COMMIT" || text === "ROLLBACK") return { rows: [] };
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
    const selected = /^SELECT ([a-z_, ]+) FROM ([a-z_]+) WHERE id = \$1$/.exec(text);
    if (selected) {
      const hit = (tables.get(selected[2]) ?? []).find((row) => row.id === params[0]);
      return { rows: hit ? [hit] : [] };
    }
    if (text.startsWith("INSERT INTO base44_import_map")) {
      map.push({ entity: String(params[0]), source_id: String(params[1]), target_id: Number(params[3]) });
      return { rows: [] };
    }
    if (text.startsWith("INSERT INTO organization_members")) {
      members.push({ org_id: Number(params[0]), user_id: Number(params[1]) });
      return { rows: [] };
    }
    const update = /^UPDATE ([a-z_]+) SET (.+) WHERE id = \$(\d+)$/.exec(text);
    if (update) {
      const row = (tables.get(update[1]) ?? []).find((item) => item.id === params[Number(update[3]) - 1]);
      if (!row) return { rows: [] };
      update[2].split(", ").forEach((assignment, index) => {
        row[assignment.split(" = ")[0]] = params[index];
      });
      return { rows: [] };
    }
    const match = /^INSERT INTO ([a-z_]+) \(([^)]+)\)/.exec(text);
    if (!match) throw new Error(`Unexpected SQL: ${text}`);
    const id = next++;
    const row: Record<string, unknown> = { id };
    match[2].split(", ").forEach((column, index) => { row[column] = params[index]; });
    const list = tables.get(match[1]) ?? [];
    list.push(row);
    tables.set(match[1], list);
    return { rows: [{ id }] };
  };
  const db = {
    query,
    async transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
      const snapTables = new Map([...tables].map(([name, rows]) => [name, rows.map((row) => ({ ...row }))]));
      const snapMap = map.map((row) => ({ ...row }));
      const snapMembers = members.map((row) => ({ ...row }));
      const snapNext = next;
      try {
        return await fn(db);
      } catch (error) {
        tables.clear();
        for (const [name, rows] of snapTables) tables.set(name, rows);
        map.splice(0, map.length, ...snapMap);
        members.splice(0, members.length, ...snapMembers);
        next = snapNext;
        throw error;
      }
    },
  };
  return { db, tables, map, members };
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
    expect(store.members).toEqual([{ org_id: 1, user_id: 5 }]);
  });

  it("keeps native campaign templates, list members, message text, and delivery times", async () => {
    const logo = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/app/logo.png";
    const plan = planImport({
      LeadList: [{ id: "L1", name: "Referrers", provider_count: 1 }],
      LeadListMember: [{ id: "m1", lead_list_id: "L1", npi: "1234567893" }],
      OutreachCampaign: [{
        id: "k1", name: "Fall mailer", subject_template: "Hello {{provider_name}}",
        body_template: "We can help.", lead_list_id: "L1",
      }],
      OutreachCampaignMissing: [],
      OutreachMessage: [{
        id: "msg1", campaign_id: "k1", recipient_email: "pat@quiet.example",
        body_html: "<p>Hi<br>there</p>", body_text: "Hi\nthere",
        sent_at: "2026-01-02T15:04:05.000Z", opened_at: "2026-01-03T15:04:05.000Z",
        clicked_at: "2026-01-04T15:04:05.000Z", responded_at: "2026-01-05T15:04:05.000Z",
      }],
      CampaignTemplate: [{ id: "tpl", name: "Intro", body_template: `See ${logo}` }],
    }, { orgId: 1 });
    const orphan = planImport({
      OutreachCampaign: [{ id: "k2", name: "No audience", subject_template: "Subject", body_template: "Body", lead_list_id: "missing" }],
      OutreachMessage: [{ id: "msg2", campaign_id: "k1", body_html: "<p>Only&nbsp;html</p>" }],
    });
    expect(plan.rows.findIndex((row) => row.sourceId === "L1")).toBeLessThan(plan.rows.findIndex((row) => row.sourceId === "k1"));
    expect(plan.rows.find((row) => row.sourceId === "m1")).toMatchObject({
      action: "insert", parent: { entity: "LeadList", sourceId: "L1", column: "list_id" },
    });
    expect(plan.rows.find((row) => row.sourceId === "k1")).toMatchObject({
      action: "insert",
      values: { subject: "Hello {{provider_name}}", body: "We can help.", campaign_type: "lead_list" },
      parent: { entity: "LeadList", sourceId: "L1", column: "target_list_id" },
    });
    expect(plan.rows.find((row) => row.sourceId === "msg1")?.values).toMatchObject({
      body: "Hi\nthere",
      sent_at: "2026-01-02T15:04:05.000Z",
      opened_at: "2026-01-03T15:04:05.000Z",
      clicked_at: "2026-01-04T15:04:05.000Z",
      responded_at: "2026-01-05T15:04:05.000Z",
    });
    expect(orphan.rows.find((row) => row.sourceId === "k2")).toMatchObject({
      action: "insert", values: { subject: "Subject", body: "Body" }, warnings: ["lead list was not imported"] });
    expect(orphan.rows.find((row) => row.sourceId === "k2")?.parent).toBeUndefined();
    expect(orphan.rows.find((row) => row.sourceId === "msg2")).toMatchObject({ action: "skip", reason: "parent was not imported" });
    const htmlOnly = planImport({
      OutreachCampaign: [{ id: "k1", name: "Fall mailer" }],
      OutreachMessage: [{ id: "msg3", campaign_id: "k1", body_html: "<p>Only&nbsp;html<br>line</p>" }],
    });
    expect(htmlOnly.rows.find((row) => row.sourceId === "msg3")?.values.body).toBe("Only html\nline");

    const store = memoryDb();
    await applyPlan(plan, store.db, { orgId: 1, hashPassword: async () => "unused" });
    const list = store.tables.get("lead_lists")?.[0];
    const campaign = store.tables.get("outreach_campaigns")?.[0];
    const message = store.tables.get("outreach_messages")?.[0];
    expect(campaign?.target_list_id).toBe(list?.id);
    expect(campaign).toMatchObject({ subject: "Hello {{provider_name}}", body: "We can help." });
    expect(store.tables.get("lead_list_members")?.[0]?.list_id).toBe(list?.id);
    expect(message).toMatchObject({ body: "Hi\nthere", sent_at: "2026-01-02T15:04:05.000Z", responded_at: "2026-01-05T15:04:05.000Z" });
    const template = store.tables.get("campaign_templates")?.[0];
    expect(template?.body_template).toBe(`See ${logo}`);
    await applyPlan(plan, store.db, { orgId: 1, hashPassword: async () => "unused" });
    const rewritten = await rewriteStoredUrls(store.db, plan, [{ url: logo, localUrl: importedFileUrl("logo.png") }]);
    expect(rewritten).toBe(1);
    expect(template?.body_template).toBe(`See ${importedFileUrl("logo.png")}`);
    expect(await rewriteStoredUrls(store.db, plan, [{ url: logo, localUrl: importedFileUrl("logo.png") }])).toBe(0);
  });

  it("rolls back a row, its map, and membership when the unit fails", async () => {
    const store = memoryDb();
    let maps = 0;
    let memberships = 0;
    const query = store.db.query.bind(store.db);
    store.db.query = async (text, params) => {
      if (text.startsWith("INSERT INTO base44_import_map")) {
        maps += 1;
        if (maps === 1) throw new Error("map failed");
      }
      if (text.startsWith("INSERT INTO organization_members")) {
        memberships += 1;
        if (memberships === 1) throw new Error("membership failed");
      }
      return query(text, params);
    };
    const account = planImport({ CrmAccount: [{ id: "a1", name: "Quiet Manor", city: "Pittsburgh" }] }, { orgId: 1 });
    await expect(applyPlan(account, store.db, { orgId: 1, hashPassword: async () => "unused" })).rejects.toThrow(/map failed/);
    expect(store.tables.get("crm_accounts") ?? []).toHaveLength(0);
    expect(store.map).toHaveLength(0);
    await applyPlan(account, store.db, { orgId: 1, hashPassword: async () => "unused" });
    expect(store.tables.get("crm_accounts")).toHaveLength(1);
    expect(store.map).toHaveLength(1);

    const user = planImport({ User: [{ id: "u9", email: "new@example.com", role: "user" }] }, { orgId: 1 });
    await expect(applyPlan(user, store.db, { orgId: 1, hashPassword: async () => "hashed" })).rejects.toThrow(/membership failed/);
    expect(store.tables.get("users") ?? []).toHaveLength(0);
    expect(store.members).toHaveLength(0);
    expect(store.map.filter((row) => row.entity === "User")).toHaveLength(0);
    const saved = await applyPlan(user, store.db, { orgId: 1, hashPassword: async () => "hashed" });
    expect(saved.inserted).toBe(1);
    expect(store.members).toEqual([{ org_id: 1, user_id: store.tables.get("users")?.[0]?.id }]);
  });

  it("checks out one connection and rolls it back when the unit fails", async () => {
    const store = memoryDb();
    const log: string[] = [];
    let open = 0;
    const pool = {
      query: store.db.query.bind(store.db),
      async connect() {
        open += 1;
        return {
          query: async (text: string, params?: unknown[]) => {
            log.push(text.startsWith("INSERT") ? text.slice(0, 40) : text);
            if (text === "BEGIN" || text === "COMMIT" || text === "ROLLBACK") return { rows: [] };
            if (text.startsWith("INSERT INTO base44_import_map")) throw new Error("map failed");
            return store.db.query(text, params);
          },
          release() { open -= 1; },
        };
      },
    };
    const plan = planImport({ CrmAccount: [{ id: "a1", name: "Quiet Manor", city: "Pittsburgh" }] }, { orgId: 1 });
    await expect(applyPlan(plan, poolApplyDb(pool), { orgId: 1, hashPassword: async () => "unused" })).rejects.toThrow(/map failed/);
    expect(log).toContain("BEGIN");
    expect(log).toContain("ROLLBACK");
    expect(log).not.toContain("COMMIT");
    expect(open).toBe(0);
  });

  it("uses an explicit export directory instead of a live API key", () => {
    expect(importSource({ exportDir: "./base44-export", token: "live-token" })).toBe("export-dir");
    expect(importSource({ token: "live-token" })).toBe("api");
    expect(importSource({})).toBe("none");
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
