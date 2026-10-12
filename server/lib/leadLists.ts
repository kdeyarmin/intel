// Creating a lead list and its members in one go, with member_count kept equal
// to the members actually stored. The caller owns the transaction: pass a
// client that has already run BEGIN so a failure leaves nothing behind.

// Same cap as the browser's saveProvidersToLeadList (leadListService.js).
export const MAX_LEAD_LIST_MEMBERS = 5000;

export interface NewLeadList {
  name: string;
  description?: string | null;
  npis: string[];
  createdBy: string;
  filterCriteria?: Record<string, unknown> | null;
  /** The organization that owns the list: lists are scoped to it, so one without cannot be seen. */
  orgId: number;
}

export interface CreatedLeadList {
  id: number;
  name: string;
  memberCount: number;
  truncated: number;
}

export function uniqueNpis(npis: unknown[]): string[] {
  const seen = new Set<string>();
  for (const n of npis || []) {
    const s = typeof n === "string" || typeof n === "number" ? String(n).trim() : "";
    if (s) seen.add(s);
  }
  return [...seen];
}

export async function createLeadListWithMembers(client: any, input: NewLeadList): Promise<CreatedLeadList> {
  const name = input.name.trim().slice(0, 255);
  if (!name) throw new Error("A lead list needs a name.");
  const all = uniqueNpis(input.npis);
  const npis = all.slice(0, MAX_LEAD_LIST_MEMBERS);

  const { rows } = await client.query(
    `INSERT INTO lead_lists (name, description, filter_criteria, member_count, created_by, org_id)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, name`,
    [name, input.description ?? null, input.filterCriteria ?? null, npis.length, input.createdBy, input.orgId],
  );
  const list = rows[0];
  if (npis.length) {
    await client.query(
      `INSERT INTO lead_list_members (list_id, npi, status, added_by)
       SELECT $1, npi, 'New', $2 FROM unnest($3::varchar[]) AS t(npi)`,
      [list.id, input.createdBy, npis],
    );
  }
  return { id: Number(list.id), name: list.name, memberCount: npis.length, truncated: all.length - npis.length };
}
