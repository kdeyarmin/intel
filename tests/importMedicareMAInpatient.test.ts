import { describe, it, expect, vi } from 'vitest';
import {
  MA_KEY_FIELDS,
  maRecordKey,
  buildMaUpdatePatch,
  maPartitionForUpsert,
} from '../base44/functions/importMedicareMAInpatient/helpers';

describe('maRecordKey', () => {
  it('combines (data_year, table_name, category)', () => {
    const key = maRecordKey({
      data_year: 2021,
      table_name: 'MA4',
      category: 'Short-Term General',
    });
    expect(key).toBe('2021|ma4|short-term general');
  });

  it('appends state when present (MA7 per-state rows)', () => {
    const key = maRecordKey({
      data_year: 2021,
      table_name: 'MA7',
      category: 'Male',
      state: 'CA',
    });
    expect(key).toBe('2021|ma7|male|ca');
  });

  it('omits state suffix when state is empty/missing', () => {
    const key = maRecordKey({
      data_year: 2021,
      table_name: 'MA4',
      category: 'A',
    });
    expect(key).toBe('2021|ma4|a');
  });

  it('does NOT collide CA-male and NY-male', () => {
    // Regression: MA7 rows are per-state; the state component of the key is
    // what stops two demographic-dimension rows from clobbering each other
    // across states.
    const ca = maRecordKey({ data_year: 2021, table_name: 'MA7', category: 'Male', state: 'CA' });
    const ny = maRecordKey({ data_year: 2021, table_name: 'MA7', category: 'Male', state: 'NY' });
    expect(ca).not.toBe(ny);
  });

  it('lowercases and trims state', () => {
    const key = maRecordKey({
      data_year: 2021,
      table_name: 'MA7',
      category: 'Male',
      state: '  ca  ',
    });
    expect(key).toBe('2021|ma7|male|ca');
  });

  it('exports the key field list for callers', () => {
    expect(MA_KEY_FIELDS).toEqual(['data_year', 'table_name', 'category']);
  });
});

describe('buildMaUpdatePatch', () => {
  it('omits empty incoming fields', () => {
    const patch = buildMaUpdatePatch(
      { category: '', total_discharges: 100 },
      { category: 'Existing', total_discharges: 50 },
    );
    expect(patch).toEqual({ total_discharges: 100 });
  });

  it('compares raw_data via JSON.stringify', () => {
    const patch1 = buildMaUpdatePatch(
      { raw_data: { col1: 'value' } },
      { raw_data: { col1: 'value' } },
    );
    expect(patch1).toEqual({});

    const patch2 = buildMaUpdatePatch(
      { raw_data: { col1: 'new' } },
      { raw_data: { col1: 'old' } },
    );
    expect(patch2).toEqual({ raw_data: { col1: 'new' } });
  });

  it('returns empty patch when nothing changed', () => {
    const patch = buildMaUpdatePatch(
      { category: 'Same', total_enrollees: 100 },
      { category: 'Same', total_enrollees: 100 },
    );
    expect(patch).toEqual({});
  });
});

describe('maPartitionForUpsert', () => {
  function makeBase44(filterImpl: (q: any, _s: any, l: number) => Promise<any[]>) {
    return {
      asServiceRole: {
        entities: {
          MedicareMAInpatient: { filter: vi.fn(filterImpl) },
        },
      },
    };
  }

  it('skips lookup if no chunk has table_name', async () => {
    const filterFn = vi.fn();
    const base44 = makeBase44(filterFn);
    const result = await maPartitionForUpsert(
      base44,
      [{ data_year: 2021, category: 'X' }],
      2021,
    );
    expect(filterFn).not.toHaveBeenCalled();
    expect(result.toCreate).toHaveLength(1);
  });

  it('creates new rows when no match exists', async () => {
    const base44 = makeBase44(async () => []);
    const result = await maPartitionForUpsert(
      base44,
      [
        { data_year: 2021, table_name: 'MA4', category: 'A', total_discharges: 100 },
        { data_year: 2021, table_name: 'MA5', category: 'B', total_discharges: 200 },
      ],
      2021,
    );
    expect(result.toCreate).toHaveLength(2);
    expect(result.toUpdate).toEqual([]);
    expect(result.skipped).toBe(0);
  });

  it('keys MA7 by (table_name, category, state) — same category in different states are distinct rows', async () => {
    const existing = [
      { id: 'ca-male', data_year: 2021, table_name: 'MA7', category: 'Male', state: 'CA', total_discharges: 100 },
      { id: 'ny-male', data_year: 2021, table_name: 'MA7', category: 'Male', state: 'NY', total_discharges: 200 },
    ];
    const base44 = makeBase44(async () => existing);
    const result = await maPartitionForUpsert(
      base44,
      [
        { data_year: 2021, table_name: 'MA7', category: 'Male', state: 'CA', total_discharges: 150 },
        { data_year: 2021, table_name: 'MA7', category: 'Male', state: 'NY', total_discharges: 250 },
      ],
      2021,
    );
    expect(result.toCreate).toEqual([]);
    expect(result.toUpdate).toHaveLength(2);
    expect(result.toUpdate.find(u => u.id === 'ca-male')!.record).toEqual({ total_discharges: 150 });
    expect(result.toUpdate.find(u => u.id === 'ny-male')!.record).toEqual({ total_discharges: 250 });
  });

  it('falls back to create-only when lookup throws', async () => {
    const base44 = makeBase44(async () => { throw new Error('rate limit'); });
    const incoming = [{ data_year: 2021, table_name: 'MA4', category: 'A' }];
    const result = await maPartitionForUpsert(base44, incoming, 2021);
    expect(result.toCreate).toBe(incoming);
    expect(result.toUpdate).toEqual([]);
    expect(result.skipped).toBe(0);
  });

  it('does not blank existing fields when incoming has empty value', async () => {
    const existing = [
      { id: 'row-a', data_year: 2021, table_name: 'MA4', category: 'A', total_discharges: 100, total_covered_days: 500 },
    ];
    const base44 = makeBase44(async () => existing);
    const result = await maPartitionForUpsert(
      base44,
      [
        { data_year: 2021, table_name: 'MA4', category: 'A', total_discharges: 200, total_covered_days: '' },
      ],
      2021,
    );
    expect(result.toUpdate).toHaveLength(1);
    const patch = result.toUpdate[0].record;
    expect(patch).toEqual({ total_discharges: 200 });
    expect(patch).not.toHaveProperty('total_covered_days');
  });
});
