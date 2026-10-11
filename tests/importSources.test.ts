/**
 * Files as import sources (server/lib/csv.ts, server/lib/importSources.ts)
 * and the rule for which import types may use them (triggerImport.fileUrlProblem).
 */
import { describe, expect, it, vi } from "vitest";
import path from "path";

vi.mock("../server/db", () => ({ db: {}, pool: {} }));

import { csvRecords, normalizeHeader, pageRecords, parseCSVLine } from "../server/lib/csv";
import { localUploadPath, sourceKindFor } from "../server/lib/importSources";
import { fileUrlProblem } from "../server/functions/triggerImport";

async function collect<T>(it: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of it) out.push(x);
  return out;
}

async function* chunks(...parts: string[]) {
  for (const p of parts) yield new TextEncoder().encode(p);
}

describe("csv", () => {
  it("parses quoted fields and doubled quotes", () => {
    expect(parseCSVLine('a,"b, c","say ""hi""",d')).toEqual(["a", "b, c", 'say "hi"', "d"]);
  });

  it("normalizes headers to lower snake case and drops a BOM", () => {
    expect(normalizeHeader("﻿Total Referrals (count)")).toBe("total_referrals_count");
    expect(normalizeHeader("NPI_1")).toBe("npi_1");
  });

  it("streams rows across chunk boundaries, with CRLF, keeping both header spellings", async () => {
    const rows = await collect(csvRecords(chunks("﻿NPI_1,NPI_2,Transaction Count\r\n11,22,", "5\r\n33,44,7\r\n", "\r\n")));
    expect(rows).toEqual([
      { npi_1: "11", NPI_1: "11", npi_2: "22", NPI_2: "22", transaction_count: "5", "Transaction Count": "5" },
      { npi_1: "33", NPI_1: "33", npi_2: "44", NPI_2: "44", transaction_count: "7", "Transaction Count": "7" },
    ]);
  });

  it("takes caller-supplied headers for a headerless file", async () => {
    const rows = await collect(csvRecords(chunks("11,22,5,3\n33,44,7,2"), { headers: ["npi_from", "npi_to", "pair_count", "bene_count"] }));
    expect(rows).toEqual([
      { npi_from: "11", npi_to: "22", pair_count: "5", bene_count: "3" },
      { npi_from: "33", npi_to: "44", pair_count: "7", bene_count: "2" },
    ]);
  });

  it("pages rows and skips already-imported rows on resume", async () => {
    async function* nums() { for (let i = 1; i <= 7; i++) yield i; }
    expect(await collect(pageRecords(nums(), 3))).toEqual([
      { rows: [1, 2, 3], offset: 0, nextOffset: 3 },
      { rows: [4, 5, 6], offset: 3, nextOffset: 6 },
      { rows: [7], offset: 6, nextOffset: 7 },
    ]);
    expect(await collect(pageRecords(nums(), 3, 5))).toEqual([{ rows: [6, 7], offset: 5, nextOffset: 7 }]);
  });
});

describe("importSources", () => {
  const dir = path.resolve("uploads");

  it("resolves an upload link to a file under uploads/ by basename only", () => {
    expect(localUploadPath("/api/storage/abc.csv", dir)).toBe(path.join(dir, "abc.csv"));
    expect(localUploadPath("/api/storage/abc.csv?x=1", dir)).toBe(path.join(dir, "abc.csv"));
    expect(localUploadPath("/api/storage/../../etc/passwd", dir)).toBe(path.join(dir, "passwd"));
    expect(localUploadPath("/api/storage/", dir)).toBeNull();
    expect(localUploadPath("https://data.cms.gov/x.csv", dir)).toBeNull();
  });

  it("classifies sources", () => {
    expect(sourceKindFor("/api/storage/abc.csv")).toBe("local_csv");
    expect(sourceKindFor("https://data.cms.gov/data-api/v1/dataset/8708ca8b-8636-44ed-8303-724cbfaf78ad/data")).toBe("cms_data_api");
    expect(sourceKindFor("https://data.cms.gov/provider-data/api/1/datastore/query/xubh-q36u/0")).toBe("cms_provider_data");
    expect(sourceKindFor("https://example.org/pairs.csv")).toBe("remote_csv");
    expect(sourceKindFor(null)).toBe("cms_data_api");
  });
});

describe("fileUrlProblem", () => {
  it("accepts uploads and https CSV links only for upload-capable types, and needs a year", () => {
    expect(fileUrlProblem("physician_shared_patient_patterns", "/api/storage/pairs.csv", 2015)).toBeNull();
    expect(fileUrlProblem("physician_shared_patient_patterns", "https://example.org/pairs.csv", "2015")).toBeNull();
    expect(fileUrlProblem("physician_shared_patient_patterns", "/api/storage/pairs.csv", undefined)).toMatch(/year is required/);
    expect(fileUrlProblem("physician_shared_patient_patterns", "http://example.org/pairs.csv", 2015)).toMatch(/https/);
    expect(fileUrlProblem("hospital_service_area", "/api/storage/hsa.csv", 2025)).toMatch(/Uploaded files are only accepted/);
    expect(fileUrlProblem("hospital_service_area", "https://example.org/hsa.csv", 2025)).toMatch(/CMS government domain/);
    expect(fileUrlProblem("hospital_service_area", "https://data.cms.gov/data-api/v1/dataset/x/data", undefined)).toBeNull();
    expect(fileUrlProblem("hospital_service_area", null, undefined)).toBeNull();
  });
});
