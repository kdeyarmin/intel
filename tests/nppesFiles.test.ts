import { describe, expect, it } from "vitest";
import { classifyNppesLink, monthlyCutDate, newestNppesFile, parseNpiFilesPage, resolveNppesFile } from "../server/lib/nppesFiles";

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
    // The monthly file is ordered by the day it was cut (September 14), not the end of its month.
    expect(files.map((f) => f.name)).toEqual([
      "NPPES_Data_Dissemination_092826_100426_Weekly_V2.zip",
      "NPPES_Data_Dissemination_091426_092026_Weekly_V2.zip",
      "NPPES_Data_Dissemination_September_2026_V2.zip",
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

describe("monthly file cut date", () => {
  const monthly = classifyNppesLink("NPPES_Data_Dissemination_September_2026_V2.zip")!;

  it("is the date CMS gives next to the link, not the last day of the month the name implies", () => {
    expect(monthly.periodEnd).toBe("2026-09-30");
    expect(monthlyCutDate(monthly, "NPPES Data Dissemination V.2 - September 14, 2026")).toBe("2026-09-14");
    const file = parseNpiFilesPage(PAGE).find((f) => f.kind === "monthly")!;
    expect(file).toMatchObject({ periodStart: "2026-09-01", periodEnd: "2026-09-14" });
    // Markup inside the link doesn't matter, even between the day and the comma.
    const marked = parseNpiFilesPage('<a href="NPPES_Data_Dissemination_September_2026_V2.zip"><span>NPPES V.2</span> - September <b>14</b>, 2026</a>');
    expect(marked[0].periodEnd).toBe("2026-09-14");
    // A month name we don't know (an abbreviation) isn't guessed at: keep the month end.
    expect(parseNpiFilesPage('<a href="NPPES_Data_Dissemination_September_2026_V2.zip">Sept. 14, 2026</a>')[0].periodEnd).toBe("2026-09-30");
    const spaced = parseNpiFilesPage('<a class="x" href="NPPES_Data_Dissemination_September_2026_V2.zip">\n  NPPES V.2 - <b>September 14, 2026</b>\n</a>');
    expect(spaced[0].periodEnd).toBe("2026-09-14");
  });

  it("keeps the month end when the text gives no date in the file's own month", () => {
    expect(monthlyCutDate(monthly, "NPPES Data Dissemination V.2")).toBeNull();
    expect(monthlyCutDate(monthly, "Updated October 2, 2026")).toBeNull();
    expect(monthlyCutDate(monthly, "September 31, 2026")).toBeNull(); // after the month's last day
    expect(parseNpiFilesPage('<a href="NPPES_Data_Dissemination_September_2026_V2.zip">V.2</a>')[0].periodEnd).toBe("2026-09-30");
  });

  it("applies to the monthly file only", () => {
    const weekly = classifyNppesLink("NPPES_Data_Dissemination_092826_100426_Weekly_V2.zip")!;
    expect(monthlyCutDate(weekly, "September 29, 2026")).toBeNull();
    expect(parseNpiFilesPage('<a href="NPPES_Data_Dissemination_092826_100426_Weekly_V2.zip">Weekly - September 30, 2026</a>')[0].periodEnd).toBe("2026-10-04");
  });
});
