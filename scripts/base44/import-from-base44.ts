// One-time import of CareMetric Intel data out of Base44 into Railway Postgres.
//
// Default is a dry-run: it prints counts and mismatches and writes nothing.
// --apply inserts rows. It refuses a non-local DATABASE_URL unless
// BASE44_IMPORT_ALLOW_REMOTE=1. It never sends email.
//
//   npx tsx scripts/base44/import-from-base44.ts --export-dir ./base44-export
//   BASE44_API_KEY=... npx tsx scripts/base44/import-from-base44.ts --save-export ./base44-export
//   DATABASE_URL=postgresql://... npx tsx scripts/base44/import-from-base44.ts --export-dir ./base44-export --org-id 1 --apply
//
// See docs/BASE44_CUTOVER.md for the user login path after import.
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import bcrypt from "bcryptjs";
import {
  ACCESS_NEEDED,
  BASE44_APP_ID,
  BULK_ENTITIES,
  DROPPED_ENTITIES,
  IMPORT_ENTITIES,
  planImport,
  recordsOf,
  summarize,
} from "./plan";
import { applyPlan, assertApplyAllowed, saveFiles } from "./apply";

const SERVER = process.env.BASE44_SERVER_URL || "https://base44.app";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function has(name: string): boolean {
  return process.argv.includes(name);
}

async function readExportDir(dir: string): Promise<Record<string, unknown>> {
  const bundle: Record<string, unknown> = {};
  for (const file of await readdir(dir)) {
    if (!file.endsWith(".json")) continue;
    const entity = file.replace(/\.json$/, "");
    bundle[entity] = JSON.parse(await readFile(path.join(dir, file), "utf8"));
  }
  return bundle;
}

async function base44Get(token: string, appId: string, pathname: string): Promise<{ status: number; body: unknown }> {
  const response = await fetch(new URL(pathname, SERVER), {
    headers: { Authorization: `Bearer ${token}`, "X-App-Id": appId, Accept: "application/json" },
  });
  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try { body = JSON.parse(text); } catch { body = { message: text.slice(0, 200) }; }
  }
  return { status: response.status, body };
}

async function fetchEntity(token: string, appId: string, entity: string): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 10000; page += 1) {
    const pathname = `/api/apps/${appId}/entities/${entity}/v2/list?limit=500${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const { status, body } = await base44Get(token, appId, pathname);
    if (status === 404) return [];
    if (status === 401 || status === 403) {
      throw new Error(`${entity}: Base44 returned ${status}. BASE44_API_KEY cannot read app ${appId}.`);
    }
    if (status >= 400) throw new Error(`${entity}: Base44 returned ${status}.`);
    const record = body && typeof body === "object" ? body as { items?: unknown; next_cursor?: string | null; has_more?: boolean } : {};
    items.push(...recordsOf(record.items ?? body));
    if (!record.has_more || !record.next_cursor) break;
    cursor = record.next_cursor;
  }
  return items;
}

async function fetchCount(token: string, appId: string, entity: string): Promise<number | null> {
  const { status, body } = await base44Get(token, appId, `/api/apps/${appId}/entities/${entity}/count`);
  if (status === 404) return 0;
  if (status >= 400) return null;
  if (typeof body === "number") return body;
  if (body && typeof body === "object" && typeof (body as { count?: unknown }).count === "number") return (body as { count: number }).count;
  return null;
}

async function fetchBundle(token: string, appId: string, extra: string[]): Promise<Record<string, unknown>> {
  const bundle: Record<string, unknown> = {};
  const names = [...IMPORT_ENTITIES, ...DROPPED_ENTITIES, ...extra];
  for (const entity of names) bundle[entity] = await fetchEntity(token, appId, entity);
  for (const entity of BULK_ENTITIES) {
    const count = await fetchCount(token, appId, entity);
    if (count) bundle[entity] = { __count: count };
  }
  return bundle;
}

async function main() {
  if (has("--help")) {
    console.log(ACCESS_NEEDED);
    return;
  }
  const exportDir = arg("--export-dir");
  const saveExport = arg("--save-export");
  const token = process.env.BASE44_API_KEY || "";
  const appId = process.env.BASE44_APP_ID || BASE44_APP_ID;
  const extra = (process.env.BASE44_EXTRA_ENTITIES || "").split(",").map((name) => name.trim()).filter(Boolean);
  let bundle: Record<string, unknown> | null = null;

  if (token) {
    console.log(`Reading Base44 app ${appId} from ${SERVER}.`);
    bundle = await fetchBundle(token, appId, extra);
    if (saveExport) {
      await mkdir(saveExport, { recursive: true });
      for (const [entity, value] of Object.entries(bundle)) {
        await writeFile(path.join(saveExport, `${entity}.json`), JSON.stringify(value));
      }
      console.log(`Saved the export to ${saveExport}.`);
    }
  } else if (exportDir) {
    bundle = await readExportDir(exportDir);
  } else {
    console.error(ACCESS_NEEDED);
    process.exitCode = 2;
    return;
  }

  const orgArg = arg("--org-id");
  const orgId = orgArg ? Number(orgArg) : null;
  const plan = planImport(bundle, { orgId: Number.isInteger(orgId) ? orgId : null });
  const summary = summarize(plan);
  console.log(JSON.stringify({ dryRun: !has("--apply"), ...summary }, null, 2));

  if (!has("--apply")) {
    console.log("Dry-run only. No database writes, no file downloads, no email.");
    if (plan.orgId == null) console.log("Pass --org-id before --apply. Rows are stamped with that organization.");
    return;
  }

  const databaseUrl = process.env.DATABASE_URL || "";
  if (!databaseUrl) throw new Error("DATABASE_URL is required for --apply.");
  if (plan.orgId == null) throw new Error("--org-id is required for --apply.");
  assertApplyAllowed(databaseUrl, process.env.BASE44_IMPORT_ALLOW_REMOTE === "1");
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });
  try {
    const report = await applyPlan(plan, pool, {
      orgId: plan.orgId,
      hashPassword: (plain) => bcrypt.hash(plain, 12),
    });
    if (has("--download-files")) {
      const dest = path.resolve("uploads/base44-import");
      await mkdir(dest, { recursive: true });
      report.files = await saveFiles(plan, async (file) => {
        const response = await fetch(file.url);
        if (!response.ok) return false;
        const bytes = Buffer.from(await response.arrayBuffer());
        await writeFile(path.join(dest, file.fileName), bytes);
        return true;
      });
    }
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
