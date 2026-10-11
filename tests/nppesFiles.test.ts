import { describe, expect, it } from "vitest";
import { classifyNppesLink, newestNppesFile, parseNpiFilesPage, resolveNppesFile } from "../server/lib/nppesFiles";

const PAGE = `
<a href="NPPES_Data_Dissemination_September_2026_V2.zip">NPPES Data Dissemination V.2 - September 14, 2026</a>
<a href="NPPES_Deactivated_NPI_Report_091426_V2.zip">Monthly Deactivation Update</a>
<a href="NPPES_Data_Dissemination_090726_091326_Weekly_V2.zip">Weekly</a>
<a href='NPPES_Data_Dissemination_092826_100426_Weekly_V2.zip'>Weekly</a>
<a href="NPPES_Data_Dissemination_091426_092026_Weekly_V2.zip">Weekly</a>
<a href="NPPES_Data_Dissemination_September_2026.zip">Version 1 (retired)</a>
<a href="NPPES_Data_Dissemination_CodeValues.pdf">Code values</a>
`;

describe("NPPES files page", () => {
  it("classifies the V.2 file names and ignores everything else", () => {
    expect(classifyNppesLink("NPPES_Data_Dissemination_092826_100426_Weekly_V2.zip")).toEqual({ kind: "weekly", name: "NPPES_Data_Dissemination_092826_100426_Weekly_V2.zip", url: "https://download.cms.gov/nppes/NPPES_Data_Dissemination_092826_100426_Weekly_V2.zip", periodStart: "2026-09-28", periodEnd: "2026-10-04" });
    expect(classifyNppesLink("https://download.cms.gov/nppes/NPPES_Data_Dissemination_September_2026_V2.zip")).toMatchObject({ kind: "monthly", periodStart: "2026-09-01", periodEnd: "2026-09-30" });
    expect(classifyNppesLink("NPPES_Deactivated_NPI_Report_091426_V2.zip")).toMatchObject({ kind: "deactivation", periodEnd: "2026-09-14" });
    expect(classifyNppesLink("NPPES_Data_Dissemination_September_2026.zip")).toBeNull();
    expect(classifyNppesLink("x.pdf")).toBeNull();
  });

  it("lists the page's files newest first and picks the newest of a kind", () => {
    const files = parseNpiFilesPage(PAGE);
    expect(files.map((f) => f.name)).toEqual([
      "NPPES_Data_Dissemination_092826_100426_Weekly_V2.zip",
      "NPPES_Data_Dissemination_September_2026_V2.zip",
      "NPPES_Data_Dissemination_091426_092026_Weekly_V2.zip",
      "NPPES_Deactivated_NPI_Report_091426_V2.zip",
      "NPPES_Data_Dissemination_090726_091326_Weekly_V2.zip",
    ]);
    expect(newestNppesFile(files, "weekly")?.periodEnd).toBe("2026-10-04");
    expect(newestNppesFile(files, "monthly")?.name).toBe("NPPES_Data_Dissemination_September_2026_V2.zip");
  });

  it("resolves through an injected page fetch", async () => {
    expect((await resolveNppesFile("weekly", async () => PAGE))?.periodEnd).toBe("2026-10-04");
    expect(await resolveNppesFile("weekly", async () => "<html></html>")).toBeNull();
  });
});
