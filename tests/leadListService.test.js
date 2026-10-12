/**
 * saveProvidersToLeadList: the shared path behind "Save as Lead List" /
 * "Add to lead list". Members must be written with the real `list_id` column,
 * de-duplicated against the list, and member_count must match what's stored.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

const { LeadList, LeadListMember } = vi.hoisted(() => ({
  LeadList: { create: vi.fn(), filter: vi.fn(), update: vi.fn() },
  LeadListMember: { filter: vi.fn(), bulkCreate: vi.fn() },
}));

vi.mock('@/api/base44Client', () => ({
  base44: { entities: { LeadList, LeadListMember } },
}));

import { saveProvidersToLeadList, listMembers, MAX_MEMBERS_PER_SAVE } from '../src/components/leadlists/leadListService';

beforeEach(() => {
  vi.clearAllMocks();
  LeadList.update.mockImplementation(async (id, data) => ({ id, name: 'L', ...data }));
  LeadListMember.bulkCreate.mockImplementation(async (rows) => rows);
});

describe('saveProvidersToLeadList', () => {
  it('creates a new list and stores every member with list_id', async () => {
    LeadList.create.mockResolvedValue({ id: 7, name: 'Cardiology', member_count: 0 });
    const result = await saveProvidersToLeadList({ name: ' Cardiology ', npis: ['1', '2', '2', '3'] });

    expect(LeadList.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Cardiology', member_count: 0 }));
    const rows = LeadListMember.bulkCreate.mock.calls.flatMap(([batch]) => batch);
    expect(rows).toEqual([
      { list_id: 7, npi: '1', status: 'New' },
      { list_id: 7, npi: '2', status: 'New' },
      { list_id: 7, npi: '3', status: 'New' },
    ]);
    expect(rows.some((r) => 'lead_list_id' in r)).toBe(false);
    expect(LeadList.update).not.toHaveBeenCalled();
    expect(result.list.member_count).toBe(3);
    expect(result).toMatchObject({ added: 3, skipped: 0, truncated: 0 });
  });

  it('skips providers already on an existing list', async () => {
    LeadList.filter.mockResolvedValue([{ id: 4, name: 'Existing', member_count: 2 }]);
    LeadListMember.filter.mockResolvedValue([{ npi: '1' }, { npi: '9' }]);

    const result = await saveProvidersToLeadList({ listId: '4', npis: ['1', '2'] });

    expect(LeadListMember.filter).toHaveBeenCalledWith({ list_id: 4, id: { $gt: 0 } }, 'id', 5000);
    expect(LeadListMember.bulkCreate).toHaveBeenCalledWith([{ list_id: 4, npi: '2', status: 'New' }]);
    expect(LeadList.update).not.toHaveBeenCalled();
    expect(result.list.member_count).toBe(3);
    expect(result).toMatchObject({ added: 1, skipped: 1 });
  });

  it('reads every page of a long list, so older members are not re-added and the count is exact', async () => {
    LeadList.filter.mockResolvedValue([{ id: 4, name: 'Long', member_count: 0 }]);
    const page1 = Array.from({ length: 5000 }, (_, i) => ({ id: i + 1, npi: String(i) }));
    const page2 = [{ id: 5001, npi: 'old' }];
    LeadListMember.filter.mockResolvedValueOnce(page1).mockResolvedValueOnce(page2);

    const result = await saveProvidersToLeadList({ listId: 4, npis: ['old', 'new'] });

    expect(LeadListMember.filter).toHaveBeenLastCalledWith({ list_id: 4, id: { $gt: 5000 } }, 'id', 5000);
    expect(LeadListMember.bulkCreate).toHaveBeenCalledWith([{ list_id: 4, npi: 'new', status: 'New' }]);
    expect(LeadList.update).not.toHaveBeenCalled();
    expect(result.list.member_count).toBe(5002);
    expect(result).toMatchObject({ added: 1, skipped: 1 });
  });

  it('writes large lists in chunks and reports what was over the cap', async () => {
    LeadList.create.mockResolvedValue({ id: 1, name: 'Big', member_count: 0 });
    const npis = Array.from({ length: MAX_MEMBERS_PER_SAVE + 10 }, (_, i) => String(i));

    const result = await saveProvidersToLeadList({ name: 'Big', npis });

    expect(LeadListMember.bulkCreate.mock.calls.length).toBe(Math.ceil(MAX_MEMBERS_PER_SAVE / 500));
    expect(result.added).toBe(MAX_MEMBERS_PER_SAVE);
    expect(result.truncated).toBe(10);
  });

  it('requires a name for a new list', async () => {
    await expect(saveProvidersToLeadList({ name: '  ', npis: ['1'] })).rejects.toThrow('Please name the list.');
    expect(LeadList.create).not.toHaveBeenCalled();
  });

  it('errors clearly when the chosen list was deleted', async () => {
    LeadList.filter.mockResolvedValue([]);
    await expect(saveProvidersToLeadList({ listId: 99, npis: ['1'] })).rejects.toThrow('no longer exists');
  });
});

describe('listMembers', () => {
  it('returns every member row across pages, in id order', async () => {
    const page1 = Array.from({ length: 5000 }, (_, i) => ({ id: i + 1, npi: String(i), status: 'New' }));
    const page2 = [{ id: 5001, npi: 'last', status: 'Contacted' }];
    LeadListMember.filter.mockResolvedValueOnce(page1).mockResolvedValueOnce(page2);

    const rows = await listMembers(9);

    expect(rows).toHaveLength(5001);
    expect(rows[5000]).toEqual(page2[0]);
    expect(LeadListMember.filter).toHaveBeenNthCalledWith(1, { list_id: 9, id: { $gt: 0 } }, 'id', 5000);
    expect(LeadListMember.filter).toHaveBeenNthCalledWith(2, { list_id: 9, id: { $gt: 5000 } }, 'id', 5000);
  });

  it('is how the list dialog loads members, so lists over one page are shown whole', () => {
    const page = readFileSync(new URL('../src/pages/LeadLists.jsx', import.meta.url), 'utf8');
    expect(page).toMatch(/await listMembers\(listId\)/);
    expect(page).not.toMatch(/LeadListMember\.filter\(\{ list_id: listId \}/);
  });
});
