/**
 * A failed catalog fetch must not make every maintenance tick download the ~18 MB
 * data.json again (the daily throttle only counts successful checks).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.fn();
vi.mock("../server/db", () => ({ db: {}, pool: { query: (...args: unknown[]) => query(...args) } }));

import { CATALOG_RETRY_AFTER_FAILURE_MS, refreshCatalog, resetCatalogFetchBackoff } from "../server/lib/datasetRegistry";

const T0 = new Date("2026-10-11T12:00:00.000Z");
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);

beforeEach(() => {
  resetCatalogFetchBackoff();
  query.mockReset();
  // Never checked before, nothing imported, nothing running.
  query.mockResolvedValue({ rows: [{ last: null }], rowCount: 0 });
});

describe("refreshCatalog after a failed fetch", () => {
  it("does not download again until the retry interval has passed", async () => {
    const failing = vi.fn(async () => { throw new Error("HTTP 503 from https://data.cms.gov/data.json"); });
    await expect(refreshCatalog({ urls: {}, now: T0, fetch: failing })).rejects.toThrow(/503/);
    const downloads = failing.mock.calls.length;
    expect(downloads).toBeGreaterThan(0);

    // The next ticks, ten minutes apart, are skipped (and still report the failure) without fetching.
    for (const minutes of [10, 20, 59]) {
      const r = await refreshCatalog({ urls: {}, now: at(minutes), fetch: failing });
      expect(r.skipped).toMatch(/last catalog fetch failed/);
      expect(r.errors[0]).toMatch(/503/);
      expect(failing.mock.calls.length).toBe(downloads);
    }

    // An hour on it tries again.
    await expect(refreshCatalog({ urls: {}, now: new Date(T0.getTime() + CATALOG_RETRY_AFTER_FAILURE_MS + 1), fetch: failing })).rejects.toThrow(/503/);
    expect(failing.mock.calls.length).toBe(downloads * 2);
  });

  it("a forced check ignores the backoff, and a good fetch clears it", async () => {
    const failing = vi.fn(async () => { throw new Error("HTTP 503"); });
    await expect(refreshCatalog({ urls: {}, now: T0, fetch: failing })).rejects.toThrow();

    const good = vi.fn(async (url: string) => (url.endsWith("data.json") ? { dataset: [] } : []));
    const forced = await refreshCatalog({ urls: {}, now: at(5), force: true, fetch: good });
    expect(forced.skipped).toBeUndefined();
    expect(good).toHaveBeenCalledTimes(2);

    // Cleared: the next unforced tick goes ahead instead of waiting out the old failure.
    const next = await refreshCatalog({ urls: {}, now: at(10), fetch: good });
    expect(next.skipped).toBeUndefined();
    expect(good).toHaveBeenCalledTimes(4);
  });
});

describe("refreshCatalog's daily throttle", () => {
  // dataset_versions as the database holds it: the CMS rows were last checked two days ago,
  // the NPPES file row an hour ago (it stamps catalog_checked_at when its own page is read).
  const rows = [
    { import_type: "hospital_service_area", catalog_checked_at: new Date(T0.getTime() - 48 * 3600_000) },
    { import_type: "nppes_weekly_incremental", catalog_checked_at: new Date(T0.getTime() - 3600_000) },
  ];
  beforeEach(() => {
    query.mockImplementation(async (sql: string, params?: unknown[][]) => {
      if (/max\(catalog_checked_at\)/.test(sql)) {
        const only = /WHERE import_type = ANY\(\$1\)/.test(sql) ? new Set(params![0]) : null;
        const times = rows.filter((r) => !only || only.has(r.import_type)).map((r) => r.catalog_checked_at.getTime());
        return { rows: [{ last: times.length ? new Date(Math.max(...times)) : null }] };
      }
      return { rows: [], rowCount: 0 };
    });
  });

  it("is not satisfied by another source's check", async () => {
    const good = vi.fn(async (url: string) => (url.endsWith("data.json") ? { dataset: [] } : []));
    const r = await refreshCatalog({ urls: { hospital_service_area: "https://data.cms.gov/data-api/v1/dataset/x/data" }, now: T0, fetch: good });
    expect(r.skipped).toBeUndefined();
    expect(good).toHaveBeenCalledTimes(2);
  });

  it("still skips when the CMS rows themselves were checked within the day", async () => {
    rows[0].catalog_checked_at = new Date(T0.getTime() - 3600_000);
    const good = vi.fn(async () => ({}));
    const r = await refreshCatalog({ urls: { hospital_service_area: "https://data.cms.gov/data-api/v1/dataset/x/data" }, now: T0, fetch: good });
    expect(r.skipped).toMatch(/checked 60 minutes ago/);
    expect(good).not.toHaveBeenCalled();
    rows[0].catalog_checked_at = new Date(T0.getTime() - 48 * 3600_000);
  });
});
