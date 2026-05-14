// Pure helpers extracted from entry.ts so they can be unit-tested from Node
// without booting the Deno serve handler.

// #2 — Natural key fields per import_type. Used to detect existing rows so we
// update instead of creating duplicates. Order matters: first field is queried
// with $in, the rest are matched client-side. Pick the most-distinguishing
// field first.
export const NATURAL_KEYS: Record<string, string[]> = {
    cms_order_referring: ['npi', 'year'],
    opt_out_physicians: ['npi'],
    home_health_enrollments: ['enrollment_id'],
    hospice_enrollments: ['enrollment_id'],
    provider_service_utilization: ['npi', 'hcpcs_code', 'data_year'],
    medical_equipment_suppliers: ['provider_id'],
    hospice_provider_measures: ['ccn', 'measure_code'],
    hospice_state_measures: ['state', 'measure_code'],
    hospice_national_measures: ['measure_code'],
    snf_provider_measures: ['ccn', 'measure_code'],
    nursing_home_providers: ['ccn'],
    nursing_home_deficiencies: ['ccn', 'inspection_cycle', 'health_survey_date'],
    home_health_national_measures: ['measure_id', 'measure_name'],
};

// Per-batch caps for paginated lookup. Some import_types
// (provider_service_utilization in particular) fan out heavily — one NPI has
// hundreds of HCPCS codes — so a single $in query with a small limit silently
// misses existing rows and we end up creating duplicates. Splitting the
// primary values into small groups bounds the per-call result size.
export const LOOKUP_PRIMARY_BATCH_SIZE = 10;
export const LOOKUP_PER_BATCH_LIMIT = 5000;

export function makeMatchKey(record: Record<string, unknown>, fields: string[]): string {
    return fields.map(f => String(record[f] ?? '').trim().toLowerCase()).join('|');
}

// Compute the patch of fields that differ between incoming and existing.
// Only includes fields where the incoming value is non-empty AND different
// from what's stored, so blank columns from a parser can't overwrite
// existing populated data.
export function buildUpdatePatch(
    incoming: Record<string, unknown>,
    existing: Record<string, unknown>,
): Record<string, unknown> {
    const patch: Record<string, unknown> = {};
    for (const k of Object.keys(incoming)) {
        const v = incoming[k];
        if (v === null || v === undefined || v === '') continue;
        if (String(existing[k] ?? '').trim() !== String(v).trim()) patch[k] = v;
    }
    return patch;
}

// Minimal entity shape needed by partitionForUpsert. The real base44 entity
// exposes much more — we only call .filter from here.
export type FilterFn = (
    query: Record<string, unknown>,
    sort: undefined,
    limit: number,
) => Promise<unknown[]>;

export type EntityLike = { filter: FilterFn };

export type PartitionResult<T> = {
    toCreate: T[];
    toUpdate: Array<{ id: string; record: Record<string, unknown> }>;
    skipped: number;
};

export async function partitionForUpsert<T extends Record<string, unknown>>(
    entity: EntityLike,
    records: T[],
    importType: string,
): Promise<PartitionResult<T>> {
    const keyFields = NATURAL_KEYS[importType];
    if (!keyFields || keyFields.length === 0 || records.length === 0) {
        return { toCreate: records, toUpdate: [], skipped: 0 };
    }

    const primaryField = keyFields[0];
    const primaryValues = [
        ...new Set(
            records
                .map(r => r[primaryField])
                .filter(v => v != null && v !== ''),
        ),
    ];
    if (primaryValues.length === 0) {
        return { toCreate: records, toUpdate: [], skipped: 0 };
    }

    const existing: Record<string, unknown>[] = [];
    let lookupFailed = false;
    for (let i = 0; i < primaryValues.length; i += LOOKUP_PRIMARY_BATCH_SIZE) {
        const slice = primaryValues.slice(i, i + LOOKUP_PRIMARY_BATCH_SIZE);
        try {
            const page = await entity.filter(
                { [primaryField]: { $in: slice } },
                undefined,
                LOOKUP_PER_BATCH_LIMIT,
            );
            if (Array.isArray(page)) existing.push(...(page as Record<string, unknown>[]));
        } catch (_e) {
            lookupFailed = true;
            break;
        }
    }
    if (lookupFailed) {
        return { toCreate: records, toUpdate: [], skipped: 0 };
    }

    const existingMap = new Map(existing.map(e => [makeMatchKey(e, keyFields), e]));
    const toCreate: T[] = [];
    const toUpdate: Array<{ id: string; record: Record<string, unknown> }> = [];
    let skipped = 0;
    const seenInBatch = new Set<string>();
    for (const r of records) {
        const key = makeMatchKey(r, keyFields);
        // De-duplicate within this same chunk (same natural key seen twice)
        if (seenInBatch.has(key)) { skipped++; continue; }
        seenInBatch.add(key);

        const ex = existingMap.get(key);
        if (!ex) {
            toCreate.push(r);
            continue;
        }
        const patch = buildUpdatePatch(r, ex);
        if (Object.keys(patch).length > 0) {
            toUpdate.push({ id: ex.id as string, record: patch });
        } else {
            skipped++;
        }
    }
    return { toCreate, toUpdate, skipped };
}
