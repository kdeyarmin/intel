import { base44 } from '@/api/base44Client';

export const MAX_MEMBERS_PER_SAVE = 5000;
const CHUNK_SIZE = 500;

function uniqueNpis(npis) {
  return [...new Set((npis || []).filter(Boolean).map(String))];
}

const MEMBER_PAGE = 5000;

/** Every member row on a list, however long it is, read in id order. */
export async function listMembers(listId) {
  const rows = [];
  let lastId = 0;
  for (;;) {
    const page = await base44.entities.LeadListMember.filter(
      { list_id: listId, id: { $gt: lastId } }, 'id', MEMBER_PAGE,
    );
    rows.push(...page);
    if (page.length < MEMBER_PAGE) return rows;
    lastId = page[page.length - 1].id;
  }
}

/** Every member NPI on a list (one entry per stored row), read in id order. */
export async function listMemberNpis(listId) {
  return (await listMembers(listId)).map((m) => String(m.npi));
}

/**
 * Add providers to a lead list, creating the list first when `listId` is not
 * given. Skips NPIs already on the list and keeps `member_count` equal to the
 * number of members actually stored.
 *
 * @returns {Promise<{ list: object, added: number, skipped: number, truncated: number }>}
 */
export async function saveProvidersToLeadList({
  listId,
  name,
  description = '',
  filterCriteria = null,
  npis,
}) {
  const unique = uniqueNpis(npis);
  const capped = unique.slice(0, MAX_MEMBERS_PER_SAVE);
  const truncated = unique.length - capped.length;

  let list;
  let existingRows = [];
  if (listId) {
    const [found] = await base44.entities.LeadList.filter({ id: Number(listId) }, undefined, 1);
    if (!found) throw new Error('That lead list no longer exists.');
    list = found;
    // All of them, however long the list: a capped read would miss older
    // members (re-adding them) and undercount the list.
    existingRows = await listMemberNpis(list.id);
  } else {
    if (!name?.trim()) throw new Error('Please name the list.');
    list = await base44.entities.LeadList.create({
      name: name.trim(),
      description,
      filter_criteria: filterCriteria,
      member_count: 0,
    });
  }

  const existing = new Set(existingRows);
  const toAdd = capped.filter((npi) => !existing.has(npi));
  try {
    for (let i = 0; i < toAdd.length; i += CHUNK_SIZE) {
      await base44.entities.LeadListMember.bulkCreate(
        toAdd.slice(i, i + CHUNK_SIZE).map((npi) => ({ list_id: list.id, npi, status: 'New' })),
      );
    }
  } catch (e) {
    // A failed chunk commits its predecessors, so the arithmetic below would
    // lie: recompute the count from what is actually stored, then rethrow.
    const actual = await listMemberNpis(list.id).catch(() => null);
    if (actual && actual.length !== list.member_count) {
      await base44.entities.LeadList.update(list.id, { member_count: actual.length }).catch(() => {});
    }
    throw e;
  }

  const memberCount = existingRows.length + toAdd.length;
  if (memberCount !== list.member_count) {
    list = await base44.entities.LeadList.update(list.id, { member_count: memberCount });
  }

  return { list, added: toAdd.length, skipped: capped.length - toAdd.length, truncated };
}
