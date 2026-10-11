// Recovery for lead_list_members rows saved with list_id = NULL.
//
// Until the entity API started rejecting unknown filter fields, the UI wrote
// members as { lead_list_id } — a column that doesn't exist — so every member
// was stored without a list. Members were always inserted in a burst right
// after their list was created (Providers "Save as Lead List", the List
// Builder), so creation time is a reliable way to find the owning list. Members
// added one at a time to an existing list later can't be attributed and are
// left alone, and so are members created when two or more lists were created
// within the window before them: the burst could belong to either.

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

export interface ExistingMember {
  list_id: number;
  npi: string | null;
}

export interface OrphanPlan {
  assignments: OrphanAssignment[];
  /** No list was created within the window before them. */
  unmatched: number[];
  /** More than one list was created within the window before them. */
  ambiguous: number[];
  /** Their NPI is already on the list (linked earlier, or another orphan). */
  duplicates: number[];
}

const toMs = (d: Date | string | null): number | null => {
  if (d == null) return null;
  const ms = new Date(d).getTime();
  return Number.isNaN(ms) ? null : ms;
};

/**
 * Assign each orphan to the one list created at or before it within
 * `windowMs`. Orphans with no such list are unmatched; orphans with several
 * are ambiguous and left alone. An NPI is never added to a list that already
 * has it, whether from `existing` members or an earlier orphan.
 */
export function planOrphanReassignment(
  lists: ListRow[],
  orphans: OrphanRow[],
  windowMs = 5 * 60 * 1000,
  existing: ExistingMember[] = [],
): OrphanPlan {
  const sortedLists = lists
    .map((l) => ({ id: l.id, at: toMs(l.created_date) }))
    .filter((l): l is { id: number; at: number } => l.at != null)
    .sort((a, b) => a.at - b.at);

  const byList = new Map<number, number[]>();
  const seenNpi = new Map<number, Set<string>>();
  for (const m of existing) {
    if (!m.npi) continue;
    const npis = seenNpi.get(m.list_id) ?? new Set<string>();
    npis.add(m.npi);
    seenNpi.set(m.list_id, npis);
  }
  const unmatched: number[] = [];
  const ambiguous: number[] = [];
  const duplicates: number[] = [];

  for (const orphan of orphans) {
    const at = toMs(orphan.created_date);
    if (at == null) {
      unmatched.push(orphan.id);
      continue;
    }
    const candidates = sortedLists.filter((l) => l.at <= at && at - l.at <= windowMs);
    if (candidates.length === 0) {
      unmatched.push(orphan.id);
      continue;
    }
    if (candidates.length > 1) {
      ambiguous.push(orphan.id);
      continue;
    }
    const owner = candidates[0];
    const npis = seenNpi.get(owner.id) ?? new Set<string>();
    const npi = orphan.npi ?? "";
    if (npi && npis.has(npi)) {
      duplicates.push(orphan.id);
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
    ambiguous,
    duplicates,
  };
}
