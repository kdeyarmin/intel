/**
 * checkCMSDataApiUrls — the daily CMS endpoint health check.
 *
 * Regression coverage for the 2026-10-13 production finding: the checker
 * resolved URLs only from a schedule's api_url or its own 13-entry hardcoded
 * subset, never from IMPORT_TYPE_URLS or the dataset registry the importer
 * actually uses. Every scheduled type outside that subset with a null
 * api_url was reported broken ("No URL configured") — 77 false alarms in one
 * run while every real CMS endpoint was healthy.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    configs: [] as any[],
    fetched: [] as string[],
  },
}));

vi.mock("../server/db", () => ({
  db: {
    select: () => ({
      from: async () => state.configs,
    }),
    update: () => ({
      set: () => ({
        where: async () => [],
      }),
    }),
  },
  pool: { query: async () => ({ rows: [] }) },
}));

vi.mock("../server/lib/datasetRegistry", () => ({
  // The registry knows a newer endpoint for hospice_enrollments only.
  resolveImportVersion: async (importType: string) =>
    importType === "hospice_enrollments"
      ? { dataUrl: "https://data.cms.gov/data-api/v1/dataset/registry-hospice/data" }
      : null,
}));

import {
  handleCheckCmsDataApiUrls,
  resolveProbeUrl,
  isKnownCatalogType,
} from "../server/functions/checkCMSDataApiUrls";
import { IMPORT_TYPE_URLS } from "../server/functions/triggerImport";

beforeEach(() => {
  state.configs = [];
  state.fetched = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: any) => {
      state.fetched.push(String(url));
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        text: async () => JSON.stringify([{ sample: 1 }]),
      };
    }),
  );
});

describe("resolveProbeUrl precedence (mirrors triggerImport)", () => {
  it("schedule api_url beats everything", () => {
    expect(
      resolveProbeUrl({
        apiUrl: "https://example.com/override",
        registryUrl: "https://data.cms.gov/registry",
        importType: "snf_enrollments",
        resolvedType: "snf_enrollments",
      }),
    ).toBe("https://example.com/override");
  });

  it("registry endpoint beats the pinned IMPORT_TYPE_URLS entry", () => {
    expect(
      resolveProbeUrl({
        registryUrl: "https://data.cms.gov/registry",
        importType: "snf_enrollments",
        resolvedType: "snf_enrollments",
      }),
    ).toBe("https://data.cms.gov/registry");
  });

  it("falls back to IMPORT_TYPE_URLS", () => {
    expect(
      resolveProbeUrl({ importType: "snf_enrollments", resolvedType: "snf_enrollments" }),
    ).toBe(IMPORT_TYPE_URLS.snf_enrollments);
  });

  it("checker-only types fall back to the hardcoded map", () => {
    expect(IMPORT_TYPE_URLS.opt_out_physicians).toBeUndefined();
    expect(
      resolveProbeUrl({ importType: "opt_out_physicians", resolvedType: "opt_out_physicians" }),
    ).toContain("9887a515-7552-4693-bf58-735c77af46d7");
  });

  it("returns null when nothing resolves", () => {
    expect(
      resolveProbeUrl({ importType: "no_such_type", resolvedType: "no_such_type" }),
    ).toBeNull();
  });
});

describe("isKnownCatalogType", () => {
  it("covers file-imported and CMS-retired catalog datasets", () => {
    for (const t of [
      "nppes_weekly_incremental",
      "nppes_monthly_full",
      "licensed_facilities",
      "physician_shared_patient_patterns",
      "provider_ownership",
      "home_health_pdgm",
    ]) {
      expect(isKnownCatalogType(t, t)).toBe(true);
    }
  });

  it("rejects types the catalog does not know", () => {
    expect(isKnownCatalogType("no_such_type", "no_such_type")).toBe(false);
    expect(isKnownCatalogType("snf_enrollments", "snf_enrollments")).toBe(true); // catalog dataset (with a URL)
  });
});

describe("handleCheckCmsDataApiUrls", () => {
  it("probes the importer's URL for a scheduled type with no api_url override", async () => {
    state.configs = [
      { id: 1, import_type: "snf_enrollments", api_url: null, config: {} },
      { id: 2, import_type: "hospice_enrollments", api_url: null, config: {} },
      { id: 3, import_type: "nppes_monthly_full", api_url: null, config: {} },
      { id: 4, import_type: "some_unknown_type", api_url: null, config: {} },
    ];

    const res = await handleCheckCmsDataApiUrls({}, { email: "test@example.com" });

    expect(res.success).toBe(true);
    // The only broken entry is the genuinely unknown type.
    expect(res.broken).toBe(1);
    const broken = res.results.filter((r: any) => !r.healthy);
    expect(broken).toHaveLength(1);
    expect(broken[0].import_type).toBe("some_unknown_type");
    expect(broken[0].error).toBe("No URL configured");

    // A scheduled type the old checker scored broken now probes healthy via
    // the canonical map…
    const snf = res.results.find((r: any) => r.import_type === "snf_enrollments");
    expect(snf.healthy).toBe(true);
    expect(state.fetched.some((u) => u.startsWith(IMPORT_TYPE_URLS.snf_enrollments))).toBe(true);

    // …and via the registry endpoint when the registry has a newer one.
    const hospice = res.results.find((r: any) => r.import_type === "hospice_enrollments");
    expect(hospice.healthy).toBe(true);
    expect(
      state.fetched.some((u) =>
        u.startsWith("https://data.cms.gov/data-api/v1/dataset/registry-hospice/data"),
      ),
    ).toBe(true);

    // medicare_* types are health-checked now (previously excluded).
    expect(res.results.some((r: any) => r.import_type.startsWith("medicare_"))).toBe(true);

    // File-based catalog types are skipped, never broken.
    expect(res.skipped_types).toContain("nppes_monthly_full");
    expect(res.results.some((r: any) => r.import_type === "nppes_monthly_full")).toBe(false);
    expect(res.healthy).toBe(res.total_checked - res.broken);
  });
});
