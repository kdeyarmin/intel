// Pure helpers extracted from entry.ts so they can be unit-tested from Node
// without booting the Deno serve handler.
//
// Mirrors the HHA helpers — same upsert pattern, different entity name.
// Natural key for de-duplicating Medicare SNF rows: each (table_name, category)
// pair is unique within a publication year.

export const SNF_KEY_FIELDS = ['data_year', 'table_name', 'category'];

export function snfRecordKey(r: Record<string, unknown>): string {
    return SNF_KEY_FIELDS.map(f => String(r[f] ?? '').trim().toLowerCase()).join('|');
}

// Compute the patch of fields that differ between incoming and existing.
// Skips empty incoming values so a parser that emits '' for missing columns
// doesn't blank out previously-populated DB fields.
export function buildSnfUpdatePatch(
    incoming: Record<string, unknown>,
    existing: Record<string, unknown>,
): Record<string, unknown> {
    const patch: Record<string, unknown> = {};
    for (const k of Object.keys(incoming)) {
        const v = incoming[k];
        if (v === null || v === undefined || v === '') continue;
        if (typeof v === 'object') {
            if (JSON.stringify(v) !== JSON.stringify(existing[k] ?? null)) patch[k] = v;
        } else if (String(existing[k] ?? '').trim() !== String(v).trim()) {
            patch[k] = v;
        }
    }
    return patch;
}

export type FilterFn = (
    query: Record<string, unknown>,
    sort: undefined,
    limit: number,
) => Promise<unknown[]>;

export type EntityLike = { filter: FilterFn };

export type Base44Like = {
    asServiceRole: { entities: { MedicareSNFStats: EntityLike } };
};

export type PartitionResult<T> = {
    toCreate: T[];
    toUpdate: Array<{ id: string; record: Record<string, unknown> }>;
    skipped: number;
};

export async function snfPartitionForUpsert<T extends Record<string, unknown>>(
    base44: Base44Like,
    chunk: T[],
    year: number,
): Promise<PartitionResult<T>> {
    const tableNames = [...new Set(chunk.map(r => r.table_name).filter(Boolean))] as string[];
    if (tableNames.length === 0) return { toCreate: chunk, toUpdate: [], skipped: 0 };

    let existing: Record<string, unknown>[] = [];
    try {
        const result = await base44.asServiceRole.entities.MedicareSNFStats.filter(
            { data_year: year, table_name: { $in: tableNames } },
            undefined,
            tableNames.length * 2000 + 100,
        );
        existing = (result as Record<string, unknown>[]) ?? [];
    } catch (_e) {
        return { toCreate: chunk, toUpdate: [], skipped: 0 };
    }

    const map = new Map(existing.map(e => [snfRecordKey(e), e]));
    const toCreate: T[] = [];
    const toUpdate: Array<{ id: string; record: Record<string, unknown> }> = [];
    let skipped = 0;
    for (const r of chunk) {
        const ex = map.get(snfRecordKey(r));
        if (!ex) { toCreate.push(r); continue; }
        const patch = buildSnfUpdatePatch(r, ex);
        if (Object.keys(patch).length > 0) {
            toUpdate.push({ id: ex.id as string, record: patch });
        } else {
            skipped++;
        }
    }
    return { toCreate, toUpdate, skipped };
}
