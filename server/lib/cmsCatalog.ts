// Pure parsers for the two CMS dataset catalogs, and the rule for which
// version of a dataset an import type should load.
//
// data.cms.gov publishes every yearly release of a dataset as its own entry
// (its own UUID) in https://data.cms.gov/data.json, titled like
// "Hospital Service Area : 2025-01-01". A URL pinned to one UUID therefore
// keeps importing that year forever. We group entries into a *family* by title
// and import the newest version of the family. Care Compare datasets
// (https://data.cms.gov/provider-data/api/1/metastore/schemas/dataset/items)
// keep one stable id and only their `modified` date moves.
//
// Kept free of DB/network imports so it can be unit-tested on catalog slices.

export type CatalogSource = "cms_data_api" | "cms_provider_data";

export interface CatalogEntry {
  source: CatalogSource;
  datasetId: string;
  title: string;
  /** The title without its release-date suffix. */
  family: string;
  modified: string | null;
  issued: string | null;
  released: string | null;
  temporalStart: string | null;
  temporalEnd: string | null;
  accrualPeriodicity: string | null;
  /** The endpoint the importer pages through. */
  dataUrl: string | null;
}

const DATA_API_RE = /data\.cms\.gov\/data-api\/v1\/dataset\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/|$)/i;
const PROVIDER_DATA_RE = /data\.cms\.gov\/provider-data\/api\/1\/datastore\/query\/([a-z0-9-]+)(?:\/|$)/i;

export function datasetIdFromUrl(url: string | null | undefined): { source: CatalogSource; id: string } | null {
  if (!url) return null;
  const api = DATA_API_RE.exec(url);
  if (api) return { source: "cms_data_api", id: api[1].toLowerCase() };
  const pd = PROVIDER_DATA_RE.exec(url);
  if (pd) return { source: "cms_provider_data", id: pd[1].toLowerCase() };
  return null;
}

export function dataApiUrl(datasetId: string): string {
  return `https://data.cms.gov/data-api/v1/dataset/${datasetId}/data`;
}

export function providerDataUrl(datasetId: string): string {
  return `https://data.cms.gov/provider-data/api/1/datastore/query/${datasetId}/0`;
}

/** "Hospital Service Area : 2025-01-01" → "Hospital Service Area". */
export function familyOf(title: string | null | undefined): string {
  return String(title || "").replace(/\s*:\s*\d{4}-\d{2}-\d{2}\S*\s*$/, "").trim();
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function temporalRange(temporal: unknown): { start: string | null; end: string | null } {
  if (Array.isArray(temporal) && temporal.length) {
    const t = temporal[0] as Record<string, unknown>;
    if (t && typeof t === "object") return { start: str(t.startDate), end: str(t.endDate) };
  }
  if (typeof temporal === "string" && temporal.includes("/")) {
    const [start, end] = temporal.split("/");
    return { start: str(start), end: str(end) };
  }
  return { start: null, end: null };
}

/** data.json → the entries that have a data-api endpoint. */
export function parseDcatCatalog(catalog: { dataset?: unknown[] } | null | undefined): CatalogEntry[] {
  const out: CatalogEntry[] = [];
  for (const raw of catalog?.dataset || []) {
    const x = raw as Record<string, unknown>;
    const distributions = Array.isArray(x.distribution) ? (x.distribution as Array<Record<string, unknown>>) : [];
    const urls = [str(x.identifier), ...distributions.map((d) => str(d.accessURL))];
    const id = urls.map(datasetIdFromUrl).find((m) => m?.source === "cms_data_api");
    if (!id) continue;
    const title = str(x.title) || id.id;
    const { start, end } = temporalRange(x.temporal);
    out.push({
      source: "cms_data_api",
      datasetId: id.id,
      title,
      family: familyOf(title),
      modified: str(x.modified),
      issued: str(x.issued),
      released: null,
      temporalStart: start,
      temporalEnd: end,
      accrualPeriodicity: str(x.accrualPeriodicity),
      dataUrl: dataApiUrl(id.id),
    });
  }
  return out;
}

/** Care Compare metastore items → entries keyed by their stable id. */
export function parseProviderDataCatalog(items: unknown[] | null | undefined): CatalogEntry[] {
  const out: CatalogEntry[] = [];
  for (const raw of items || []) {
    const x = raw as Record<string, unknown>;
    const id = str(x.identifier)?.toLowerCase();
    if (!id) continue;
    const title = str(x.title) || id;
    out.push({
      source: "cms_provider_data",
      datasetId: id,
      title,
      family: title,
      modified: str(x.modified),
      issued: str(x.issued),
      released: str(x.released),
      temporalStart: null,
      temporalEnd: null,
      accrualPeriodicity: str(x.accrualPeriodicity),
      dataUrl: providerDataUrl(id),
    });
  }
  return out;
}

export interface CatalogIndex {
  byId: Map<string, CatalogEntry>;
  byFamily: Map<string, CatalogEntry[]>;
}

export function indexCatalog(entries: CatalogEntry[]): CatalogIndex {
  const byId = new Map<string, CatalogEntry>();
  const byFamily = new Map<string, CatalogEntry[]>();
  for (const e of entries) {
    byId.set(`${e.source}:${e.datasetId}`, e);
    const key = `${e.source}:${e.family}`;
    const list = byFamily.get(key) || [];
    list.push(e);
    byFamily.set(key, list);
  }
  return { byId, byFamily };
}

/** The version with the latest period end, then the latest modified date. */
export function newestOf(entries: CatalogEntry[]): CatalogEntry | null {
  let best: CatalogEntry | null = null;
  for (const e of entries) {
    if (!best) { best = e; continue; }
    const a = `${e.temporalEnd || ""}|${e.modified || ""}`;
    const b = `${best.temporalEnd || ""}|${best.modified || ""}`;
    if (a > b) best = e;
  }
  return best;
}

export interface ResolvedVersion {
  source: CatalogSource;
  /** The version the import type's URL points at, if the catalog still lists it. */
  pinned: CatalogEntry | null;
  /** The version to import: the newest of the pinned entry's family. */
  newest: CatalogEntry | null;
}

/** Which catalog version an import type's URL should resolve to. */
export function resolveImportUrl(url: string, index: CatalogIndex): ResolvedVersion | null {
  const id = datasetIdFromUrl(url);
  if (!id) return null;
  const pinned = index.byId.get(`${id.source}:${id.id}`) || null;
  if (!pinned) return { source: id.source, pinned: null, newest: null };
  const newest = id.source === "cms_data_api" ? newestOf(index.byFamily.get(`${pinned.source}:${pinned.family}`) || [pinned]) : pinned;
  return { source: id.source, pinned, newest };
}

/** The calendar year a version covers, from its period end (else start). */
export function dataYearOf(entry: Pick<CatalogEntry, "temporalEnd" | "temporalStart"> | null | undefined): string | null {
  const d = entry?.temporalEnd || entry?.temporalStart;
  const m = d ? /^(\d{4})/.exec(d) : null;
  return m ? m[1] : null;
}

/** Whether the catalog's modified date is later than what was imported. */
export function isNewer(catalogModified: string | Date | null | undefined, importedModified: string | Date | null | undefined): boolean {
  if (!catalogModified) return false;
  if (!importedModified) return true;
  return new Date(catalogModified).getTime() > new Date(importedModified).getTime();
}

/** Where an import URL's rows come from, for dataset_versions.source. */
export function sourceForUrl(url: string | null | undefined): CatalogSource | "manual_upload" | "remote_file" {
  const id = datasetIdFromUrl(url);
  if (id) return id.source;
  if (!url || url.startsWith("/api/storage/")) return "manual_upload";
  return "remote_file";
}
