import { describe, it, expect, vi } from 'vitest';
import {
  NATURAL_KEYS,
  makeMatchKey,
  buildUpdatePatch,
  partitionForUpsert,
  LOOKUP_PRIMARY_BATCH_SIZE,
} from '../base44/functions/autoImportCMSData/helpers';

describe('makeMatchKey', () => {
  it('joins fields lowercased and trimmed', () => {
    const key = makeMatchKey({ npi: ' 123 ', year: 2024 }, ['npi', 'year']);
    expect(key).toBe('123|2024');
  });

  it('handles missing fields as empty strings', () => {
    const key = makeMatchKey({ npi: '123' }, ['npi', 'year']);
    expect(key).toBe('123|');
  });

  it('treats null and undefined as empty', () => {
    const key = makeMatchKey({ npi: null, year: undefined }, ['npi', 'year']);
    expect(key).toBe('|');
  });

  it('case-insensitive', () => {
    expect(makeMatchKey({ code: 'AbC' }, ['code'])).toBe('abc');
  });
});

describe('buildUpdatePatch', () => {
  it('skips fields where incoming value is empty', () => {
    const patch = buildUpdatePatch({ name: '', age: 30 }, { name: 'old', age: 25 });
    expect(patch).toEqual({ age: 30 });
  });

  it('skips fields that match existing', () => {
    const patch = buildUpdatePatch({ name: 'Alice', age: 30 }, { name: 'Alice', age: 25 });
    expect(patch).toEqual({ age: 30 });
  });

  it('returns empty patch when nothing changed', () => {
    const patch = buildUpdatePatch({ name: 'Alice' }, { name: 'Alice' });
    expect(patch).toEqual({});
  });

  it('treats null/undefined incoming as empty', () => {
    const patch = buildUpdatePatch({ name: null, age: undefined }, { name: 'old', age: 25 });
    expect(patch).toEqual({});
  });

  it('compares trimmed and stringified, not raw equality', () => {
    const patch = buildUpdatePatch({ count: '42' }, { count: 42 });
    expect(patch).toEqual({}); // '42' === '42' after String()
  });
});

describe('NATURAL_KEYS sanity', () => {
  it('has every documented import_type covered', () => {
    const expected = [
      'cms_order_referring',
      'opt_out_physicians',
      'home_health_enrollments',
      'hospice_enrollments',
      'provider_service_utilization',
      'medical_equipment_suppliers',
      'hospice_provider_measures',
      'hospice_state_measures',
      'hospice_national_measures',
      'snf_provider_measures',
      'nursing_home_providers',
      'nursing_home_deficiencies',
      'home_health_national_measures',
    ];
    for (const t of expected) {
      expect(NATURAL_KEYS[t]).toBeDefined();
      expect(Array.isArray(NATURAL_KEYS[t])).toBe(true);
      expect(NATURAL_KEYS[t].length).toBeGreaterThan(0);
    }
  });

  it('provider_service_utilization includes data_year (multi-year imports)', () => {
    expect(NATURAL_KEYS.provider_service_utilization).toContain('data_year');
  });
});

describe('partitionForUpsert', () => {
  it('returns toCreate=records when import_type has no natural key', async () => {
    const records = [{ x: 1 }];
    const entity = { filter: vi.fn() };
    const result = await partitionForUpsert(entity, records, 'unknown_type');
    expect(result.toCreate).toBe(records);
    expect(result.toUpdate).toEqual([]);
    expect(entity.filter).not.toHaveBeenCalled();
  });

  it('returns empty result when records is empty', async () => {
    const entity = { filter: vi.fn() };
    const result = await partitionForUpsert(entity, [], 'opt_out_physicians');
    expect(result.toCreate).toEqual([]);
    expect(entity.filter).not.toHaveBeenCalled();
  });

  it('partitions into create / update / skip correctly', async () => {
    const incoming = [
      { npi: '111', year: 2024, name: 'New One' },
      { npi: '222', year: 2024, name: 'Updated Name' },
      { npi: '333', year: 2024, name: 'Same Name' },
    ];
    const existing = [
      { id: 'b', npi: '222', year: 2024, name: 'Old Name' },
      { id: 'c', npi: '333', year: 2024, name: 'Same Name' },
    ];
    const entity = { filter: vi.fn().mockResolvedValue(existing) };

    const result = await partitionForUpsert(entity, incoming, 'cms_order_referring');

    expect(result.toCreate).toEqual([{ npi: '111', year: 2024, name: 'New One' }]);
    expect(result.toUpdate).toEqual([
      { id: 'b', record: { name: 'Updated Name' } },
    ]);
    expect(result.skipped).toBe(1); // 333 unchanged
  });

  it('de-dups within a single chunk (same natural key seen twice)', async () => {
    const incoming = [
      { npi: '111', year: 2024, name: 'First' },
      { npi: '111', year: 2024, name: 'Second' }, // duplicate key
    ];
    const entity = { filter: vi.fn().mockResolvedValue([]) };
    const result = await partitionForUpsert(entity, incoming, 'cms_order_referring');
    expect(result.toCreate).toHaveLength(1);
    expect(result.skipped).toBe(1);
  });

  it('falls back to create-only when lookup throws', async () => {
    const incoming = [{ npi: '111', year: 2024 }];
    const entity = { filter: vi.fn().mockRejectedValue(new Error('connection refused')) };
    const result = await partitionForUpsert(entity, incoming, 'cms_order_referring');
    expect(result.toCreate).toBe(incoming);
    expect(result.toUpdate).toEqual([]);
  });

  it('paginates the lookup in batches of LOOKUP_PRIMARY_BATCH_SIZE', async () => {
    const incoming = Array.from({ length: 25 }, (_, i) => ({
      npi: `npi-${i}`,
      year: 2024,
    }));
    const entity = { filter: vi.fn().mockResolvedValue([]) };
    await partitionForUpsert(entity, incoming, 'cms_order_referring');
    // 25 unique primary values, batch size 10 -> 3 calls (10 + 10 + 5)
    expect(entity.filter.mock.calls.length).toBe(3);
    // Each call should be passed an $in slice of <= LOOKUP_PRIMARY_BATCH_SIZE values
    for (const call of entity.filter.mock.calls) {
      const query = call[0] as { npi: { $in: string[] } };
      expect(query.npi.$in.length).toBeLessThanOrEqual(LOOKUP_PRIMARY_BATCH_SIZE);
    }
  });

  it('skips records whose primary key field is missing', async () => {
    // All records missing the primary field — partitioner shouldn't even
    // attempt a lookup; just creates everything.
    const incoming = [{ year: 2024 }, { year: 2024 }];
    const entity = { filter: vi.fn() };
    const result = await partitionForUpsert(entity, incoming, 'cms_order_referring');
    expect(entity.filter).not.toHaveBeenCalled();
    expect(result.toCreate).toBe(incoming);
  });
});
