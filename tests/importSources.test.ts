/**
 * Files as import sources (server/lib/csv.ts, server/lib/importSources.ts)
 * and the rule for which import types may use them (triggerImport.fileUrlProblem).
 */
import { describe, expect, it, vi } from "vitest";
import path from "path";
import fs from "fs";
import os from "os";
import { execFileSync } from "child_process";

vi.mock("../server/db", () => ({ db: {}, pool: {} }));

import { csvRecords, looksLikeSharedPatientLine, normalizeHeader, pageRecords, parseCSVLine } from "../server/lib/csv";
import { isZipFileUrl, localUploadPath, openZipTextEntry, sourceKindFor, withIdleTimeout } from "../server/lib/importSources";
import { fileUrlProblem, getCMSDatasetCatalog, importAsOf, UPLOAD_CAPABLE_TYPES } from "../server/functions/triggerImport";
import { NPPES_FILE_TYPES } from "../server/functions/importNPPESFile";

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

  it("keeps a quoted field with line breaks in one row, across chunks and CRLF", async () => {
    const text = 'name,address,city\r\nSunny Hill,"12 Main St\r\nSuite 4",Erie\r\n"Lakeview, Inc","1 ""A"" Rd\n\nRear",Butler\r\nPlain,5 Elm,Ohio\r\n';
    for (const split of [text.length, 7, 1]) {
      const parts = text.match(new RegExp(`[\\s\\S]{1,${split}}`, "g")) ?? [];
      const rows = await collect(csvRecords(chunks(...parts)));
      expect(rows.map((r: any) => [r.name, r.address, r.city]), `split ${split}`).toEqual([
        ["Sunny Hill", "12 Main St\nSuite 4", "Erie"],
        ["Lakeview, Inc", '1 "A" Rd\n\nRear', "Butler"],
        ["Plain", "5 Elm", "Ohio"],
      ]);
    }
  });

  it("doesn't let a stray quote swallow a whole file, and keeps a final unterminated record", async () => {
    const rows = await collect(csvRecords(chunks('a,b\n1,"open\n' + "x,y\n".repeat(300_000))));
    // One huge row at most, then the file goes on: not a single row for the rest of the file.
    expect(rows.length).toBeGreaterThan(1);
    const tail = await collect(csvRecords(chunks('a,b\n1,"never closed')));
    expect(tail).toHaveLength(1);
    expect(tail[0].a).toBe("1");
  });

  it("takes caller-supplied headers for a headerless file", async () => {
    const rows = await collect(csvRecords(chunks("11,22,5,3\n33,44,7,2"), { headers: ["npi_from", "npi_to", "pair_count", "bene_count"] }));
    expect(rows).toEqual([
      { npi_from: "11", npi_to: "22", pair_count: "5", bene_count: "3" },
      { npi_from: "33", npi_to: "44", pair_count: "7", bene_count: "2" },
    ]);
  });

  it("names a headerless CMS FOIA shared-patient file, and leaves a real header alone", async () => {
    const foia = "1000026017,1598773715,56        ,23        ,29\n1000310429,1144645573,68,12,36\n";
    expect(looksLikeSharedPatientLine(foia.split("\n")[0])).toBe(true);
    const rows = await collect(csvRecords(chunks(foia), { detectSharedPatient: true }));
    expect(rows).toEqual([
      { npi1: "1000026017", npi2: "1598773715", paircount: "56", benecount: "23", samedaycount: "29" },
      { npi1: "1000310429", npi2: "1144645573", paircount: "68", benecount: "12", samedaycount: "36" },
    ]);
    const headed = await collect(csvRecords(chunks("npi_1,npi_2,pair_count\n11,22,5\n"), { detectSharedPatient: true }));
    expect(headed).toEqual([{ npi_1: "11", npi_2: "22", pair_count: "5" }]);
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

describe("zip source", () => {
  it("recognizes a zip url and reads the text member as the FOIA shared-patient file", async () => {
    expect(isZipFileUrl("https://downloads.cms.gov/foia/physician-shared-patient-patterns-2015-days30.zip")).toBe(true);
    expect(isZipFileUrl("https://downloads.cms.gov/foia/physician-shared-patient-patterns-2015-days30.zip?x=1")).toBe(true);
    expect(isZipFileUrl("/api/storage/pairs.csv")).toBe(false);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pspp-"));
    const txt = path.join(dir, "rows.txt");
    fs.writeFileSync(txt, "1000026017,1598773715,56        ,23        ,29\n1000310429,1144645573,68,12,36\n");
    const zip = path.join(dir, "physician-shared-patient-patterns-2015-days30.zip");
    const entry = "physician-shared-patient-patterns-2015-days30.txt";
    execFileSync("python3", ["-c", "import sys, zipfile\nsrc, dest, name = sys.argv[1:]\nwith zipfile.ZipFile(dest, 'w', compression=zipfile.ZIP_DEFLATED) as z:\n    z.write(src, arcname=name)\n", txt, zip, entry]);

    const opened = await openZipTextEntry(zip);
    expect(opened.entryName).toBe("physician-shared-patient-patterns-2015-days30.txt");
    const rows = await collect(csvRecords(opened.stream, { detectSharedPatient: true }));
    opened.close();
    expect(rows).toEqual([
      { npi1: "1000026017", npi2: "1598773715", paircount: "56", benecount: "23", samedaycount: "29" },
      { npi1: "1000310429", npi2: "1144645573", paircount: "68", benecount: "12", samedaycount: "36" },
    ]);
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

  it("needs the year for any CSV link, not only for upload-capable types", () => {
    // A 2025 file imported without its year would be stamped with a guessed one and replace that year's rows.
    const csv = "https://data.cms.gov/sites/default/files/hospital_service_area_2025.csv";
    expect(fileUrlProblem("hospital_service_area", csv, undefined)).toMatch(/year is required/);
    expect(fileUrlProblem("hospital_service_area", csv, "")).toMatch(/year is required/);
    expect(fileUrlProblem("hospital_service_area", csv, 2025)).toBeNull();
    // The API endpoints resolve their own year, and the NPPES zips their own date.
    expect(fileUrlProblem("hospital_service_area", "https://data.cms.gov/data-api/v1/dataset/x/data", undefined)).toBeNull();
    expect(fileUrlProblem("nppes_flat_file", "https://download.cms.gov/nppes/NPPES_Data_Dissemination_September_2026.zip", undefined)).toBeNull();
  });
});

describe("getCMSDatasetCatalog", () => {
  it("lists the upload-capable datasets as available, so a freshness list can show them before their first import", () => {
    const byId = new Map(getCMSDatasetCatalog().datasets.map((d: any) => [d.id, d]));
    const listed = [...UPLOAD_CAPABLE_TYPES].filter((id) => byId.has(id));
    expect(listed).toContain("physician_shared_patient_patterns");
    for (const id of listed) expect(byId.get(id)?.available, id).toBe(true);
    // Everything else needs a CMS endpoint, or is one of the NPPES files.
    for (const d of byId.values() as Iterable<any>) {
      if (!UPLOAD_CAPABLE_TYPES.has(d.id)) expect(d.available, d.id).toBe(!!d.url || !!NPPES_FILE_TYPES[d.id]);
    }
  });
});

describe("withIdleTimeout", () => {
  const chunk = (n: number) => new Uint8Array([n]);

  it("gives up on a source that goes quiet, and aborts the transfer", async () => {
    async function* stalls() {
      yield chunk(1);
      await new Promise(() => {}); // the server accepted the connection and then sent nothing
    }
    const controller = new AbortController();
    const out = withIdleTimeout(stalls(), controller, 30);
    expect((await out.next()).value).toEqual(chunk(1));
    await expect(out.next()).rejects.toThrow(/No data received for 1 seconds/);
    expect(controller.signal.aborted).toBe(true);
  });

  it("doesn't count the time the consumer spends on a chunk", async () => {
    async function* steady() {
      yield chunk(1);
      yield chunk(2);
      yield chunk(3);
    }
    const controller = new AbortController();
    const seen: number[] = [];
    for await (const c of withIdleTimeout(steady(), controller, 40)) {
      seen.push(c[0]);
      await new Promise((r) => setTimeout(r, 90)); // slower than the idle limit
    }
    expect(seen).toEqual([1, 2, 3]);
    expect(controller.signal.aborted).toBe(false);
  });
});

describe("importAsOf", () => {
  it("prefers the resumed batch's date, then the release's last day, then the day it was published", () => {
    const modified = new Date("2026-07-06T14:30:00Z");
    expect(importAsOf({ inherited: "2026-06-30", temporalEnd: "2026-07-01", catalogModified: modified })).toBe("2026-06-30");
    expect(importAsOf({ temporalEnd: "2026-07-01", catalogModified: modified })).toBe("2026-07-01");
    // Care Compare gives no coverage dates: the publication date is the vintage.
    expect(importAsOf({ temporalEnd: null, catalogModified: modified })).toBe("2026-07-06");
    expect(importAsOf({ catalogModified: "2026-07-06T00:00:00.000Z" })).toBe("2026-07-06");
    expect(importAsOf({ stated: "2025-12-31", catalogModified: modified })).toBe("2025-12-31");
  });

  it("is null when nothing says", () => {
    expect(importAsOf({})).toBeNull();
    expect(importAsOf({ catalogModified: new Date("nope") })).toBeNull();
    expect(importAsOf({ catalogModified: "soon" })).toBeNull();
  });
});
