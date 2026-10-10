// Recovery for lead_list_members rows saved with list_id = NULL.
//
// Until the entity API started rejecting unknown filter fields, the UI wrote
// members as { lead_list_id } — a column that doesn't exist — so every member
// was stored without a list. Members were always inserted in a burst right
// after their list was created (Providers "Save as Lead List", the List
// Builder), so creation time is a reliable way to find the owning list. Members
// added one at a time to an existing list later can't be attributed and are
// left alone.

export interface ListRow {
  id: number;
  name: string | null;
  created_date: Date | string | null;
  member_count: number | null;
}

export interface OrphanRow {
  id: number;
  npi: string | null;
  created_date: Date | string | null;
}

export interface OrphanAssignment {
  listId: number;
  memberIds: number[];
}

export interface OrphanPlan {
  assignments: OrphanAssignment[];
  unmatched: number[];
}

const toMs = (d: Date | string | null): number | null => {
  if (d == null) return null;
  const ms = new Date(d).getTime();
  return Number.isNaN(ms) ? null : ms;
};

/**
 * Assign each orphan to the most recently created list whose creation time is
 * at or before the orphan's, within `windowMs`. Orphans with no such list are
 * reported as unmatched. A member NPI is assigned to a given list at most once.
 */
export function planOrphanReassignment(
  lists: ListRow[],
  orphans: OrphanRow[],
  windowMs = 5 * 60 * 1000,
): OrphanPlan {
  const sortedLists = lists
    .map((l) => ({ id: l.id, at: toMs(l.created_date) }))
    .filter((l): l is { id: number; at: number } => l.at != null)
    .sort((a, b) => a.at - b.at);

  const byList = new Map<number, number[]>();
  const seenNpi = new Map<number, Set<string>>();
  const unmatched: number[] = [];

  for (const orphan of orphans) {
    const at = toMs(orphan.created_date);
    if (at == null) {
      unmatched.push(orphan.id);
      continue;
    }
    let owner: { id: number; at: number } | null = null;
    for (const list of sortedLists) {
      if (list.at > at) break;
      owner = list;
    }
    if (!owner || at - owner.at > windowMs) {
      unmatched.push(orphan.id);
      continue;
    }
    const npis = seenNpi.get(owner.id) ?? new Set<string>();
    const npi = orphan.npi ?? "";
    if (npi && npis.has(npi)) {
      unmatched.push(orphan.id);
      continue;
    }
    npis.add(npi);
    seenNpi.set(owner.id, npis);
    const ids = byList.get(owner.id) ?? [];
    ids.push(orphan.id);
    byList.set(owner.id, ids);
  }

  return {
    assignments: [...byList.entries()].map(([listId, memberIds]) => ({ listId, memberIds })),
    unmatched,
  };
}
