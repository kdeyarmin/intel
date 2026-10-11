// NPPES V.2 dissemination files: the weekly incremental and the monthly full
// replacement zips from download.cms.gov. The zip is downloaded to
// uploads/nppes/, the npidata_pfile CSV inside it is streamed, and each
// page of rows is written through server/lib/nppesWrite.ts (upserts;
// locations and taxonomies replaced per NPI; deactivations applied).
import fs from "fs";
import path from "path";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import yauzl from "yauzl";
import { db, pool } from "../db";
import { importBatches } from "../db/schema";
import { eq } from "drizzle-orm";
import { safeFetchStream } from "../lib/safeFetch";
import { csvRecords, pageRecords } from "../lib/csv";
import { nppesRowToRecords, writeNppesRecords, missingNppesIndexes, type NppesRecords } from "../lib/nppesWrite";
import { classifyNppesLink, type NppesFileKind } from "../lib/nppesFiles";
import { markImportFinished } from "../lib/datasetRegistry";
import { settleBatchCompletion } from "../lib/importCompletion";
import { mergeRetryParams, endedWithoutFinishing } from "../lib/importProgress";
import { getExcludedCredentials, isCredentialExcluded } from "./importNPPESFlatFile";
import { UPLOAD_DIR } from "../lib/importSources";
import { getTaxonomyIndex } from "../lib/taxonomy";

export const NPPES_FILE_TYPES: Record<string, NppesFileKind> = {
  nppes_weekly_incremental: "weekly",
  nppes_monthly_full: "monthly",
};

const NPPES_DIR = path.join(UPLOAD_DIR, "nppes");
const PAGE_SIZE = 500;
const PAUSE_CHECK_INTERVAL = 5;
const PROGRESS_UPDATE_INTERVAL = 5;
const NPIDATA_RE = /^npidata_pfile_\d{8}-\d{8}\.csv$/i;

/** Download a CMS file to uploads/nppes/ (reused when already present and non-empty). */
export async function downloadNppesZip(fileUrl: string): Promise<string> {
  await fs.promises.mkdir(NPPES_DIR, { recursive: true });
  const dest = path.join(NPPES_DIR, path.basename(new URL(fileUrl).pathname));
  const existing = await fs.promises.stat(dest).catch(() => null);
  if (existing && existing.size > 0) return dest;
  const res = await safeFetchStream(fileUrl);
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} fetching ${fileUrl}`);
  const tmp = `${dest}.part`;
  await pipeline(Readable.fromWeb(res.body as any), fs.createWriteStream(tmp));
  await fs.promises.rename(tmp, dest);
  return dest;
}

/** The npidata_pfile entry of a dissemination zip, as a byte stream. */
export function openNpiDataStream(zipPath: string): Promise<{ stream: Readable; entryName: string; close: () => void }> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) return reject(err || new Error("zip open failed"));
      let found = false;
      zipfile.on("entry", (entry) => {
        if (NPIDATA_RE.test(path.basename(entry.fileName))) {
          found = true;
          zipfile.openReadStream(entry, (e, stream) => {
            if (e || !stream) return reject(e || new Error("zip entry open failed"));
            resolve({ stream, entryName: entry.fileName, close: () => zipfile.close() });
          });
        } else {
          zipfile.readEntry();
        }
      });
      zipfile.on("end", () => { if (!found) reject(new Error("No npidata_pfile CSV in the zip")); });
      zipfile.on("error", reject);
      zipfile.readEntry();
    });
  });
}

export async function handleImportNPPESFile(payload: { batch_id: number; file_url: string; import_type: string; resume_offset?: number; dry_run?: boolean }) {
  const { batch_id, file_url, import_type, resume_offset = 0, dry_run = false } = payload;
  const file = classifyNppesLink(file_url);
  let rowsRead = Number(resume_offset) || 0;
  let providersWritten = 0;
  let invalid = 0;
  let excluded = 0;
  let locations = 0;
  let locationsRemoved = 0;
  let taxonomies = 0;
  let stale = 0;
  let unmatched = 0;
  let pages = 0;
  let zipPath: string | null = null;
  let close: (() => void) | null = null;

  const saveProgress = (extra: Record<string, unknown> = {}) => db.update(importBatches).set({
    ...extra,
    imported_rows: providersWritten,
    skipped_rows: invalid + excluded,
    total_rows: rowsRead,
    retry_params: mergeRetryParams({ file_url, import_type, resume_offset: rowsRead, providers_written: providersWritten }),
    updated_date: new Date(),
  }).where(eq(importBatches.id, batch_id)).catch((e) => console.warn("[importNPPESFile] progress:", e?.message));

  try {
    // Before the (large) download: the location and taxonomy upserts conflict
    // on unique indexes the server builds in the background after start-up.
    if (!dry_run) {
      const missing = await missingNppesIndexes(pool);
      if (missing.length) {
        throw new Error(`The unique indexes ${missing.join(", ")} are missing or still building (the server builds them in the background after start-up; see the "[DB Index]" log lines). Retry once they exist; if the build keeps failing, run scripts/dedupe-existing-imports.sql first.`);
      }
    }
    zipPath = await downloadNppesZip(file_url);
    const opened = await openNpiDataStream(zipPath);
    close = opened.close;
    const excludedSet = await getExcludedCredentials().catch(() => new Set<string>());
    // The dissemination files carry taxonomy codes only; descriptions come
    // from the bundled NUCC code set (empty until it is loaded, in which case
    // the description stays whatever the crawler stored).
    const taxonomy = await getTaxonomyIndex(pool);
    const describeTaxonomy = (code: string) => taxonomy.describe(code);
    const records = csvRecords(opened.stream, { normalizeHeaders: false });
    for await (const page of pageRecords(records, PAGE_SIZE, Number(resume_offset) || 0)) {
      pages++;
      if (pages % PAUSE_CHECK_INTERVAL === 0) {
        const [current] = await db.select({ status: importBatches.status }).from(importBatches).where(eq(importBatches.id, batch_id)).limit(1).catch(() => [] as any[]);
        if (current && (current.status === "paused" || current.status === "cancelled")) {
          await saveProgress();
          await endedWithoutFinishing(import_type, batch_id, current.status);
          return;
        }
      }
      const batchRecords: NppesRecords[] = [];
      for (const row of page.rows) {
        const rec = nppesRowToRecords(row);
        if (!rec) { invalid++; continue; }
        if (rec.provider.entity_type === "Individual" && excludedSet.size > 0 && rec.provider.credential && isCredentialExcluded(rec.provider.credential, excludedSet)) { excluded++; continue; }
        batchRecords.push(rec);
      }
      if (!dry_run && batchRecords.length) {
        const client = await pool.connect();
        try {
          const stats = await writeNppesRecords(client, batchRecords, { describeTaxonomy });
          providersWritten += stats.providers;
          locations += stats.locations;
          locationsRemoved += stats.locations_removed;
          taxonomies += stats.taxonomies;
          stale += stats.providers_stale;
          unmatched += stats.deactivations_unmatched;
        } finally {
          client.release();
        }
      } else {
        providersWritten += batchRecords.length;
      }
      rowsRead = page.nextOffset;
      if (pages % PROGRESS_UPDATE_INTERVAL === 0) await saveProgress();
    }
    await db.update(importBatches).set({
      status: "completed",
      completed_at: new Date(),
      imported_rows: providersWritten,
      skipped_rows: invalid + excluded,
      total_rows: rowsRead,
      error_samples: null,
      retry_params: mergeRetryParams({ file_url, import_type, resume_offset: rowsRead, locations, locations_removed: locationsRemoved, taxonomies, invalid_npis: invalid, excluded_credentials: excluded, stale_rows: stale, unmatched_deactivations: unmatched, unknown_taxonomy_codes: [...taxonomy.unknown].slice(0, 50) }),
      updated_date: new Date(),
    }).where(eq(importBatches.id, batch_id));
    console.log(`[importNPPESFile] Completed ${import_type}: rows=${rowsRead}, providers=${providersWritten}, locations=${locations} (+${locationsRemoved} removed), taxonomies=${taxonomies}, invalid=${invalid}, excluded=${excluded}, stale=${stale}, unmatched deactivations=${unmatched}`);
    if (taxonomy.unknown.size > 0) {
      console.warn(`[importNPPESFile] ${taxonomy.unknown.size} taxonomy code(s) not in the NUCC ${taxonomy.version ?? "?"} code set, e.g. ${[...taxonomy.unknown].slice(0, 10).join(", ")}; rebuild server/data/nucc from the current NUCC release`);
    }
    await markImportFinished(import_type, { batchId: batch_id, ok: !dry_run, rowCount: rowsRead, dataYear: file?.periodEnd?.slice(0, 4) ?? null, note: dry_run ? "dry run" : `file ${path.basename(file_url)}` }).catch(() => {});
  } catch (e: any) {
    console.error(`[importNPPESFile] Failed ${import_type}:`, e?.message || e);
    await saveProgress({ status: "failed", error_samples: [{ message: String(e?.message || e).slice(0, 300), phase: "nppes_file" }] });
    await markImportFinished(import_type, { batchId: batch_id, ok: false, note: String(e?.message || e).slice(0, 200) }).catch(() => {});
  } finally {
    close?.();
    if (zipPath && !dry_run) await fs.promises.unlink(zipPath).catch(() => {});
  }
  await settleBatchCompletion(batch_id);
}
