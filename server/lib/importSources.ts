// Where an import's rows come from. The CMS APIs are paged JSON endpoints
// (handled inline by handleAutoImportCMSData); this module adds files: a CSV
// an admin uploaded through /api/integrations/file/upload (served back as
// /api/storage/<name> and stored under uploads/), or a CSV at an https link,
// fetched through the SSRF guard.
import fs from "fs";
import path from "path";
import { Readable } from "stream";
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

/** A byte stream for a CSV source: the uploaded file, or the https response body. */
export async function openCsvSource(fileUrl: string, opts: { signal?: AbortSignal } = {}): Promise<AsyncIterable<Uint8Array>> {
  const local = localUploadPath(fileUrl);
  if (local) {
    await fs.promises.access(local, fs.constants.R_OK).catch(() => {
      throw new Error(`Uploaded file not found: ${path.basename(local)}. Upload it again and retry.`);
    });
    return fs.createReadStream(local);
  }
  const res = await safeFetchStream(fileUrl, { signal: opts.signal });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${fileUrl}`);
  if (!res.body) throw new Error(`Empty response from ${fileUrl}`);
  return Readable.fromWeb(res.body as any) as unknown as AsyncIterable<Uint8Array>;
}

/** Rows of a CSV source (see csvRecords for header handling). */
export async function* csvSourceRecords(fileUrl: string, opts: CsvRecordOptions & { signal?: AbortSignal } = {}): AsyncGenerator<Record<string, string>> {
  const stream = await openCsvSource(fileUrl, { signal: opts.signal });
  yield* csvRecords(stream, opts);
}
