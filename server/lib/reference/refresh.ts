import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { pool } from "../../db";
import { datasetById, fileForDataset, REFERENCE_DATASETS } from "./catalog";
import { parseReferenceDataset, type LoadRow, type ParsedLoad } from "./parse";
import { freshnessStatus, referenceApplyEnabled, referenceLoadPlan } from "./schedule";
import type { PosFacility } from "./pos";

const BUNDLED_SEEDS: Record<string, string> = {
  certificate_of_need: path.join(process.cwd(), "server/data/reference/certificate_of_need.csv"),
};

function quoteIdent(name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`Unsafe identifier ${name}`);
  return `"${name}"`;
}

export function upsertSql(load: ParsedLoad, count: number): string {
  const columns = load.columns.map(quoteIdent).join(", ");
  const tuples = Array.from({ length: count }, (_, row) => {
    const params = load.columns.map((_, col) => `$${row * load.columns.length + col + 1}`);
    return `(${params.join(", ")})`;
  });
  const conflict = load.conflict.map(quoteIdent).join(", ");
  const updates = load.columns
    .filter((column) => !load.conflict.includes(column))
    .map((column) => `${quoteIdent(column)} = EXCLUDED.${quoteIdent(column)}`);
  const action = updates.length ? `DO UPDATE SET ${updates.join(", ")}` : "DO NOTHING";
  return `INSERT INTO ${quoteIdent(load.table)} (${columns}) VALUES ${tuples.join(", ")} ON CONFLICT (${conflict}) ${action}`;
}

function valuesOf(load: ParsedLoad, rows: LoadRow[]): unknown[] {
  return rows.flatMap((row) => load.columns.map((column) => row[column] ?? null));
}

async function writeRows(client: { query: (sql: string, params?: unknown[]) => Promise<unknown> }, load: ParsedLoad): Promise<number> {
  const size = 200;
  for (let i = 0; i < load.rows.length; i += size) {
    const batch = load.rows.slice(i, i + size);
    if (!batch.length) continue;
    await client.query(upsertSql(load, batch.length), valuesOf(load, batch));
  }
  return load.rows.length;
}

async function previousPos(client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: PosFacility[] }> }, period: string): Promise<PosFacility[]> {
  const found = await client.query(
    `SELECT ccn, period, name, state, category_code, control_type, certification_date, termination_date, chow_date
       FROM cms_pos_facility
      WHERE period = (SELECT max(period) FROM cms_pos_facility WHERE period < $1)`,
    [period],
  );
  return found.rows;
}

async function applyOne(client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: PosFacility[] }> }, id: string, csv: string, fileName: string): Promise<number> {
  await client.query("BEGIN");
  try {
    const draft = parseReferenceDataset(id, csv, { fileName });
    const parsed = id === "cms_pos"
      ? parseReferenceDataset(id, csv, { fileName, previousPos: await previousPos(client, String(draft.rows[0]?.period ?? "9999")) })
      : draft;
    const count = await writeRows(client, parsed);
    if (parsed.signals) {
      await writeRows(client, {
        table: "cms_pos_signal",
        columns: ["ccn", "period", "signal", "prior_period", "detail"],
        conflict: ["ccn", "period", "signal"],
        rows: parsed.signals,
      });
    }
    await client.query(
      `INSERT INTO dataset_versions (import_type, source, status, row_count, imported_at, data_year, catalog_checked_at, updated_date)
       VALUES ($1, 'reference_file', 'current', $2, now(), $3, now(), now())
       ON CONFLICT (import_type) DO UPDATE SET status = 'current', row_count = $2, imported_at = now(), data_year = $3, updated_date = now()`,
      [id, count, parsed.rows[0]?.period ?? parsed.rows[0]?.year ?? parsed.rows[0]?.fiscal_year ?? null],
    );
    await client.query("COMMIT");
    return count;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

async function recordFreshness(client: { query: (sql: string, params?: unknown[]) => Promise<unknown> }, plan: ReturnType<typeof referenceLoadPlan>): Promise<void> {
  for (const item of plan.due) {
    const dataset = datasetById(item.id);
    if (!dataset) continue;
    await client.query(
      `INSERT INTO dataset_versions (import_type, source, source_title, status, notes, accrual_periodicity, catalog_checked_at, updated_date)
       VALUES ($1, 'reference_file', $5, $2, $3, $4, now(), now())
       ON CONFLICT (import_type) DO UPDATE SET
         source_title = EXCLUDED.source_title,
         catalog_checked_at = now(),
         accrual_periodicity = EXCLUDED.accrual_periodicity,
         notes = EXCLUDED.notes,
         status = CASE
           WHEN dataset_versions.status = 'importing' THEN dataset_versions.status
           WHEN dataset_versions.imported_at IS NOT NULL AND $2 = 'never_imported' THEN dataset_versions.status
           ELSE EXCLUDED.status
         END,
         updated_date = now()`,
      [item.id, freshnessStatus(item), item.due ? item.reason : "current", dataset.cadence, dataset.label],
    );
  }
}

/**
 * Reports which reference files are due. Row loads run only when
 * REFERENCE_LOAD_APPLY=1 and REFERENCE_DATA_DIR points at local files.
 * Nothing is downloaded.
 */
export async function refreshReferenceData(): Promise<Record<string, unknown>> {
  const now = new Date();
  const dir = process.env.REFERENCE_DATA_DIR || "";
  const apply = referenceApplyEnabled();
  let fileNames: string[] = [];
  if (dir) {
    try {
      fileNames = await readdir(dir);
    } catch {
      fileNames = [];
    }
  }
  const client = await pool.connect();
  try {
    let versions: { rows: { import_type: string; imported_at: string | null; status: string | null }[] };
    try {
      versions = await client.query(`SELECT import_type, imported_at, status FROM dataset_versions WHERE import_type = ANY($1::text[])`, [REFERENCE_DATASETS.map((dataset) => dataset.id)]);
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === "42P01") return { mode: "dry-run", due: [], loaded: [], errors: [{ id: "dataset_versions", error: "reference tables are not migrated" }] };
      throw err;
    }
    const plan = referenceLoadPlan({ now, versions: versions.rows, fileNames, apply });
    await recordFreshness(client, plan);
    const loaded: { id: string; rows: number }[] = [];
    const errors: { id: string; error: string }[] = [];
    for (const id of plan.loads) {
      const fileName = fileForDataset(id, fileNames);
      if (!fileName || !dir) continue;
      try {
        const csv = await readFile(path.join(dir, fileName), "utf8");
        const rows = await applyOne(client, id, csv, fileName);
        loaded.push({ id, rows });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push({ id, error: message.slice(0, 200) });
        await client.query(
          `UPDATE dataset_versions SET status = 'failed', notes = $2, updated_date = now() WHERE import_type = $1`,
          [id, message.slice(0, 400)],
        );
      }
    }
    if (apply && fileForDataset("certificate_of_need", fileNames) == null) {
      try {
        const csv = await readFile(BUNDLED_SEEDS.certificate_of_need, "utf8");
        const due = plan.due.find((item) => item.id === "certificate_of_need")?.due;
        if (due) {
          const rows = await applyOne(client, "certificate_of_need", csv, "certificate_of_need.csv");
          loaded.push({ id: "certificate_of_need", rows });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push({ id: "certificate_of_need", error: message.slice(0, 200) });
      }
    }
    return {
      mode: plan.mode,
      due: plan.due.filter((item) => item.due).map((item) => item.id),
      loaded,
      errors,
    };
  } finally {
    client.release();
  }
}
