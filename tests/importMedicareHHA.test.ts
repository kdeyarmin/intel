import { describe, it, expect, vi } from 'vitest';
import {
  HHA_KEY_FIELDS,
  hhaRecordKey,
  buildHhaUpdatePatch,
  hhaPartitionForUpsert,
} from '../base44/functions/importMedicareHHA/helpers';

describe('hhaRecordKey', () => {
  it('combines (data_year, table_name, category)', () => {
    const key = hhaRecordKey({
      data_year: 2024,
      table_name: 'HHA1',
      category: 'All Beneficiaries',
    });
    expect(key).toBe('2024|hha1|all beneficiaries');
  });

  it('lowercases and trims', () => {
    const key = hhaRecordKey({
      data_year: 2024,
      table_name: '  HHA1  ',
      category: 'Type A',
    });
    expect(key).toBe('2024|hha1|type a');
  });

  it('treats missing fields as empty', () => {
    const key = hhaRecordKey({ data_year: 2024 });
    expect(key).toBe('2024||');
  });

  it('exports the key field list for callers', () => {
    expect(HHA_KEY_FIELDS).toEqual(['data_year', 'table_name', 'category']);
  });
});

describe('buildHhaUpdatePatch', () => {
  it('omits empty incoming fields', () => {
    const patch = buildHhaUpdatePatch(
      { category: '', total_visits: 100 },
      { category: 'Existing', total_visits: 50 },
    );
    expect(patch).toEqual({ total_visits: 100 });
  });

  it('compares raw_data via JSON.stringify', () => {
    const patch1 = buildHhaUpdatePatch(
      { raw_data: { col1: 'value' } },
      { raw_data: { col1: 'value' } },
    );
    expect(patch1).toEqual({});

    const patch2 = buildHhaUpdatePatch(
      { raw_data: { col1: 'new' } },
      { raw_data: { col1: 'old' } },
    );
    expect(patch2).toEqual({ raw_data: { col1: 'new' } });
  });

  it('skips raw_data when both sides are equivalent JSON', () => {
    const patch = buildHhaUpdatePatch(
      { raw_data: { a: 1, b: 2 } },
      { raw_data: { a: 1, b: 2 } },
    );
    expect(patch).toEqual({});
  });

  it('returns empty patch when nothing changed', () => {
    const patch = buildHhaUpdatePatch(
      { category: 'Same', total_visits: 100 },
      { category: 'Same', total_visits: 100 },
    );
    expect(patch).toEqual({});
  });
});

describe('hhaPartitionForUpsert', () => {
  function makeBase44(filterImpl: (q: any, _s: any, l: number) => Promise<any[]>) {
    return {
      asServiceRole: {
        entities: {
          MedicareHHAStats: { filter: vi.fn(filterImpl) },
        },
      },
    };
  }

  it('skips lookup if no chunk has table_name', async () => {
    const filterFn = vi.fn();
    const base44 = makeBase44(filterFn);
    const result = await hhaPartitionForUpsert(
      base44,
      [{ data_year: 2024, category: 'X' }],
      2024,
    );
    expect(filterFn).not.toHaveBeenCalled();
    expect(result.toCreate).toHaveLength(1);
  });

  it('creates new rows when no match exists', async () => {
    const base44 = makeBase44(async () => []);
    const result = await hhaPartitionForUpsert(
      base44,
      [
        { data_year: 2024, table_name: 'HHA1', category: 'A', total_visits: 100 },
        { data_year: 2024, table_name: 'HHA1', category: 'B', total_visits: 200 },
      ],
      2024,
    );
    expect(result.toCreate).toHaveLength(2);
    expect(result.toUpdate).toEqual([]);
    expect(result.skipped).toBe(0);
  });

  it('updates existing rows with only changed non-empty fields', async () => {
    const existing = [
      { id: 'row-a', data_year: 2024, table_name: 'HHA1', category: 'A', total_visits: 100, raw_data: { col1: 'old' } },
    ];
    const base44 = makeBase44(async () => existing);
    const result = await hhaPartitionForUpsert(
      base44,
      [
        { data_year: 2024, table_name: 'HHA1', category: 'A', total_visits: 150, raw_data: { col1: 'old' } },
      ],
      2024,
    );
    expect(result.toCreate).toEqual([]);
    expect(result.toUpdate).toEqual([{ id: 'row-a', record: { total_visits: 150 } }]);
    expect(result.skipped).toBe(0);
  });

  it('skips when nothing actually changed', async () => {
    const existing = [
      { id: 'row-a', data_year: 2024, table_name: 'HHA1', category: 'A', total_visits: 100 },
    ];
    const base44 = makeBase44(async () => existing);
    const result = await hhaPartitionForUpsert(
      base44,
      [{ data_year: 2024, table_name: 'HHA1', category: 'A', total_visits: 100 }],
      2024,
    );
    expect(result.toCreate).toEqual([]);
    expect(result.toUpdate).toEqual([]);
    expect(result.skipped).toBe(1);
  });

  it('falls back to create-only when lookup throws', async () => {
    const base44 = makeBase44(async () => { throw new Error('rate limit'); });
    const incoming = [{ data_year: 2024, table_name: 'HHA1', category: 'A' }];
    const result = await hhaPartitionForUpsert(base44, incoming, 2024);
    expect(result.toCreate).toBe(incoming);
    expect(result.toUpdate).toEqual([]);
    expect(result.skipped).toBe(0);
  });

  it('passes table_name $in filter scoped to the chunk', async () => {
    const filterFn = vi.fn(async () => []);
    const base44 = {
      asServiceRole: { entities: { MedicareHHAStats: { filter: filterFn } } },
    };
    await hhaPartitionForUpsert(
      base44,
      [
        { data_year: 2024, table_name: 'HHA1', category: 'A' },
        { data_year: 2024, table_name: 'HHA2', category: 'B' },
        { data_year: 2024, table_name: 'HHA1', category: 'C' },
      ],
      2024,
    );
    expect(filterFn).toHaveBeenCalledTimes(1);
    const [query] = filterFn.mock.calls[0];
    expect(query.data_year).toBe(2024);
    expect(query.table_name.$in).toEqual(['HHA1', 'HHA2']); // dedup'd
  });

  it('does not blank existing fields when incoming has empty value', async () => {
    // Regression test for the bug fixed in the upsert refactor: a parser that
    // emits '' for missing columns must not overwrite a populated existing field.
    const existing = [
      { id: 'row-a', data_year: 2024, table_name: 'HHA1', category: 'A', total_visits: 100, total_episodes: 50 },
    ];
    const base44 = makeBase44(async () => existing);
    const result = await hhaPartitionForUpsert(
      base44,
      [
        // total_episodes intentionally missing/blank
        { data_year: 2024, table_name: 'HHA1', category: 'A', total_visits: 200, total_episodes: '' },
      ],
      2024,
    );
    expect(result.toUpdate).toHaveLength(1);
    const patch = result.toUpdate[0].record;
    expect(patch).toEqual({ total_visits: 200 });
    expect(patch).not.toHaveProperty('total_episodes');
  });
});
