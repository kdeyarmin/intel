// Where an import's rows come from. The CMS APIs are paged JSON endpoints
// (handled inline by handleAutoImportCMSData); this module adds files: a CSV
// an admin uploaded through /api/integrations/file/upload (served back as
// /api/storage/<name> and stored under uploads/), or a CSV at an https link,
// fetched through the SSRF guard.
import fs from "fs";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import yauzl from "yauzl";
import { safeFetchStream } from "./safeFetch";
import { csvRecords, type CsvRecordOptions } from "./csv";
import { datasetIdFromUrl } from "./cmsCatalog";

export const UPLOAD_DIR = path.resolve("uploads");
const STORAGE_PREFIX = "/api/storage/";

export type ImportSourceKind = "cms_data_api" | "cms_provider_data" | "local_csv" | "remote_csv";

/** What kind of source a file_url names. */
export function sourceKindFor(fileUrl: string | null | undefined): ImportSourceKind {
  if (!fileUrl) return "cms_data_api";
  if (isLocalUpload(fileUrl)) return "local_csv";
  const id = datasetIdFromUrl(fileUrl);
  if (id) return id.source;
  if (/\/datastore\/query\//.test(fileUrl)) return "cms_provider_data";
  if (/\/data-api\/v1\/dataset\//.test(fileUrl)) return "cms_data_api";
  return "remote_csv";
}

export function isLocalUpload(fileUrl: string | null | undefined): boolean {
  return typeof fileUrl === "string" && fileUrl.startsWith(STORAGE_PREFIX);
}

/**
 * The on-disk path of an uploaded file, or null when the link doesn't name
 * one. Only the basename is used, so a link can't reach outside uploads/.
 */
export function localUploadPath(fileUrl: string, uploadDir = UPLOAD_DIR): string | null {
  if (!isLocalUpload(fileUrl)) return null;
  const name = path.basename(decodeURIComponent(fileUrl.slice(STORAGE_PREFIX.length).split(/[?#]/)[0]));
  if (!name || name === "." || name === "..") return null;
  const full = path.join(uploadDir, name);
  if (!full.startsWith(uploadDir + path.sep)) return null;
  return full;
}

/** A remote file that sends nothing for this long (or never answers) is given up on. */
export const CSV_IDLE_TIMEOUT_MS = 2 * 60 * 1000;

/** Downloaded zips live here, not under uploads/ (that directory is served to signed-in users). */
export const IMPORT_ZIP_DIR = path.resolve("downloads/imports");

/** The CMS FOIA shared-patient download is a zip of one headerless .txt. */
export function isZipFileUrl(fileUrl: string | null | undefined): boolean {
  if (!fileUrl) return false;
  return /\.zip$/i.test(fileUrl.split(/[?#]/)[0]);
}

function isTextZipEntry(name: string): boolean {
  const base = path.basename(name);
  if (!base || base.startsWith(".") || name.includes("__MACOSX")) return false;
  return /\.(txt|csv)$/i.test(base);
}

/**
 * The first .txt or .csv member of a zip, as a byte stream. CMS publishes
 * Physician Shared Patient Patterns as one headerless text file inside the zip.
 */
export function openZipTextEntry(zipPath: string): Promise<{ stream: Readable; entryName: string; close: () => void }> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true, autoClose: false }, (err, zipfile) => {
      if (err || !zipfile) return reject(err || new Error("Could not open zip"));
      const names: string[] = [];
      let settled = false;
      const fail = (e: Error) => {
        if (settled) return;
        settled = true;
        zipfile.close();
        reject(e);
      };
      zipfile.on("entry", (entry: { fileName: string }) => {
        if (entry.fileName.endsWith("/")) {
          zipfile.readEntry();
          return;
        }
        names.push(entry.fileName);
        if (!isTextZipEntry(entry.fileName)) {
          zipfile.readEntry();
          return;
        }
        zipfile.openReadStream(entry as never, (e: Error | null, stream?: Readable) => {
          if (e || !stream) return fail(e || new Error("Could not read the zip entry"));
          settled = true;
          resolve({ stream, entryName: entry.fileName, close: () => zipfile.close() });
        });
      });
      zipfile.on("end", () => {
        if (!settled) fail(new Error(`No .txt or .csv in the zip${names.length ? ` (${names.slice(0, 5).join(", ")})` : ""}`));
      });
      zipfile.on("error", fail);
      zipfile.readEntry();
    });
  });
}

async function downloadToFile(fileUrl: string, dest: string, opts: { signal?: AbortSignal; idleMs?: number } = {}): Promise<void> {
  const idleMs = opts.idleMs ?? CSV_IDLE_TIMEOUT_MS;
  const controller = new AbortController();
  if (opts.signal) {
    if (opts.signal.aborted) controller.abort(opts.signal.reason);
    else opts.signal.addEventListener("abort", () => controller.abort(opts.signal!.reason), { once: true });
  }
  const connectTimer = setTimeout(() => controller.abort(new Error(`No response from the server within ${Math.max(1, Math.round(idleMs / 1000))} seconds.`)), idleMs);
  let res: Awaited<ReturnType<typeof safeFetchStream>>;
  try {
    res = await safeFetchStream(fileUrl, { signal: controller.signal });
  } finally {
    clearTimeout(connectTimer);
  }
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} fetching ${fileUrl}`);
  await fs.promises.mkdir(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.part`;
  const body = withIdleTimeout(Readable.fromWeb(res.body as any) as unknown as AsyncIterable<Uint8Array>, controller, idleMs);
  await pipeline(Readable.from(body), fs.createWriteStream(tmp));
  await fs.promises.rename(tmp, dest);
}

/** A zip on disk: an upload, or an https link downloaded once and reused. */
async function zipPathFor(fileUrl: string, opts: { signal?: AbortSignal; idleMs?: number } = {}): Promise<string> {
  const local = localUploadPath(fileUrl);
  if (local) {
    await fs.promises.access(local, fs.constants.R_OK).catch(() => {
      throw new Error(`Uploaded file not found: ${path.basename(local)}. Upload it again and retry.`);
    });
    return local;
  }
  const name = path.basename(new URL(fileUrl).pathname);
  if (!name || name === "." || name === "..") throw new Error("Zip URL has no file name");
  const dest = path.join(IMPORT_ZIP_DIR, name);
  const existing = await fs.promises.stat(dest).catch(() => null);
  if (existing && existing.size > 0) return dest;
  await downloadToFile(fileUrl, dest, opts);
  return dest;
}

/**
 * Passes `stream` through, but gives up (aborting `controller`) when the next chunk takes
 * longer than `idleMs` to arrive, so a server that accepts the connection and then stalls
 * can't hold an import "processing" for good. Time the consumer spends on a chunk isn't counted.
 */
export async function* withIdleTimeout(stream: AsyncIterable<Uint8Array>, controller: AbortController, idleMs: number): AsyncGenerator<Uint8Array> {
  const iterator = stream[Symbol.asyncIterator]();
  try {
    while (true) {
      let timer: NodeJS.Timeout | undefined;
      const idle = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          const err = new Error(`No data received for ${Math.max(1, Math.round(idleMs / 1000))} seconds; the transfer was abandoned.`);
          controller.abort(err);
          reject(err);
        }, idleMs);
      });
      let step: IteratorResult<Uint8Array>;
      try {
        step = await Promise.race([iterator.next(), idle]);
      } finally {
        clearTimeout(timer);
      }
      if (step.done) return;
      yield step.value;
    }
  } finally {
    // Not awaited: on a stalled source this would wait behind the read that never finishes.
    void Promise.resolve(iterator.return?.()).catch(() => {});
  }
}

/**
 * A byte stream for a CSV source: the uploaded file, or the https response body.
 * `idleMs` bounds both the wait for the response and any later silence on the wire.
 */
export async function openCsvSource(fileUrl: string, opts: { signal?: AbortSignal; idleMs?: number } = {}): Promise<AsyncIterable<Uint8Array>> {
  const local = localUploadPath(fileUrl);
  if (local) {
    await fs.promises.access(local, fs.constants.R_OK).catch(() => {
      throw new Error(`Uploaded file not found: ${path.basename(local)}. Upload it again and retry.`);
    });
    return fs.createReadStream(local);
  }
  const idleMs = opts.idleMs ?? CSV_IDLE_TIMEOUT_MS;
  const controller = new AbortController();
  if (opts.signal) {
    if (opts.signal.aborted) controller.abort(opts.signal.reason);
    else opts.signal.addEventListener("abort", () => controller.abort(opts.signal!.reason), { once: true });
  }
  const connectTimer = setTimeout(() => controller.abort(new Error(`No response from the server within ${Math.max(1, Math.round(idleMs / 1000))} seconds.`)), idleMs);
  let res: Awaited<ReturnType<typeof safeFetchStream>>;
  try {
    res = await safeFetchStream(fileUrl, { signal: controller.signal });
  } finally {
    clearTimeout(connectTimer);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${fileUrl}`);
  if (!res.body) throw new Error(`Empty response from ${fileUrl}`);
  return withIdleTimeout(Readable.fromWeb(res.body as any) as unknown as AsyncIterable<Uint8Array>, controller, idleMs);
}

/** Rows of a CSV source (see csvRecords for header handling). A .zip is read from its .txt/.csv member. */
export async function* csvSourceRecords(fileUrl: string, opts: CsvRecordOptions & { signal?: AbortSignal; idleMs?: number } = {}): AsyncGenerator<Record<string, string>> {
  if (isZipFileUrl(fileUrl)) {
    const zipPath = await zipPathFor(fileUrl, { signal: opts.signal, idleMs: opts.idleMs });
    const opened = await openZipTextEntry(zipPath);
    try {
      yield* csvRecords(opened.stream, opts);
    } finally {
      opened.close();
    }
    return;
  }
  const stream = await openCsvSource(fileUrl, { signal: opts.signal, idleMs: opts.idleMs });
  yield* csvRecords(stream, opts);
}
