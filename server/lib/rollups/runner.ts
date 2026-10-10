// Runs the background rollups. A job scans its source table in primary-key
// chunks (each its own short query under a statement timeout, so nothing
// holds a long scan or lock), accumulates in memory, then replaces its result
// table and its rollup_runs row in one transaction. An advisory lock per job
// keeps two instances from computing the same rollup at once.
import {
  cmsServiceTypes,
  cmsTopReferred,
  facilityTypes,
  planChunks,
  zipLocationCounts,
  type Accumulator,
} from "./core";

// Rows held in memory per query; jobs run one at a time to keep this bounded.
export const CHUNK_ROWS = 100_000;
const CHUNK_TIMEOUT = "30s";
const DAY_MS = 24 * 60 * 60 * 1000;
// A "running" row older than this belongs to a process that died.
const STALE_RUN_MS = 3 * 60 * 60 * 1000;

export interface RollupJob {
  name: string;
  label: string;
  source: string;
  columns: string[];
  resultTable: string;
  resultColumns: string[];
  intervalMs: number;
  accumulator: () => Accumulator<any, any>;
}

export const ROLLUP_JOBS: RollupJob[] = [
  {
    name: "geo_zip_location_counts",
    label: "Provider locations per ZIP",
    source: "provider_locations",
    columns: ["zip", "location_type"],
    resultTable: "rollup_zip_locations",
    resultColumns: ["zip5", "practice_locations", "all_locations"],
    intervalMs: DAY_MS,
    accumulator: zipLocationCounts,
  },
  {
    name: "cms_service_types",
    label: "Medicare utilization by service type",
    source: "provider_service_utilization",
    columns: ["npi", "service_type", "data_year", "total_services", "total_unique_benes", "total_medicare_payment_amt", "average_medicare_payment_amt"],
    resultTable: "rollup_cms_service_types",
    resultColumns: ["data_year", "service_type", "provider_count", "total_services", "total_payments", "total_beneficiaries"],
    intervalMs: DAY_MS,
    accumulator: cmsServiceTypes,
  },
  {
    name: "cms_top_referred",
    label: "Most-referred-to providers",
    source: "cms_referrals",
    columns: ["npi", "referred_to_npi", "total_referrals", "data_year"],
    resultTable: "rollup_cms_top_referred",
    resultColumns: ["data_year", "referred_to_npi", "total_referrals", "referring_providers"],
    intervalMs: DAY_MS,
    accumulator: () => cmsTopReferred(500),
  },
  {
    name: "facility_types",
    label: "Medicare facility datasets",
    source: "medicare_facilities",
    columns: ["facility_type", "state", "data_year"],
    resultTable: "rollup_facility_types",
    resultColumns: ["facility_type", "record_count", "state_count", "latest_year"],
    intervalMs: DAY_MS,
    accumulator: facilityTypes,
  },
];

export const jobByName = (name: string) => ROLLUP_JOBS.find((j) => j.name === name) || null;

export interface RunRow {
  job: string;
  status: string;
  started_at: Date | null;
  last_success_at: Date | null;
}

/** Jobs that should start now: never succeeded, or last success older than the interval, and not running. */
export function dueJobs(runs: RunRow[], now = Date.now(), jobs = ROLLUP_JOBS): RollupJob[] {
  const byJob = new Map(runs.map((r) => [r.job, r]));
  return jobs.filter((j) => {
    const r = byJob.get(j.name);
    if (!r) return true;
    const running = r.status === "running" && r.started_at && now - new Date(r.started_at).getTime() < STALE_RUN_MS;
    if (running) return false;
    return !r.last_success_at || now - new Date(r.last_success_at).getTime() >= j.intervalMs;
  });
}

function lockKey(name: string): number {
  let h = 0;
  for (const ch of `rollup:${name}`) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0;
  return h;
}

async function insertBatches(client: any, table: string, columns: string[], rows: any[]) {
  for (let i = 0; i < rows.length; i += 1000) {
    const part = rows.slice(i, i + 1000);
    const values: unknown[] = [];
    const tuples = part.map((r, j) => {
      for (const c of columns) values.push(r[c]);
      return `(${columns.map((_, k) => `$${j * columns.length + k + 1}`).join(", ")})`;
    });
    await client.query(`INSERT INTO ${table} (${columns.join(", ")}) VALUES ${tuples.join(", ")}`, values);
  }
}

export interface RunResult {
  job: string;
  status: "success" | "failed" | "skipped";
  rows_scanned?: number;
  result_rows?: number;
  duration_ms?: number;
  error?: string;
}

/** Runs one job to completion on its own connection. Never throws. */
export async function runRollupJob(pool: any, job: RollupJob, log: Pick<Console, "log" | "warn"> = console): Promise<RunResult> {
  const started = Date.now();
  const client = await pool.connect();
  let locked = false;
  try {
    const { rows: [lock] } = await client.query("SELECT pg_try_advisory_lock($1) AS ok", [lockKey(job.name)]);
    locked = !!lock?.ok;
    if (!locked) return { job: job.name, status: "skipped", error: "already running on another instance" };

    await client.query(
      `INSERT INTO rollup_runs (job, status, started_at, error, progress) VALUES ($1, 'running', now(), NULL, $2)
       ON CONFLICT (job) DO UPDATE SET status = 'running', started_at = now(), error = NULL, progress = EXCLUDED.progress`,
      [job.name, JSON.stringify({ chunk: 0 })],
    );

    await client.query(`SET statement_timeout = '${CHUNK_TIMEOUT}'`);
    const { rows: [bounds] } = await client.query(`SELECT min(id) AS lo, max(id) AS hi FROM ${job.source}`);
    const chunks = planChunks(bounds.lo == null ? null : Number(bounds.lo), bounds.hi == null ? null : Number(bounds.hi), CHUNK_ROWS);
    const acc = job.accumulator();
    let scanned = 0;
    for (let i = 0; i < chunks.length; i += 1) {
      const { lo, hi } = chunks[i];
      const { rows } = await client.query(`SELECT ${job.columns.join(", ")} FROM ${job.source} WHERE id >= $1 AND id < $2`, [lo, hi]);
      acc.add(rows);
      scanned += rows.length;
      if (i % 20 === 19) {
        await client.query("UPDATE rollup_runs SET progress = $2 WHERE job = $1", [job.name, JSON.stringify({ chunk: i + 1, chunks: chunks.length, rows_scanned: scanned })]);
      }
    }
    await client.query("RESET statement_timeout");

    const results = acc.results();
    await client.query("BEGIN");
    await client.query(`DELETE FROM ${job.resultTable}`);
    await insertBatches(client, job.resultTable, job.resultColumns, results);
    const duration = Date.now() - started;
    await client.query(
      `UPDATE rollup_runs SET status = 'success', finished_at = now(), last_success_at = now(), rows_scanned = $2,
         rows_skipped = $3, result_rows = $4, duration_ms = $5, progress = NULL, error = NULL WHERE job = $1`,
      [job.name, scanned, acc.skipped(), results.length, duration],
    );
    await client.query("COMMIT");
    log.log(`[rollups] ${job.name}: ${scanned.toLocaleString("en-US")} rows → ${results.length} in ${Math.round(duration / 1000)}s`);
    return { job: job.name, status: "success", rows_scanned: scanned, result_rows: results.length, duration_ms: duration };
  } catch (e: any) {
    await client.query("ROLLBACK").catch(() => {});
    await client.query("RESET statement_timeout").catch(() => {});
    const error = String(e?.message || e).slice(0, 500);
    await client.query(
      "UPDATE rollup_runs SET status = 'failed', finished_at = now(), error = $2, duration_ms = $3 WHERE job = $1",
      [job.name, error, Date.now() - started],
    ).catch(() => {});
    log.warn(`[rollups] ${job.name} failed:`, error);
    return { job: job.name, status: "failed", error };
  } finally {
    if (locked) await client.query("SELECT pg_advisory_unlock($1)", [lockKey(job.name)]).catch(() => {});
    client.release();
  }
}

// Jobs queued or running in this process. They run one at a time, in the
// background: a scan of the 46M-row facilities table takes minutes, far
// longer than a maintenance tick, and running them together would multiply
// the memory each chunk needs.
const queued: RollupJob[] = [];
const pending = new Set<string>();
let draining: Promise<void> | null = null;

function drain(pool: any): Promise<void> {
  draining ??= (async () => {
    while (queued.length) {
      const job = queued.shift()!;
      try {
        await runRollupJob(pool, job);
      } finally {
        pending.delete(job.name);
      }
    }
  })().finally(() => {
    draining = null;
  });
  return draining;
}

/** Queues the due jobs (or the named ones, when forced) and returns right away. */
export async function startDueRollups(pool: any, opts: { jobs?: string[]; force?: boolean } = {}): Promise<{ started: string[]; running: string[]; notDue: string[] }> {
  const { rows } = await pool.query("SELECT job, status, started_at, last_success_at FROM rollup_runs");
  const wanted = opts.jobs?.length ? ROLLUP_JOBS.filter((j) => opts.jobs!.includes(j.name)) : ROLLUP_JOBS;
  const due = opts.force ? wanted : dueJobs(rows, Date.now(), wanted);
  const started: string[] = [];
  const running: string[] = [];
  for (const job of due) {
    if (pending.has(job.name)) {
      running.push(job.name);
      continue;
    }
    pending.add(job.name);
    queued.push(job);
    started.push(job.name);
  }
  if (started.length) void drain(pool);
  const notDue = wanted.filter((j) => !due.includes(j)).map((j) => j.name);
  return { started, running, notDue };
}

export async function rollupStatus(pool: any) {
  const { rows } = await pool.query(
    "SELECT job, status, started_at, finished_at, last_success_at, rows_scanned, result_rows, duration_ms, progress, error FROM rollup_runs",
  ).catch(() => ({ rows: [] as any[] }));
  const byJob = new Map(rows.map((r: any) => [r.job, r]));
  return ROLLUP_JOBS.map((j) => {
    const row: any = byJob.get(j.name) || { status: "never_run" };
    // Waiting its turn in this process's queue.
    const queuedHere = pending.has(j.name) && row.status !== "running";
    return { job: j.name, label: j.label, ...row, ...(queuedHere ? { status: "queued" } : {}) };
  });
}

/** Tests: wait for queued jobs to finish. */
export async function waitForRollups() {
  await draining;
}
