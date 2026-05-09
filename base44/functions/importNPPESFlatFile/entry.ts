import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

const MAX_EXEC_MS = 45000;
const BULK_INSERT_SIZE = 500;
const FETCH_TIMEOUT_MS = 30_000;

type ImportFlatFilePayload = {
    batch_id?: string;
    file_url?: string;
    byte_offset?: number;
    headers?: string[] | null;
    total_rows?: number;
    row_offset?: number;
};

// #3 — Standard CSV line tokenizer. Quoted fields, escaped quotes, and embedded
// commas are handled. Embedded newlines inside quoted fields are NOT supported
// here because the streaming reader splits on '\n' before parsing. NPPES flat
// files do not embed newlines in the columns we extract, but if a future column
// needs that we'd switch to a stateful tokenizer.
function parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (ch === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += ch;
        }
    }
    result.push(current.trim());
    return result;
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 4): Promise<T> {
    let lastErr;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try { return await fn(); } catch (e) {
            lastErr = e;
            const msg = String(e?.message || '');
            const isRetryable = /429|rate limit|timeout|network|503|502|connection/i.test(msg);
            if (!isRetryable || attempt === maxRetries) throw e;
            const backoff = Math.min(1000 * Math.pow(2, attempt - 1) + Math.random() * 500, 10_000);
            console.warn(`[importNPPESFlatFile] retry ${attempt}/${maxRetries} after ${Math.round(backoff)}ms: ${msg}`);
            await sleep(backoff);
        }
    }
    throw lastErr;
}

// #3 — Upsert providers against existing records by NPI to avoid duplicates on
// re-runs and to refresh stale fields when NPPES updates a provider.
async function upsertProviderChunk(rows: any[], base44, dryRun: boolean): Promise<{
    imported: number;
    updated: number;
    skipped: number;
    errors: string[];
}> {
    if (dryRun || rows.length === 0) return { imported: 0, updated: 0, skipped: rows.length, errors: [] };

    const npis = [...new Set(rows.map(r => r.npi).filter(Boolean))];
    if (npis.length === 0) return { imported: 0, updated: 0, skipped: rows.length, errors: ['no rows had a valid npi'] };

    let existing = [];
    try {
        existing = await withRetry(() =>
            base44.asServiceRole.entities.Provider.filter({ npi: { $in: npis } }, undefined, npis.length + 50)
        );
    } catch (e) {
        // If the lookup fails we fall back to bulkCreate; the duplicate constraint
        // (if any) will reject; we just don't get the upsert benefit on this chunk.
        console.warn(`[importNPPESFlatFile] existing-NPI lookup failed: ${e.message}`);
    }
    const existingByNpi = new Map(existing.map(e => [e.npi, e]));

    const toCreate = [];
    const toUpdate = [];
    let skipped = 0;
    const seenInChunk = new Set<string>();
    for (const r of rows) {
        if (!r.npi) { skipped++; continue; }
        if (seenInChunk.has(r.npi)) { skipped++; continue; }
        seenInChunk.add(r.npi);
        const ex = existingByNpi.get(r.npi);
        if (!ex) {
            toCreate.push(r);
            continue;
        }
        // Only update if at least one field has changed and the incoming value is non-empty
        let differs = false;
        for (const k of Object.keys(r)) {
            if (r[k] === null || r[k] === undefined || r[k] === '') continue;
            if (String(ex[k] ?? '').trim() !== String(r[k]).trim()) { differs = true; break; }
        }
        if (differs) toUpdate.push({ id: ex.id, record: r });
        else skipped++;
    }

    const errors: string[] = [];
    let imported = 0;
    let updated = 0;

    if (toCreate.length > 0) {
        try {
            await withRetry(() => base44.asServiceRole.entities.Provider.bulkCreate(toCreate));
            imported += toCreate.length;
        } catch (e) {
            errors.push(`bulkCreate failed for ${toCreate.length} rows: ${e.message}`);
            // Per-record fallback so one bad row doesn't poison the whole chunk.
            for (const rec of toCreate) {
                try {
                    await withRetry(() => base44.asServiceRole.entities.Provider.create(rec));
                    imported++;
                } catch (innerErr) {
                    errors.push(`single create failed for npi=${rec.npi}: ${innerErr.message}`);
                }
            }
        }
    }

    if (toUpdate.length > 0) {
        // Fan out updates in small parallel groups
        for (let i = 0; i < toUpdate.length; i += 5) {
            const group = toUpdate.slice(i, i + 5);
            const results = await Promise.all(group.map(({ id, record }) =>
                withRetry(() => base44.asServiceRole.entities.Provider.update(id, record))
                    .then(() => true)
                    .catch(err => {
                        errors.push(`update failed for id=${id}: ${err.message}`);
                        return false;
                    })
            ));
            updated += results.filter(Boolean).length;
            if (i + 5 < toUpdate.length) await sleep(120);
        }
    }

    return { imported, updated, skipped, errors };
}

function mapRow(record: Record<string, string>, mapping: Record<string, string>): any | null {
    // Robust column lookup: prefer the explicit mapping table, fall back to common header names
    const npiKeyCandidates = [mapping['NPI'], mapping['npi'], 'NPI', 'npi'].filter(Boolean);
    let npi: string | undefined;
    for (const k of npiKeyCandidates) { if (record[k]) { npi = record[k]; break; } }
    if (!npi) return null;
    npi = String(npi).trim();
    if (!/^\d{10}$/.test(npi)) return null;

    const entityCode = record[mapping['Entity Type Code'] || 'Entity Type Code'] || '';
    return {
        npi,
        entity_type: entityCode === '1' ? 'Individual' : entityCode === '2' ? 'Organization' : '',
        first_name: (record[mapping['Provider First Name'] || 'Provider First Name'] || '').trim(),
        last_name: (record[mapping['Provider Last Name (Legal Name)'] || 'Provider Last Name (Legal Name)'] || '').trim(),
        organization_name: (record[mapping['Provider Organization Name (Legal Business Name)'] || 'Provider Organization Name (Legal Business Name)'] || '').trim(),
        status: 'Active',
    };
}

export default Deno.serve(async (req) => {
    const execStartTime = Date.now();
    const base44 = createClientFromRequest(req);

    let payload: ImportFlatFilePayload = {};
    try { payload = await req.json(); } catch (_) { /* no body */ }

    const { batch_id, file_url, byte_offset = 0, headers = null, total_rows = 0, row_offset = 0 } = payload;

    if (!batch_id || !file_url) {
        return Response.json({ error: 'Missing batch_id or file_url' }, { status: 400 });
    }

    let batch;
    try {
        batch = await base44.asServiceRole.entities.ImportBatch.get(batch_id);
        if (!batch) throw new Error('Batch not found');

        // Resume via byte range
        const fetchController = new AbortController();
        const fetchTimer = setTimeout(() => fetchController.abort(), FETCH_TIMEOUT_MS);
        let response;
        try {
            response = await fetch(file_url, {
                headers: { 'Range': `bytes=${byte_offset}-` },
                signal: fetchController.signal,
            });
        } finally {
            clearTimeout(fetchTimer);
        }

        if (!response.ok && response.status !== 206) {
            throw new Error(`Failed to fetch file chunk: HTTP ${response.status}`);
        }
        if (!response.body) throw new Error('Response body missing');

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');

        let buffer = '';
        let isFirstLine = byte_offset === 0;
        let currentHeaders = headers;
        let recordsProcessed = 0;
        let imported = 0;
        let updated = 0;
        let skipped = 0;
        const errorMessages: string[] = [];
        let currentByteOffset = byte_offset;
        let currentRowOffset = row_offset;
        let rowsAccumulator: any[] = [];

        const flushBuffer = async () => {
            if (rowsAccumulator.length === 0) return;
            const result = await upsertProviderChunk(rowsAccumulator, base44, batch.dry_run);
            imported += result.imported;
            updated += result.updated;
            skipped += result.skipped;
            for (const err of result.errors.slice(0, 5)) {
                if (errorMessages.length < 10) errorMessages.push(err);
            }
            rowsAccumulator = [];
        };

        let timeUp = false;
        let done = false;
        while (!done && !timeUp) {
            const { value, done: readerDone } = await reader.read();
            done = readerDone;

            if (value) {
                buffer += decoder.decode(value, { stream: true });
            } else if (done) {
                buffer += decoder.decode();
            }

            let newlineIndex;
            while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
                const line = buffer.substring(0, newlineIndex).trim();
                const consumedSlice = buffer.substring(0, newlineIndex + 1);
                const lineByteLength = new TextEncoder().encode(consumedSlice).length;

                buffer = buffer.substring(newlineIndex + 1);
                currentByteOffset += lineByteLength;

                if (!line) continue;

                if (isFirstLine) {
                    currentHeaders = parseCSVLine(line);
                    isFirstLine = false;
                    continue;
                }

                if (!currentHeaders) {
                    // Resume picked us up mid-file but no headers were passed in.
                    errorMessages.push('Resume started without headers — cannot map rows');
                    timeUp = true;
                    break;
                }

                const values = parseCSVLine(line);
                const record: Record<string, string> = {};
                for (let i = 0; i < currentHeaders.length; i++) {
                    record[currentHeaders[i]] = values[i] || '';
                }

                const mapped = mapRow(record, batch.column_mapping || {});
                if (mapped) rowsAccumulator.push(mapped);
                else skipped++;
                recordsProcessed++;
                currentRowOffset++;

                if (rowsAccumulator.length >= BULK_INSERT_SIZE) {
                    await flushBuffer();

                    await base44.asServiceRole.entities.ImportBatch.update(batch_id, {
                        imported_rows: (batch.imported_rows || 0) + imported,
                        updated_rows: (batch.updated_rows || 0) + updated,
                        skipped_rows: (batch.skipped_rows || 0) + skipped,
                        total_rows: total_rows + recordsProcessed,
                        retry_params: { byte_offset: currentByteOffset, row_offset: currentRowOffset },
                    });

                    if (Date.now() - execStartTime > MAX_EXEC_MS) {
                        timeUp = true;
                        break;
                    }
                }
            }
        }

        // Stop reading the response stream cleanly so the underlying connection releases
        try { reader.cancel(); } catch (_) { /* ignore */ }

        // Flush whatever's left
        await flushBuffer();

        if (timeUp) {
            // Schedule the next chunk and exit
            base44.asServiceRole.functions.invoke('importNPPESFlatFile', {
                batch_id,
                file_url,
                byte_offset: currentByteOffset,
                headers: currentHeaders,
                total_rows: total_rows + recordsProcessed,
                row_offset: currentRowOffset,
            }).catch(e => console.error(`[importNPPESFlatFile] Auto-resume invoke error:`, e));

            await base44.asServiceRole.entities.ImportBatch.update(batch_id, {
                status: 'paused',
                imported_rows: (batch.imported_rows || 0) + imported,
                updated_rows: (batch.updated_rows || 0) + updated,
                skipped_rows: (batch.skipped_rows || 0) + skipped,
                total_rows: total_rows + recordsProcessed,
                paused_at: new Date().toISOString(),
                cancel_reason: `Auto-paused at byte ${currentByteOffset.toLocaleString()} (row ${currentRowOffset.toLocaleString()}); will resume.`,
                retry_params: { byte_offset: currentByteOffset, row_offset: currentRowOffset },
                error_samples: errorMessages.slice(0, 10).map(m => ({ message: m })),
            });

            return Response.json({
                success: true,
                partial: true,
                next_byte_offset: currentByteOffset,
                next_row_offset: currentRowOffset,
                imported, updated, skipped,
                message: 'Time limit reached, scheduled next chunk',
            });
        }

        await base44.asServiceRole.entities.ImportBatch.update(batch_id, {
            status: 'completed',
            imported_rows: (batch.imported_rows || 0) + imported,
            updated_rows: (batch.updated_rows || 0) + updated,
            skipped_rows: (batch.skipped_rows || 0) + skipped,
            total_rows: total_rows + recordsProcessed,
            completed_at: new Date().toISOString(),
            cancel_reason: '',
            paused_at: '',
            error_samples: errorMessages.slice(0, 10).map(m => ({ message: m })),
        });

        return Response.json({
            success: true,
            imported, updated, skipped,
            total_rows_in_chunk: recordsProcessed,
            message: 'Finished processing file.',
        });

    } catch (e) {
        try {
            await base44.asServiceRole.entities.ImportBatch.update(batch_id, {
                status: 'failed',
                error_samples: [{ message: e?.message || String(e) }],
            });
        } catch (updateErr) {
            console.error(`[importNPPESFlatFile] failed batch update for ${batch_id}: ${updateErr.message}`);
        }
        return Response.json({ error: e?.message || String(e) }, { status: 500 });
    }
});
