import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const MAX_EXEC_MS = 45000; // Limit execution to 45 seconds to avoid timeouts
const BULK_INSERT_SIZE = 500;

type ImportFlatFilePayload = {
    batch_id?: string;
    file_url?: string;
    byte_offset?: number;
    headers?: string[] | null;
    total_rows?: number;
};

function parseCSVLine(line) {
    const result = [];
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

export default Deno.serve(async (req) => {
    const execStartTime = Date.now();
    const base44 = createClientFromRequest(req);
    
    let payload: ImportFlatFilePayload = {};
    try { payload = await req.json(); } catch(e) {}
    
    const { batch_id, file_url, byte_offset = 0, headers = null, total_rows = 0 } = payload;
    
    if (!batch_id || !file_url) {
        return Response.json({ error: 'Missing batch_id or file_url' }, { status: 400 });
    }

    try {
        const batch = await base44.asServiceRole.entities.ImportBatch.get(batch_id);
        if (!batch) throw new Error('Batch not found');
        
        // Use Range header to resume from the last byte processed
        const response = await fetch(file_url, {
            headers: { 'Range': `bytes=${byte_offset}-` }
        });
        
        if (!response.ok && response.status !== 206) {
            throw new Error(`Failed to fetch file chunk: HTTP ${response.status}`);
        }
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        
        let buffer = '';
        let isFirstLine = byte_offset === 0;
        let currentHeaders = headers;
        let recordsProcessed = 0;
        let currentByteOffset = byte_offset;
        let rowsAccumulator = [];
        
        let done = false;
        
        while (!done) {
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
                const lineByteLength = new TextEncoder().encode(buffer.substring(0, newlineIndex + 1)).length;
                
                buffer = buffer.substring(newlineIndex + 1);
                currentByteOffset += lineByteLength;
                
                if (!line) continue;
                
                if (isFirstLine) {
                    currentHeaders = parseCSVLine(line);
                    isFirstLine = false;
                    continue;
                }
                
                const values = parseCSVLine(line);
                const record = {};
                for (let i = 0; i < currentHeaders.length; i++) {
                    record[currentHeaders[i]] = values[i] || '';
                }
                
                rowsAccumulator.push(record);
                recordsProcessed++;
                
                if (rowsAccumulator.length >= BULK_INSERT_SIZE) {
                    // Process bulk insert based on column mapping
                    await processBulkRows(rowsAccumulator, batch.column_mapping || {}, base44, batch.dry_run);
                    rowsAccumulator = [];
                    
                    // Update batch progress
                    await base44.asServiceRole.entities.ImportBatch.update(batch_id, {
                        imported_rows: (batch.imported_rows || 0) + recordsProcessed
                    });
                    
                    // Check time limit
                    if (Date.now() - execStartTime > MAX_EXEC_MS) {
                        // Time's up, invoke next chunk
                        reader.cancel(); // Stop fetching
                        base44.asServiceRole.functions.invoke('importNPPESFlatFile', {
                            batch_id,
                            file_url,
                            byte_offset: currentByteOffset,
                            headers: currentHeaders,
                            total_rows: total_rows + recordsProcessed
                        }).catch(e => console.error(`[importNPPESFlatFile] Auto-resume invoke error:`, e));
                        
                        return Response.json({ success: true, message: 'Time limit reached, triggering next chunk', next_offset: currentByteOffset });
                    }
                }
            }
        }
        
        // Process remaining rows
        if (rowsAccumulator.length > 0) {
            await processBulkRows(rowsAccumulator, batch.column_mapping || {}, base44, batch.dry_run);
            await base44.asServiceRole.entities.ImportBatch.update(batch_id, {
                imported_rows: (batch.imported_rows || 0) + rowsAccumulator.length,
                status: 'completed',
                completed_at: new Date().toISOString(),
                cancel_reason: "",
                paused_at: ""
            });
        } else {
            await base44.asServiceRole.entities.ImportBatch.update(batch_id, {
                status: 'completed',
                completed_at: new Date().toISOString(),
                cancel_reason: "",
                paused_at: ""
            });
        }
        
        return Response.json({ success: true, message: 'Finished processing file.' });
        
    } catch (e) {
        await base44.asServiceRole.entities.ImportBatch.update(batch_id, {
            status: 'failed',
            error_samples: [{ message: e.message }]
        });
        return Response.json({ error: e.message }, { status: 500 });
    }
});

async function processBulkRows(rows, mapping, base44, dryRun) {
    if (dryRun) return;
    
    const providers = [];
    const npiKey = Object.keys(mapping).find(k => k.toLowerCase() === 'npi') || 'NPI';
    
    for (const row of rows) {
        const npi = row[mapping[npiKey] || 'NPI'];
        if (!npi) continue;
        
        const provider = {
            npi,
            entity_type: row[mapping['Entity Type Code']] === '1' ? 'Individual' : 'Organization',
            first_name: row[mapping['Provider First Name']],
            last_name: row[mapping['Provider Last Name (Legal Name)']],
            organization_name: row[mapping['Provider Organization Name (Legal Business Name)']],
            status: 'Active'
        };
        providers.push(provider);
    }
    
    if (providers.length > 0) {
        try {
            await base44.asServiceRole.entities.Provider.bulkCreate(providers);
        } catch (e) {
            // Ignore bulk insert conflicts in this simple version
        }
    }
}
