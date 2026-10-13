/**
 * A state_filter that no row of the dataset can satisfy used to read every page and import nothing, with no word
 * of why (Order & Referring is keyed by NPI alone; Hospital Service Area by CCN and ZIP). The importer now reads
 * a state from a CCN or FIPS code too, and stops a filter that cannot apply once it has seen enough rows.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  updates: [] as Record<string, any>[],
  pages: [] as any[][],
  fetches: 0,
  ended: [] as any[],
}));

vi.mock("../server/db", () => {
  const chain: any = { from: () => chain, where: () => chain, limit: async () => [{ id: 1, status: "processing", dry_run: true }] };
  return {
    db: {
      select: () => chain,
      update: () => ({ set: (data: Record<string, any>) => { h.updates.push(data); return { where: async () => [] }; } }),
    },
    pool: {},
  };
});
vi.mock("../server/lib/safeFetch", async (orig) => ({
  ...(await orig<typeof import("../server/lib/safeFetch")>()),
  safeFetchStream: async () => {
    const rows = h.pages[h.fetches] ?? [];
    h.fetches++;
    return new Response(JSON.stringify(rows), { status: 200 });
  },
}));
vi.mock("../server/lib/importProgress", async (orig) => ({
  ...(await orig<typeof import("../server/lib/importProgress")>()),
  endedWithoutFinishing: async (...args: unknown[]) => { h.ended.push(args); },
}));
vi.mock("../server/lib/datasetRegistry", async (orig) => ({
  ...(await orig<typeof import("../server/lib/datasetRegistry")>()),
  markImportFinished: async () => {},
  markImportStarted: async () => {},
}));
vi.mock("../server/lib/importCompletion", () => ({ settleBatchCompletion: async () => null, RUN_LEASE_MS: 1 }));
vi.mock("../server/lib/snapshotRetire", async (orig) => ({ ...(await orig<typeof import("../server/lib/snapshotRetire")>()), retiresSnapshot: () => false }));

import { handleAutoImportCMSData } from "../server/functions/triggerImport";
import { isRetryableErrorMessage } from "../server/lib/scheduling";
import { stateFilterUnsupportedMessage } from "../server/lib/rowState";

const URL = "https://data.cms.gov/data-api/v1/dataset/x/data";
const npiOnlyPage = (n: number, from = 0) => Array.from({ length: n }, (_, i) => ({ NPI: String(1000000000 + from + i), LAST_NAME: "X", PARTB: "Y", DME: "N", HHA: "N", PMD: "N", HOSPICE: "N" }));
const last = () => h.updates.at(-1) ?? {};

beforeEach(() => { h.updates.length = 0; h.pages = []; h.fetches = 0; h.ended.length = 0; });

describe("a state_filter on a dataset that names no state", () => {
  it("stops after the first five pages and says why, instead of reading the whole dataset", async () => {
    h.pages = Array.from({ length: 12 }, (_, p) => npiOnlyPage(1000, p * 1000));
    await handleAutoImportCMSData({ import_type: "cms_order_referring", file_url: URL, batch_id: 1, year: 2026, state_filter: "PA", dry_run: false });
    expect(h.fetches).toBe(5);
    expect(last()).toMatchObject({ status: "failed" });
    expect(last().error_samples.at(-1).message).toBe(stateFilterUnsupportedMessage("cms_order_referring", "PA"));
    expect(last().error_samples.at(-1).message).toMatch(/Import it without a state filter/);
    expect(h.ended[0].slice(0, 3)).toEqual(["cms_order_referring", 1, "failed"]);
  });

  it("stops at the end of a small dataset that names no state", async () => {
    h.pages = [npiOnlyPage(300)];
    await handleAutoImportCMSData({ import_type: "cms_order_referring", file_url: URL, batch_id: 1, year: 2026, state_filter: "Pennsylvania", dry_run: false });
    expect(h.fetches).toBe(1);
    expect(last()).toMatchObject({ status: "failed" });
  });

  it("is not something auto-retry would retry", () => {
    expect(isRetryableErrorMessage(stateFilterUnsupportedMessage("cms_order_referring", "PA"))).toBe(false);
  });

  it("does not interfere with an import that has no state filter", async () => {
    h.pages = [npiOnlyPage(300)];
    await handleAutoImportCMSData({ import_type: "cms_order_referring", file_url: URL, batch_id: 1, year: 2026, dry_run: true });
    expect(last()).toMatchObject({ status: "completed" });
  });
});

describe("a state_filter on a dataset keyed by CCN", () => {
  it("keeps the rows of the state's hospitals, which have no state column of their own", async () => {
    const row = (ccn: string, zip: string) => ({ MEDICARE_PROV_NUM: ccn, ZIP_CD_OF_RESIDENCE: zip, TOTAL_DAYS_OF_CARE: "40", TOTAL_CHARGES: "9000", TOTAL_CASES: "12" });
    h.pages = [[row("01M307", "01730"), row("390164", "15213"), row("390164", "15206"), row("10T258", "33101"), row("390050", "15212")]];
    await handleAutoImportCMSData({ import_type: "hospital_service_area", file_url: URL, batch_id: 1, year: 2025, state_filter: "PA", dry_run: true });
    expect(last()).toMatchObject({ status: "completed", total_rows: 5, skipped_rows: 2 });
  });
});
