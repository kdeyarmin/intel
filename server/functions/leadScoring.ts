// getLeadScoringStatus and recalculateLeadScores (both admin-only): the
// Scoring Rules page's view of the server-side scoring job.
import { asc } from "drizzle-orm";
import { db, pool } from "../db";
import { scoringRules } from "../db/schema";
import { DEFAULT_SCORING_RULES, LEGACY_RULE_DESCRIPTIONS, normalizeRules, territoryFromRows, totalWeight } from "../lib/leadScoring";
import { leadScoringStatus, startLeadScoring } from "../lib/leadScoringJob";

/**
 * The scoring_rules rows, seeded with the defaults when the table is empty
 * and repaired when a row was saved without its rule_type (the page once
 * wrote columns that didn't exist, so every score came out 0).
 */
export async function ensureScoringRules() {
  let rows = await db.select().from(scoringRules).orderBy(asc(scoringRules.id));
  if (rows.length === 0) {
    await db.insert(scoringRules).values(DEFAULT_SCORING_RULES.map((r) => ({
      name: r.name,
      rule_type: r.rule_type,
      weight: r.weight,
      description: r.description,
      conditions: "conditions" in r ? (r as any).conditions : null,
      enabled: true,
    })));
    rows = await db.select().from(scoringRules).orderBy(asc(scoringRules.id));
  }
  const { eq } = await import("drizzle-orm");
  for (const row of rows) {
    if (row.rule_type) continue;
    const type = row.description ? LEGACY_RULE_DESCRIPTIONS[row.description] : undefined;
    const def = DEFAULT_SCORING_RULES.find((d) => d.rule_type === type);
    if (!def) continue;
    await db.update(scoringRules).set({ name: def.name, rule_type: def.rule_type, updated_date: new Date() }).where(eq(scoringRules.id, row.id));
    row.rule_type = def.rule_type;
    row.name = def.name;
  }
  return rows;
}

export async function handleGetLeadScoringStatus() {
  const rows = await ensureScoringRules();
  const rules = normalizeRules(rows as any);
  return {
    rules: rows,
    territory: territoryFromRows(rows as any),
    total_weight: totalWeight(rules),
    job: await leadScoringStatus(pool),
  };
}

export async function handleRecalculateLeadScores(_payload: any, user?: { email?: string | null } | null) {
  const rows = await ensureScoringRules();
  const territory = territoryFromRows(rows as any);
  if (territory.states.length === 0) {
    throw Object.assign(new Error("Configure at least one state in the Geographic Priority rule's conditions before scoring."), { status: 400 });
  }
  const started = startLeadScoring(pool, rows as any, { userEmail: user?.email ?? null });
  return { success: true, ...started, territory, job: await leadScoringStatus(pool) };
}
