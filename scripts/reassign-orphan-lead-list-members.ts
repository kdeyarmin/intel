// One-time recovery: link lead_list_members rows that were saved with
// list_id = NULL back to the list they were created with. See
// server/lib/leadListOrphans.ts for how ownership is inferred.
//
// Dry run (default) — prints the plan and changes nothing:
//   npx tsx scripts/reassign-orphan-lead-list-members.ts
// Apply after reviewing the plan:
//   npx tsx scripts/reassign-orphan-lead-list-members.ts --apply
// Options: --window-seconds=300  (max gap between list and member creation)
import pg from "pg";
import {
  planOrphanReassignment,
  type ExistingMember,
  type ListRow,
  type OrphanRow,
} from "../server/lib/leadListOrphans";

const apply = process.argv.includes("--apply");
const windowArg = process.argv.find((a) => a.startsWith("--window-seconds="));
const windowSeconds = windowArg ? Number(windowArg.split("=")[1]) : 300;
// NaN would make every age check false and assign orphans regardless of age.
if (!Number.isFinite(windowSeconds) || windowSeconds <= 0) {
  console.error(`--window-seconds must be a positive number of seconds (got "${windowArg?.split("=")[1]}").`);
  process.exit(1);
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const lists = (await client.query<ListRow>(
      "SELECT id, name, created_date, member_count FROM lead_lists ORDER BY created_date",
    )).rows;
    const orphans = (await client.query<OrphanRow>(
      "SELECT id, npi, created_date FROM lead_list_members WHERE list_id IS NULL ORDER BY created_date",
    )).rows;

    console.log(`Lists: ${lists.length}. Members with no list: ${orphans.length}.`);
    if (orphans.length === 0) return;

    // NPIs already linked to a list, so an orphan never duplicates a member
    // that was added correctly later. Bounded by the orphans' NPIs (indexed).
    const orphanNpis = [...new Set(orphans.map((o) => o.npi).filter((n): n is string => !!n))];
    const existing = (await client.query<ExistingMember>(
      "SELECT list_id, npi FROM lead_list_members WHERE list_id IS NOT NULL AND npi = ANY($1::text[])",
      [orphanNpis],
    )).rows;

    const plan = planOrphanReassignment(lists, orphans, windowSeconds * 1000, existing);
    const listById = new Map(lists.map((l) => [l.id, l]));
    console.log(`\nProposed links (window ${windowSeconds}s):`);
    for (const { listId, memberIds } of plan.assignments) {
      const list = listById.get(listId)!;
      const recorded = list.member_count ?? 0;
      const flag = recorded !== memberIds.length ? `  <-- list says ${recorded}` : "";
      console.log(`  #${listId} "${list.name}": ${memberIds.length} member(s)${flag}`);
    }
    console.log(`\nLeft unlinked:`);
    console.log(`  no list created within the window before them: ${plan.unmatched.length}`);
    console.log(`  more than one list created in that window (ambiguous): ${plan.ambiguous.length}`);
    console.log(`  NPI already on the list: ${plan.duplicates.length}`);
    if (plan.ambiguous.length > 0) {
      console.log("  (Saves insert members within seconds of the list; a smaller --window-seconds resolves most ambiguity.)");
    }

    if (!apply) {
      console.log("\nDry run only. Re-run with --apply to write these links.");
      return;
    }

    await client.query("BEGIN");
    for (const { listId, memberIds } of plan.assignments) {
      await client.query(
        "UPDATE lead_list_members SET list_id = $1, updated_date = now() WHERE id = ANY($2::int[]) AND list_id IS NULL",
        [listId, memberIds],
      );
      // Make the stored count match what the list now actually holds.
      await client.query(
        "UPDATE lead_lists SET member_count = (SELECT count(*) FROM lead_list_members WHERE list_id = $1), updated_date = now() WHERE id = $1",
        [listId],
      );
    }
    await client.query("COMMIT");
    console.log(`\nLinked ${plan.assignments.reduce((n, a) => n + a.memberIds.length, 0)} member(s).`);
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
