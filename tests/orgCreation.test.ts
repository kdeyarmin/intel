/** createOrgWithOwner: a taken slug is answered with a new suffix inside the same transaction, never an aborted one. */
import { describe, expect, it, vi } from "vitest";
import { createOrgWithOwner } from "../server/lib/orgs";

type Call = [string, unknown[]];

function fakeClient(takenSlugs: Set<string>) {
  const calls: Call[] = [];
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    calls.push([sql, params]);
    if (/INSERT INTO organizations/.test(sql)) {
      const slug = String(params[1]);
      // ON CONFLICT (slug) DO NOTHING answers "taken" with no row, and leaves the transaction usable.
      if (takenSlugs.has(slug)) return { rows: [] };
      takenSlugs.add(slug);
      return { rows: [{ id: 7, name: params[0], slug, status: "trial", plan_code: null, seat_limit: 3, territory: {}, trial_ends_at: new Date() }] };
    }
    return { rows: [] };
  });
  return { client: { query }, calls };
}

describe("createOrgWithOwner", () => {
  it("uses the plain slug when it is free, and makes the person its owner", async () => {
    const { client, calls } = fakeClient(new Set());
    const org = await createOrgWithOwner(client, { name: "Sunny Hill Personal Care, LLC", ownerUserId: 5 });
    expect(org.slug).toBe("sunny-hill-personal-care-llc");
    const member = calls.find(([sql]) => /INSERT INTO organization_members/.test(sql))!;
    expect(member[1]).toEqual([7, 5]);
    expect(calls[0][0]).toMatch(/ON CONFLICT \(slug\) DO NOTHING/);
  });

  it("tries a suffixed slug in the same transaction when the name is taken (no exception to abort it)", async () => {
    const { client, calls } = fakeClient(new Set(["sunny-hill"]));
    const org = await createOrgWithOwner(client, { name: "Sunny Hill", ownerUserId: 5 });
    expect(org.slug).toMatch(/^sunny-hill-[a-z0-9]{1,4}$/);
    const inserts = calls.filter(([sql]) => /INSERT INTO organizations/.test(sql));
    expect(inserts).toHaveLength(2);
    // Nothing was rolled back or savepointed: the failed attempt left no state to undo.
    expect(calls.some(([sql]) => /ROLLBACK|SAVEPOINT/i.test(sql))).toBe(false);
  });

  it("gives up with a plain error after eight taken slugs", async () => {
    const client = { query: vi.fn(async () => ({ rows: [] })) };
    await expect(createOrgWithOwner(client, { name: "Sunny Hill", ownerUserId: 5 })).rejects.toThrow("Unable to create the organization");
    expect(client.query).toHaveBeenCalledTimes(8);
  });
});
