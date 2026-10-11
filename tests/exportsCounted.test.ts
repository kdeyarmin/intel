/**
 * Every place that builds an export file counts it against the organization's
 * daily allowance first (countExport in src/components/exports/exportUtils.jsx).
 * A new export button that skips it would be a quota bypass, so this fails
 * until it counts.
 */
import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const root = path.join(import.meta.dirname, "..", "src");

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(full);
    return /\.(jsx?|tsx?)$/.test(e.name) ? [full] : [];
  });
}

describe("export entry points", () => {
  const builders = /\bexport(CSV|Excel|PDF|JSON)\b/;
  const files = sourceFiles(root)
    .filter((f) => !f.endsWith(path.join("components", "exports", "exportUtils.jsx")))
    .map((f) => ({ file: path.relative(path.join(root, ".."), f), text: fs.readFileSync(f, "utf8") }))
    .filter(({ text }) => /from ['"][^'"]*exportUtils['"]/.test(text) && builders.test(text));

  it("finds the pages and components that build exports", () => {
    expect(files.map((f) => path.basename(f.file)).sort()).toEqual(expect.arrayContaining([
      "DMEProviderReport.jsx", "ExportDialog.jsx", "LeadListBuilder.jsx", "LeadListStatusExport.jsx", "MarketIntelligence.jsx", "ReportDataTable.jsx",
    ]));
  });

  it("counts each one against the daily allowance before building the file", () => {
    const uncounted = files.filter(({ text }) => !/\bcountExport\(\)/.test(text)).map((f) => f.file);
    expect(uncounted).toEqual([]);
  });
});
