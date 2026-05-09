import { describe, it, expect, vi } from 'vitest';
import {
  SNF_KEY_FIELDS,
  snfRecordKey,
  buildSnfUpdatePatch,
  snfPartitionForUpsert,
} from '../base44/functions/importMedicareSNF/helpers';

describe('snfRecordKey', () => {
  it('combines (data_year, table_name, category)', () => {
    const key = snfRecordKey({
      data_year: 2023,
      table_name: 'SNF1',
      category: 'All Beneficiaries',
    });
    expect(key).toBe('2023|snf1|all beneficiaries');
  });

  it('lowercases and trims', () => {
    const key = snfRecordKey({
      data_year: 2023,
      table_name: '  SNF3  ',
      category: 'CA',
    });
    expect(key).toBe('2023|snf3|ca');
  });

  it('treats missing fields as empty', () => {
    const key = snfRecordKey({ data_year: 2023 });
    expect(key).toBe('2023||');
  });

  it('exports the key field list for callers', () => {
    expect(SNF_KEY_FIELDS).toEqual(['data_year', 'table_name', 'category']);
  });
});

describe('buildSnfUpdatePatch', () => {
  it('omits empty incoming fields', () => {
    const patch = buildSnfUpdatePatch(
      { category: '', total_stays: 100 },
      { category: 'Existing', total_stays: 50 },
    );
    expect(patch).toEqual({ total_stays: 100 });
  });

  it('compares raw_data via JSON.stringify', () => {
    const patch1 = buildSnfUpdatePatch(
      { raw_data: { col1: 'value' } },
      { raw_data: { col1: 'value' } },
    );
    expect(patch1).toEqual({});

    const patch2 = buildSnfUpdatePatch(
      { raw_data: { col1: 'new' } },
      { raw_data: { col1: 'old' } },
    );
    expect(patch2).toEqual({ raw_data: { col1: 'new' } });
  });

  it('returns empty patch when nothing changed', () => {
    const patch = buildSnfUpdatePatch(
      { category: 'Same', persons_served: 100 },
      { category: 'Same', persons_served: 100 },
    );
    expect(patch).toEqual({});
  });

  it('compares stringified, not raw equality', () => {
    const patch = buildSnfUpdatePatch(
      { total_stays: '42' },
      { total_stays: 42 },
    );
    expect(patch).toEqual({});
  });
});

describe('snfPartitionForUpsert', () => {
  function makeBase44(filterImpl: (q: any, _s: any, l: number) => Promise<any[]>) {
    return {
      asServiceRole: {
        entities: {
          MedicareSNFStats: { filter: vi.fn(filterImpl) },
        },
      },
    };
  }

  it('skips lookup if no chunk has table_name', async () => {
    const filterFn = vi.fn();
    const base44 = makeBase44(filterFn);
    const result = await snfPartitionForUpsert(
      base44,
      [{ data_year: 2023, category: 'X' }],
      2023,
    );
    expect(filterFn).not.toHaveBeenCalled();
    expect(result.toCreate).toHaveLength(1);
  });

  it('creates new rows when no match exists', async () => {
    const base44 = makeBase44(async () => []);
    const result = await snfPartitionForUpsert(
      base44,
      [
        { data_year: 2023, table_name: 'SNF1', category: 'A', total_stays: 100 },
        { data_year: 2023, table_name: 'SNF1', category: 'B', total_stays: 200 },
      ],
      2023,
    );
    expect(result.toCreate).toHaveLength(2);
    expect(result.toUpdate).toEqual([]);
    expect(result.skipped).toBe(0);
  });

  it('updates existing rows with only changed non-empty fields', async () => {
    const existing = [
      { id: 'row-a', data_year: 2023, table_name: 'SNF1', category: 'A', total_stays: 100, raw_data: { col1: 'old' } },
    ];
    const base44 = makeBase44(async () => existing);
    const result = await snfPartitionForUpsert(
      base44,
      [
        { data_year: 2023, table_name: 'SNF1', category: 'A', total_stays: 150, raw_data: { col1: 'old' } },
      ],
      2023,
    );
    expect(result.toCreate).toEqual([]);
    expect(result.toUpdate).toEqual([{ id: 'row-a', record: { total_stays: 150 } }]);
    expect(result.skipped).toBe(0);
  });

  it('skips when nothing actually changed', async () => {
    const existing = [
      { id: 'row-a', data_year: 2023, table_name: 'SNF1', category: 'A', total_stays: 100 },
    ];
    const base44 = makeBase44(async () => existing);
    const result = await snfPartitionForUpsert(
      base44,
      [{ data_year: 2023, table_name: 'SNF1', category: 'A', total_stays: 100 }],
      2023,
    );
    expect(result.toCreate).toEqual([]);
    expect(result.toUpdate).toEqual([]);
    expect(result.skipped).toBe(1);
  });

  it('falls back to create-only when lookup throws', async () => {
    const base44 = makeBase44(async () => { throw new Error('rate limit'); });
    const incoming = [{ data_year: 2023, table_name: 'SNF1', category: 'A' }];
    const result = await snfPartitionForUpsert(base44, incoming, 2023);
    expect(result.toCreate).toBe(incoming);
    expect(result.toUpdate).toEqual([]);
    expect(result.skipped).toBe(0);
  });

  it('passes table_name $in filter scoped to the chunk', async () => {
    const filterFn = vi.fn(async () => []);
    const base44 = {
      asServiceRole: { entities: { MedicareSNFStats: { filter: filterFn } } },
    };
    await snfPartitionForUpsert(
      base44,
      [
        { data_year: 2023, table_name: 'SNF1', category: 'A' },
        { data_year: 2023, table_name: 'SNF2', category: 'B' },
        { data_year: 2023, table_name: 'SNF1', category: 'C' },
      ],
      2023,
    );
    expect(filterFn).toHaveBeenCalledTimes(1);
    const [query] = filterFn.mock.calls[0];
    expect(query.data_year).toBe(2023);
    expect(query.table_name.$in).toEqual(['SNF1', 'SNF2']);
  });

  it('does not blank existing fields when incoming has empty value', async () => {
    // Regression test: a parser that emits '' for missing columns must not
    // overwrite a populated existing field.
    const existing = [
      { id: 'row-a', data_year: 2023, table_name: 'SNF1', category: 'A', total_stays: 100, persons_served: 50 },
    ];
    const base44 = makeBase44(async () => existing);
    const result = await snfPartitionForUpsert(
      base44,
      [
        { data_year: 2023, table_name: 'SNF1', category: 'A', total_stays: 200, persons_served: '' },
      ],
      2023,
    );
    expect(result.toUpdate).toHaveLength(1);
    const patch = result.toUpdate[0].record;
    expect(patch).toEqual({ total_stays: 200 });
    expect(patch).not.toHaveProperty('persons_served');
  });
});
