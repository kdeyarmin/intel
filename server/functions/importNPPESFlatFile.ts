import { db } from "../db";
import { importBatches, providers } from "../db/schema";
import { eq } from "drizzle-orm";

const MAX_EXEC_MS = 50000;
const BULK_INSERT_SIZE = 1000;
const PAUSE_CHECK_INTERVAL = 5;

async function safeFlatFileQuery<T>(fn: () => Promise<T>, fallback: T, label: string): Promise<T> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      if (attempt === 3) {
        console.warn(`[importNPPESFlatFile] ${label} failed after 3 attempts: ${e.message}`);
        return fallback;
      }
      await new Promise(r => setTimeout(r, attempt * 2000));
    }
  }
  return fallback;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
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
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

export async function handleImportNPPESFlatFile(payload: any) {
  const { batch_id, file_url, byte_offset = 0, headers = null, total_rows = 0 } = payload;

  if (!batch_id || !file_url) {
    throw { status: 400, message: "Missing batch_id or file_url" };
  }

  const execStartTime = Date.now();

  try {
    const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, batch_id)).limit(1);
    if (!batch) throw new Error("Batch not found");

    const response = await fetch(file_url, {
      headers: { Range: `bytes=${byte_offset}-` },
    });

    if (!response.ok && response.status !== 206) {
      throw new Error(`Failed to fetch file chunk: HTTP ${response.status}`);
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder("utf-8");

    let buffer = "";
    let isFirstLine = byte_offset === 0;
    let currentHeaders = headers;
    let recordsProcessed = 0;
    let currentByteOffset = byte_offset;
    let rowsAccumulator: any[] = [];
    let done = false;
    let bulkInsertCount = 0;

    while (!done) {
      const { value, done: readerDone } = await reader.read();
      done = readerDone;

      if (value) {
        buffer += decoder.decode(value, { stream: true });
      } else if (done) {
        buffer += decoder.decode();
      }

      let newlineIndex;
      while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
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
        const record: Record<string, string> = {};
        for (let i = 0; i < (currentHeaders || []).length; i++) {
          record[currentHeaders![i]] = values[i] || "";
        }

        rowsAccumulator.push(record);
        recordsProcessed++;

        if (rowsAccumulator.length >= BULK_INSERT_SIZE) {
          await processBulkRows(rowsAccumulator, batch.dry_run || false);
          rowsAccumulator = [];
          bulkInsertCount++;

          if (bulkInsertCount % PAUSE_CHECK_INTERVAL === 0) {
            const [currentBatch] = await safeFlatFileQuery(
              () => db.select().from(importBatches).where(eq(importBatches.id, batch_id)).limit(1),
              [] as any[], "pause check"
            );
            if (currentBatch && (currentBatch.status === "paused" || currentBatch.status === "cancelled")) {
              console.log(`[importNPPESFlatFile] Import ${currentBatch.status} by user at byte offset ${currentByteOffset}`);
              try { reader.cancel(); } catch (_) {}
              await safeFlatFileQuery(
                () => db.update(importBatches).set({
                  imported_rows: (batch.imported_rows || 0) + recordsProcessed,
                  retry_params: { file_url, byte_offset: currentByteOffset, headers: currentHeaders, total_rows: total_rows + recordsProcessed },
                  updated_date: new Date(),
                }).where(eq(importBatches.id, batch_id)),
                undefined, "save progress on pause"
              );
              return { success: true, message: `Import ${currentBatch.status} by user`, paused: true };
            }

            await safeFlatFileQuery(
              () => db.update(importBatches).set({
                imported_rows: (batch.imported_rows || 0) + recordsProcessed,
                updated_date: new Date(),
              }).where(eq(importBatches.id, batch_id)),
              undefined, "update progress"
            );
          }

          if (Date.now() - execStartTime > MAX_EXEC_MS) {
            try { reader.cancel(); } catch (_) {}
            setTimeout(() => {
              handleImportNPPESFlatFile({
                batch_id,
                file_url,
                byte_offset: currentByteOffset,
                headers: currentHeaders,
                total_rows: total_rows + recordsProcessed,
              }).catch((e: any) => console.error(`[importNPPESFlatFile] Auto-resume error:`, e.message));
            }, 2000);
            return { success: true, message: "Time limit reached, triggering next chunk", next_offset: currentByteOffset };
          }
        }
      }
    }

    if (rowsAccumulator.length > 0) {
      await processBulkRows(rowsAccumulator, batch.dry_run || false);
    }

    await safeFlatFileQuery(
      () => db.update(importBatches).set({
        imported_rows: (batch.imported_rows || 0) + recordsProcessed,
        status: "completed",
        completed_at: new Date(),
        cancel_reason: "",
        updated_date: new Date(),
      }).where(eq(importBatches.id, batch_id)),
      undefined, "complete batch"
    );

    return { success: true, message: "Finished processing file." };
  } catch (e: any) {
    console.error(`[importNPPESFlatFile] Error:`, e.message);
    await safeFlatFileQuery(
      () => db.update(importBatches).set({
        status: "failed",
        error_samples: [{ message: e.message }],
        updated_date: new Date(),
      }).where(eq(importBatches.id, batch_id)),
      undefined, "fail batch"
    );
    throw e;
  }
}

async function processBulkRows(rows: any[], dryRun: boolean) {
  if (dryRun) return;

  const providerRows: any[] = [];
  for (const row of rows) {
    const npi = row["NPI"] || row["npi"];
    if (!npi) continue;

    providerRows.push({
      npi,
      entity_type: row["Entity Type Code"] === "1" ? "Individual" : "Organization",
      first_name: row["Provider First Name"] || row["provider_first_name"] || "",
      last_name: row["Provider Last Name (Legal Name)"] || row["provider_last_name"] || "",
      organization_name: row["Provider Organization Name (Legal Business Name)"] || row["provider_organization_name"] || "",
      status: "Active",
    });
  }

  if (providerRows.length > 0) {
    const bulkResult = await safeFlatFileQuery(
      async () => { await db.insert(providers).values(providerRows).onConflictDoNothing(); return true; },
      false, "bulk insert providers"
    );
    if (!bulkResult) {
      let ok = 0, fail = 0;
      for (const p of providerRows) {
        const singleOk = await safeFlatFileQuery(
          async () => { await db.insert(providers).values(p).onConflictDoNothing(); return true; },
          false, "single insert provider"
        );
        if (singleOk) ok++;
        else fail++;
      }
      console.log(`[importNPPESFlatFile] Individual fallback: ${ok} created, ${fail} skipped`);
    }
  }
}
