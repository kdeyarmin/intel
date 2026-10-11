/**
 * Import downloads go through the SSRF guard (server/lib/safeFetch.ts), not a
 * bare fetch: the NPPES flat-file importer takes any link an admin pastes, and
 * the CMS importer follows whatever its URL redirects to.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { updates } = vi.hoisted(() => ({ updates: [] as Record<string, any>[] }));

vi.mock("../server/db", () => {
  const chain: any = {
    from: () => chain,
    where: () => chain,
    limit: async () => [{ id: 1, dry_run: false, imported_rows: 0, excluded_rows: 0 }],
  };
  return {
    db: {
      select: () => chain,
      update: () => ({
        set: (data: Record<string, any>) => {
          updates.push(data);
          return { where: async () => [] };
        },
      }),
    },
    pool: {},
  };
});

import { handleImportNPPESFlatFile } from "../server/functions/importNPPESFlatFile";
import { handleAutoImportCMSData, isAllowedUrl } from "../server/functions/triggerImport";

describe("import URL guard", () => {
  beforeEach(() => { updates.length = 0; });

  it("refuses a flat-file link to a private address without connecting, and fails the batch", async () => {
    await expect(handleImportNPPESFlatFile({ batch_id: 1, file_url: "https://169.254.169.254/latest/meta-data/" }))
      .rejects.toMatchObject({ status: 400, message: expect.stringMatching(/private or reserved/) });
    expect(updates.at(-1)).toMatchObject({ status: "failed" });
  });

  it("refuses a plain-http flat-file link", async () => {
    await expect(handleImportNPPESFlatFile({ batch_id: 1, file_url: "http://bucket.example.com/nppes.csv" }))
      .rejects.toMatchObject({ status: 400, message: expect.stringMatching(/https/) });
  });

  it("fails a CMS import on a refused URL at once instead of retrying it", async () => {
    await handleAutoImportCMSData({ import_type: "cms_order_referring", file_url: "http://data.cms.gov/data-api/v1/dataset/x/data", batch_id: 1 });
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ status: "failed" });
    expect(updates[0].error_samples[0].message).toMatch(/Only https/);
  });

  it("only triggers imports from https links on CMS domains", () => {
    expect(isAllowedUrl("https://data.cms.gov/data-api/v1/dataset/x/data")).toBe(true);
    expect(isAllowedUrl("https://download.cms.gov/nppes/file.zip")).toBe(true);
    expect(isAllowedUrl("http://data.cms.gov/data-api/v1/dataset/x/data")).toBe(false);
    expect(isAllowedUrl("https://data.cms.gov.example.com/x")).toBe(false);
    expect(isAllowedUrl("not a url")).toBe(false);
  });
});
