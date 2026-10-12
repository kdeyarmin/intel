// Streaming CSV reading shared by the importers: the NPPES flat file, user
// uploads (shared-patient files, licensing lists) and remote CSV links.

/** One CSV line → fields, honouring quotes and doubled quotes. */
export function parseCSVLine(line: string): string[] {
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

/** "Total Referrals (count)" → "total_referrals_count"; a UTF-8 BOM is dropped. */
export function normalizeHeader(header: string): string {
  return String(header || "")
    .replace(/^﻿/, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export interface CsvRecordOptions {
  /** Headers to use when the file has none (its first line is data). */
  headers?: string[] | null;
  /** Normalize header names to lower snake case (default true). The original header is kept as well. */
  normalizeHeaders?: boolean;
}

/**
 * Rows of a CSV byte stream, one object per data line. Each row carries the
 * normalized header as key and, when it differs, the original header too, so
 * mappers written for either shape find their columns.
 */
export async function* csvRecords(source: AsyncIterable<Uint8Array | string>, opts: CsvRecordOptions = {}): AsyncGenerator<Record<string, string>> {
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let headers: string[] | null = opts.headers ? [...opts.headers] : null;
  let keys: string[][] | null = null;
  const normalize = opts.normalizeHeaders !== false;

  const keysFor = (hs: string[]) => hs.map((h) => {
    const original = String(h || "").replace(/^﻿/, "").trim();
    if (!normalize) return [original];
    const norm = normalizeHeader(original);
    return norm && norm !== original ? [norm, original] : [original];
  });
  if (headers) keys = keysFor(headers);

  const emit = (line: string): Record<string, string> | null => {
    if (!headers) {
      headers = parseCSVLine(line);
      keys = keysFor(headers);
      return null;
    }
    const values = parseCSVLine(line);
    const row: Record<string, string> = {};
    for (let i = 0; i < keys!.length; i++) {
      for (const k of keys![i]) if (k) row[k] = values[i] ?? "";
    }
    return row;
  };

  // A quoted field may contain line breaks (a street address over two lines), so a record goes on over the
  // next line while a quote is still open: an odd number of quote characters, since escaped quotes come in
  // pairs. Bounded, so one stray quote in a damaged file can't swallow the rest of it into a single row.
  let record = "";
  let quoteOpen = false;
  const hasOddQuotes = (text: string) => {
    let quotes = 0;
    for (let i = text.indexOf('"'); i >= 0; i = text.indexOf('"', i + 1)) quotes += 1;
    return quotes % 2 === 1;
  };

  for await (const chunk of source) {
    buffer += typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const piece = buffer.slice(0, nl).replace(/\r$/, "");
      buffer = buffer.slice(nl + 1);
      // Parity is carried from line to line, so each line is scanned once however long a record runs.
      if (hasOddQuotes(piece)) quoteOpen = !quoteOpen;
      record = record ? `${record}\n${piece}` : piece;
      if (quoteOpen && record.length < MAX_RECORD_CHARS) continue;
      const line = record;
      record = "";
      quoteOpen = false;
      if (!line.trim()) continue;
      const row = emit(line);
      if (row) yield row;
    }
  }
  buffer += decoder.decode();
  const last = (record ? `${record}\n${buffer}` : buffer).replace(/\r$/, "");
  if (last.trim()) {
    const row = emit(last);
    if (row) yield row;
  }
}

/** A record longer than this is taken as it stands: it is a damaged file, not an address. */
const MAX_RECORD_CHARS = 1_000_000;

/** Groups records into pages of `size`, skipping the first `skip` data rows (resume). */
export async function* pageRecords<T>(records: AsyncIterable<T>, size: number, skip = 0): AsyncGenerator<{ rows: T[]; offset: number; nextOffset: number }> {
  let seen = 0;
  let page: T[] = [];
  let pageStart = skip;
  for await (const r of records) {
    seen++;
    if (seen <= skip) continue;
    page.push(r);
    if (page.length >= size) {
      yield { rows: page, offset: pageStart, nextOffset: pageStart + page.length };
      pageStart += page.length;
      page = [];
    }
  }
  if (page.length) yield { rows: page, offset: pageStart, nextOffset: pageStart + page.length };
}
