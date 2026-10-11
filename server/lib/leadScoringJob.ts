// Computes lead_scores for every individual provider with a practice
// location in the configured states (server/lib/leadScoring.ts has the
// rules). Runs in the background like a rollup: provider_locations is read
// in primary-key chunks under a statement timeout, candidates are then
// looked up in batches of NPIs, and each batch's scores replace the old rows
// in one short transaction. One run at a time per database (advisory lock);
// progress and the last result live in rollup_runs under job 'lead_scores'.
import { planChunks } from "./rollups/core";
import { getGeoIndex, zipToCounty, type GeoIndex } from "./geo";
import { specialtyGroupFor } from "./specialtyGroups";
import { recordAudit } from "./audit";
import {
  normalizeRules,
  territoryFromRows,
  scoreProvider,
  totalWeight,
  type ScoringInput,
  type ScoringRule,
  type ScoringRuleRow,
  type Territory,
} from "./leadScoring";

export const LEAD_SCORING_JOB = "lead_scores";
// Re-scored by the maintenance worker when the last success is older than this.
export const LEAD_SCORING_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const CHUNK_ROWS = 100_000;
const CHUNK_TIMEOUT = "30s";
const BATCH = 500;
const LOCK_KEY = "lead_scoring";

export interface LeadScoringResult {
  status: "success" | "failed" | "skipped";
  territory: Territory;
  candidates: number;
  scored: number;
  /** Older scores a complete run removed (providers outside the territory now, or no longer scorable). */
  removed?: number;
  duration_ms: number;
  error?: string;
}

type Loc = { state: string; zip5: string | null; city: string | null };

async function runRow(client: any, status: string, fields: Record<string, unknown>) {
  await client.query(
    `INSERT INTO rollup_runs (job, status, started_at, error, progress) VALUES ($1, $2, now(), NULL, $3)
     ON CONFLICT (job) DO UPDATE SET status = EXCLUDED.status, started_at = now(), error = NULL, progress = EXCLUDED.progress`,
    [LEAD_SCORING_JOB, status, JSON.stringify(fields)],
  ).catch(() => {});
}

/** Practice locations in the scored states, by NPI, from a primary-key walk of provider_locations. */
async function collectCandidates(client: any, states: string[], onProgress: (p: Record<string, unknown>) => Promise<void>): Promise<Map<string, Loc[]>> {
  await client.query(`SET statement_timeout = '${CHUNK_TIMEOUT}'`);
  const { rows: [bounds] } = await client.query("SELECT min(id) AS lo, max(id) AS hi FROM provider_locations");
  const chunks = planChunks(bounds?.lo == null ? null : Number(bounds.lo), bounds?.hi == null ? null : Number(bounds.hi), CHUNK_ROWS);
  const byNpi = new Map<string, Loc[]>();
  for (let i = 0; i < chunks.length; i += 1) {
    const { lo, hi } = chunks[i];
    const { rows } = await client.query(
      `SELECT npi, state, left(zip, 5) AS zip5, city FROM provider_locations
        WHERE id >= $1 AND id < $2 AND state = ANY($3) AND npi IS NOT NULL
          AND (location_type IS NULL OR location_type <> 'Mailing')`,
      [lo, hi, states],
    );
    for (const r of rows) {
      const list = byNpi.get(r.npi) || [];
      list.push({ state: String(r.state).toUpperCase(), zip5: r.zip5 || null, city: r.city || null });
      byNpi.set(r.npi, list);
    }
    if (i % 20 === 19) await onProgress({ phase: "locations", chunk: i + 1, chunks: chunks.length, candidates: byNpi.size });
  }
  await client.query("RESET statement_timeout");
  return byNpi;
}

const truthy = (v: unknown) => v === true || v === "t" || v === "true" || v === "Y";

/** Looks up one batch of NPIs and scores the individual, active ones. */
export async function scoreBatch(client: any, npis: string[], locs: Map<string, Loc[]>, rules: ScoringRule[], geo: GeoIndex | null) {
  const [providers, taxonomies, utilization, ordering, affiliations] = await Promise.all([
    client.query("SELECT npi, entity_type, email, phone, status FROM providers WHERE npi = ANY($1)", [npis]),
    client.query("SELECT npi, taxonomy_code, taxonomy_description, is_primary FROM provider_taxonomies WHERE npi = ANY($1)", [npis]),
    client.query("SELECT DISTINCT ON (npi) npi, data_year, benes, services FROM cms_physician_by_provider WHERE npi = ANY($1) ORDER BY npi, data_year DESC", [npis]),
    client.query("SELECT npi, partb, dme, hha, pmd, hospice FROM cms_order_referring WHERE npi = ANY($1)", [npis]),
    client.query("SELECT npi, count(*)::int AS n FROM cms_facility_affiliation WHERE npi = ANY($1) GROUP BY npi", [npis]),
  ]);
  const taxByNpi = new Map<string, any[]>();
  for (const t of taxonomies.rows) (taxByNpi.get(t.npi) || taxByNpi.set(t.npi, []).get(t.npi)!).push(t);
  const util = new Map<string, any>(utilization.rows.map((r: any) => [r.npi, r]));
  const or = new Map<string, any>(ordering.rows.map((r: any) => [r.npi, r]));
  const affil = new Map<string, number>(affiliations.rows.map((r: any) => [r.npi, Number(r.n)]));

  const results = [];
  for (const p of providers.rows) {
    if (String(p.entity_type || "").toLowerCase() !== "individual") continue;
    if (/deactiv/i.test(String(p.status || ""))) continue;
    const taxes = taxByNpi.get(p.npi) || [];
    const primary = taxes.find((t) => truthy(t.is_primary)) || taxes[0];
    const group = primary ? specialtyGroupFor(primary.taxonomy_code, primary.taxonomy_description) : null;
    const u = util.get(p.npi) as any;
    const o = or.get(p.npi) as any;
    const input: ScoringInput = {
      npi: p.npi,
      specialtyGroup: group?.key ?? null,
      specialtyLabel: group ? (group.key === "other" ? primary?.taxonomy_description ?? null : group.label) : null,
      beneficiaries: u?.benes == null ? null : Number(u.benes),
      services: u?.services == null ? null : Number(u.services),
      utilizationYear: u?.data_year ?? null,
      orderReferring: o ? { partb: truthy(o.partb), dme: truthy(o.dme), hha: truthy(o.hha), pmd: truthy(o.pmd), hospice: truthy(o.hospice) } : null,
      locations: (locs.get(p.npi) || []).map((l) => ({
        state: l.state,
        city: l.city,
        county_fips: geo && l.zip5 ? zipToCounty(geo, l.zip5)?.fips ?? null : null,
      })),
      affiliations: affil.get(p.npi) ?? 0,
      hasEmail: !!(p.email && String(p.email).trim()),
      hasPhone: !!(p.phone && String(p.phone).trim()),
    };
    results.push(scoreProvider(input, rules));
  }
  return results;
}

async function writeScores(client: any, scores: ReturnType<typeof scoreProvider>[], now: Date, version: string) {
  if (scores.length === 0) return;
  await client.query("BEGIN");
  try {
    await client.query("DELETE FROM lead_scores WHERE npi = ANY($1)", [scores.map((s) => s.npi)]);
    await client.query(
      `INSERT INTO lead_scores (npi, score, outreach_potential, referral_likelihood, data_completeness, last_calculated, details, created_date, updated_date)
       SELECT npi, score, outreach_potential, referral_likelihood, data_completeness, $6, details, $6, $6
         FROM unnest($1::text[], $2::float8[], $3::float8[], $4::float8[], $5::float8[], $7::jsonb[]) AS t(npi, score, outreach_potential, referral_likelihood, data_completeness, details)`,
      [
        scores.map((s) => s.npi),
        scores.map((s) => s.score),
        scores.map((s) => s.outreach_potential),
        scores.map((s) => s.referral_likelihood),
        scores.map((s) => s.data_completeness),
        now,
        scores.map((s) => JSON.stringify({ score_date: now.toISOString(), score_breakdown: s.breakdown, reasons: s.reasons, version })),
      ],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  }
}

const STALE_DELETE_BATCH = 20_000;

/**
 * After a complete run, drops the scores it didn't rewrite: providers the territory no
 * longer covers, ones no longer scorable (deactivated, now an organization), and scores
 * the old in-browser calculation left behind. Without this they stay in lead_scores and
 * keep ranking as scored leads while the pages say providers outside the territory are
 * Unscored. In batches, so no one statement holds locks for long.
 */
export async function removeStaleScores(client: any, runStart: Date, batch = STALE_DELETE_BATCH): Promise<number> {
  let removed = 0;
  for (;;) {
    const res = await client.query(
      "DELETE FROM lead_scores WHERE id IN (SELECT id FROM lead_scores WHERE last_calculated IS NULL OR last_calculated < $1 LIMIT $2)",
      [runStart, batch],
    );
    const n = Number(res?.rowCount ?? 0);
    removed += n;
    if (n < batch) return removed;
  }
}

/**
 * One full scoring pass. `rules` are scoring_rules rows; a run with no
 * configured state fails rather than scoring the whole registry.
 */
export async function runLeadScoring(
  pool: any,
  ruleRows: ScoringRuleRow[],
  opts: { log?: Pick<Console, "log" | "warn">; userEmail?: string | null; now?: () => Date } = {},
): Promise<LeadScoringResult> {
  const log = opts.log ?? console;
  const now = opts.now ?? (() => new Date());
  const started = Date.now();
  const rules = normalizeRules(ruleRows);
  const territory = territoryFromRows(ruleRows);
  const base = { territory, candidates: 0, scored: 0 };
  if (territory.states.length === 0) {
    return { status: "failed", ...base, duration_ms: 0, error: "Configure at least one state in the Geographic Priority rule's conditions." };
  }
  if (rules.length === 0) {
    return { status: "failed", ...base, duration_ms: 0, error: "No enabled scoring rules with a weight." };
  }
  let client: any;
  try {
    client = await pool.connect();
  } catch (e: any) {
    return { status: "failed", ...base, duration_ms: Date.now() - started, error: `couldn't get a database connection: ${String(e?.message || e).slice(0, 300)}` };
  }
  let locked = false;
  try {
    const { rows: [lock] } = await client.query("SELECT pg_try_advisory_lock(hashtext($1)) AS ok", [LOCK_KEY]);
    locked = !!lock?.ok;
    if (!locked) return { status: "skipped", ...base, duration_ms: Date.now() - started, error: "already running on another instance" };
    await runRow(client, "running", { phase: "locations", territory });
    // Every score this run writes is stamped at or after this; anything older is left over.
    const runStart = now();

    const geo = await getGeoIndex(pool).catch(() => null);
    const locs = await collectCandidates(client, territory.states, (p) =>
      client.query("UPDATE rollup_runs SET progress = $2 WHERE job = $1", [LEAD_SCORING_JOB, JSON.stringify({ ...p, territory })]).catch(() => {}));
    const npis = [...locs.keys()];
    const version = `${totalWeight(rules)}%:${rules.map((r) => `${r.rule_type}=${r.weight}`).join(",")}`;
    let scored = 0;
    for (let i = 0; i < npis.length; i += BATCH) {
      const batch = npis.slice(i, i + BATCH);
      const scores = await scoreBatch(client, batch, locs, rules, geo && geo.counties.size > 0 ? geo : null);
      await writeScores(client, scores, now(), version);
      scored += scores.length;
      if ((i / BATCH) % 20 === 19) {
        await client.query("UPDATE rollup_runs SET progress = $2 WHERE job = $1",
          [LEAD_SCORING_JOB, JSON.stringify({ phase: "scoring", done: Math.min(i + BATCH, npis.length), candidates: npis.length, scored, territory })]).catch(() => {});
      }
    }
    // Reached only when every batch was written (a failed batch ends the run in the catch below).
    const removed = await removeStaleScores(client, runStart);
    const duration = Date.now() - started;
    await client.query(
      `UPDATE rollup_runs SET status = 'success', finished_at = now(), last_success_at = now(), rows_scanned = $2,
         rows_skipped = $3, result_rows = $4, duration_ms = $5, progress = $6, error = NULL WHERE job = $1`,
      [LEAD_SCORING_JOB, npis.length, npis.length - scored, scored, duration, JSON.stringify({ territory })],
    ).catch(() => {});
    await recordAudit({
      event_type: "scoring_run",
      user_email: opts.userEmail ?? "system@maintenance",
      action: "Recalculate Scores",
      entity_type: "LeadScore",
      details: { scored, removed, candidates: npis.length, states: territory.states, counties: territory.counties.length, total_weight: totalWeight(rules), duration_ms: duration },
    });
    log.log(`[leadScoring] Scored ${scored.toLocaleString("en-US")} of ${npis.length.toLocaleString("en-US")} providers in ${territory.states.join(", ")} in ${Math.round(duration / 1000)}s${removed ? `; removed ${removed.toLocaleString("en-US")} older scores` : ""}`);
    return { status: "success", territory, candidates: npis.length, scored, removed, duration_ms: duration };
  } catch (e: any) {
    await client.query("ROLLBACK").catch(() => {});
    await client.query("RESET statement_timeout").catch(() => {});
    const error = String(e?.message || e).slice(0, 500);
    await client.query("UPDATE rollup_runs SET status = 'failed', finished_at = now(), error = $2, duration_ms = $3 WHERE job = $1",
      [LEAD_SCORING_JOB, error, Date.now() - started]).catch(() => {});
    log.warn("[leadScoring] failed:", error);
    return { status: "failed", ...base, duration_ms: Date.now() - started, error };
  } finally {
    if (locked) await client.query("SELECT pg_advisory_unlock(hashtext($1))", [LOCK_KEY]).catch(() => {});
    client.release();
  }
}

// ─── Background execution ────────────────────────────────────────────────────

let running: Promise<LeadScoringResult> | null = null;

/** Starts a run in the background (one per process); returns right away. */
export function startLeadScoring(pool: any, ruleRows: ScoringRuleRow[], opts: { userEmail?: string | null } = {}): { started: boolean; reason?: string } {
  if (running) return { started: false, reason: "already running" };
  running = runLeadScoring(pool, ruleRows, opts)
    .catch((e): LeadScoringResult => ({ status: "failed", territory: { states: [], counties: [] }, candidates: 0, scored: 0, duration_ms: 0, error: String(e?.message || e) }))
    .finally(() => { running = null; });
  return { started: true };
}

export const isLeadScoringRunning = () => running != null;

/** Tests: wait for a background run to finish. */
export async function waitForLeadScoring(): Promise<LeadScoringResult | null> {
  return running ? await running : null;
}

export interface LeadScoringStatus {
  running: boolean;
  status: string | null;
  started_at: string | null;
  finished_at: string | null;
  last_success_at: string | null;
  candidates: number | null;
  scored: number | null;
  duration_ms: number | null;
  progress: Record<string, unknown> | null;
  error: string | null;
  scored_total: number | null;
}

/**
 * Whether some process holds the scoring lock, i.e. a run is really in
 * progress. A "running" row alone proves nothing: it outlives a restart that
 * killed the run, while the lock goes with the connection.
 */
async function scoringLockHeld(pool: any): Promise<boolean> {
  let client: any;
  try {
    client = await pool.connect();
  } catch {
    return true; // can't tell; don't declare a live run dead
  }
  let acquired = false;
  try {
    const { rows: [r] } = await client.query("SELECT pg_try_advisory_lock(hashtext($1)) AS ok", [LOCK_KEY]);
    if (!r?.ok) return true;
    acquired = true;
    await client.query("SELECT pg_advisory_unlock(hashtext($1))", [LOCK_KEY]);
    acquired = false;
    return false;
  } catch {
    return true;
  } finally {
    // A connection that may still hold the lock is destroyed, not pooled.
    client.release(acquired ? true : undefined);
  }
}

/**
 * A run a restart killed leaves its rollup_runs row "running" for good, which
 * would disable the Recalculate button and keep the weekly refresh from ever
 * starting. When no process holds the lock the row is marked failed, so the
 * next run (or the weekly worker) starts normally. Returns whether it changed one.
 */
export async function settleInterruptedLeadScoring(pool: any): Promise<boolean> {
  if (isLeadScoringRunning()) return false;
  const { rows } = await pool.query("SELECT status FROM rollup_runs WHERE job = $1", [LEAD_SCORING_JOB]).catch(() => ({ rows: [] as any[] }));
  if (rows[0]?.status !== "running") return false;
  if (await scoringLockHeld(pool)) return false;
  const res = await pool.query(
    "UPDATE rollup_runs SET status = 'failed', finished_at = now(), error = $2 WHERE job = $1 AND status = 'running'",
    [LEAD_SCORING_JOB, "Interrupted: the server restarted while this run was in progress."],
  ).catch(() => null);
  return (res?.rowCount ?? 0) > 0;
}

/** The last run (rollup_runs) and how many providers currently have a score. */
export async function leadScoringStatus(pool: any): Promise<LeadScoringStatus> {
  await settleInterruptedLeadScoring(pool).catch(() => false);
  const { rows } = await pool.query("SELECT * FROM rollup_runs WHERE job = $1", [LEAD_SCORING_JOB]).catch(() => ({ rows: [] as any[] }));
  const r = rows[0];
  const { rows: counts } = await pool.query("SELECT count(*)::int AS n FROM lead_scores WHERE score IS NOT NULL").catch(() => ({ rows: [] as any[] }));
  return {
    running: isLeadScoringRunning() || r?.status === "running",
    status: r?.status ?? null,
    started_at: r?.started_at ?? null,
    finished_at: r?.finished_at ?? null,
    last_success_at: r?.last_success_at ?? null,
    candidates: r?.rows_scanned == null ? null : Number(r.rows_scanned),
    scored: r?.result_rows == null ? null : Number(r.result_rows),
    duration_ms: r?.duration_ms == null ? null : Number(r.duration_ms),
    progress: r?.progress ?? null,
    error: r?.error ?? null,
    scored_total: counts[0]?.n == null ? null : Number(counts[0].n),
  };
}

/** Whether the weekly refresh is due (never run, or last success older than the interval). */
export function leadScoringDue(status: Pick<LeadScoringStatus, "running" | "last_success_at">, now = Date.now(), intervalMs = LEAD_SCORING_INTERVAL_MS): boolean {
  if (status.running) return false;
  if (!status.last_success_at) return true;
  const t = new Date(status.last_success_at).getTime();
  return !Number.isFinite(t) || now - t >= intervalMs;
}
