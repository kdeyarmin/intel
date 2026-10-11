// Developer-only: rebuilds the ACS demand bundle (server/data/census/acs_*.csv.gz
// and acs.manifest.json) from the Census Bureau's ACS 5-year table-based
// summary files, which need no API key. Run once a year when the new 5-year
// release lands (December); the app loads the committed output.
//
//   npx tsx scripts/census/build-acs.ts --year 2024            # download (~300 MB)
//   npx tsx scripts/census/build-acs.ts --year 2024 --from DIR # use acsdt5y<year>-*.dat already in DIR
import crypto from "crypto";
import fs from "fs";
import path from "path";
import readline from "readline";
import zlib from "zlib";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { toCsv } from "../../server/lib/census/parse";
import { ACS_COUNTY_COLUMNS, ACS_MANIFEST, ACS_VARIABLES, ACS_ZCTA_COLUMNS, buildAcsRows, readAcsTable } from "../../server/lib/census/acs";

const TABLES = ["b01001", "b19013", "b25077", "b11007"];
const OUT = path.resolve(import.meta.dirname, "..", "..", "server", "data", "census");
const sha256File = (file: string) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const sha256 = (b: Buffer | string) => crypto.createHash("sha256").update(b).digest("hex");

export const sourceUrl = (year: string, table: string) =>
  `https://www2.census.gov/programs-surveys/acs/summary_file/${year}/table-based-SF/data/5YRData/acsdt5y${year}-${table}.dat`;

async function fetchTo(url: string, file: string) {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`${url}: HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body as any), fs.createWriteStream(file));
}

async function main() {
  const arg = (name: string) => {
    const i = process.argv.indexOf(name);
    return i > 0 ? process.argv[i + 1] : null;
  };
  const year = arg("--year");
  if (!year || !/^\d{4}$/.test(year)) throw new Error("--year YYYY is required (the last year of the 5-year period, e.g. 2024)");
  const fromDir = arg("--from");
  const workDir = fromDir ? path.resolve(fromDir) : fs.mkdtempSync(path.join(OUT, ".acs-"));
  const wantedByTable = new Map<string, string[]>();
  for (const vars of Object.values(ACS_VARIABLES)) for (const v of vars) {
    const table = v.slice(0, 6).toLowerCase();
    wantedByTable.set(table, [...new Set([...(wantedByTable.get(table) || []), v])]);
  }

  const sources: Record<string, { url: string; sha256: string }> = {};
  const countyTables: Array<Map<string, any>> = [];
  const zctaTables: Array<Map<string, any>> = [];
  for (const table of TABLES) {
    const url = sourceUrl(year, table);
    const file = path.join(workDir, path.basename(url));
    if (!fs.existsSync(file)) {
      console.log(`[acs] downloading ${url}`);
      await fetchTo(url, file);
    }
    sources[table] = { url, sha256: sha256File(file) };
    const lines = readline.createInterface({ input: fs.createReadStream(file, { encoding: "utf8" }), crlfDelay: Infinity });
    const { counties, zctas } = await readAcsTable(lines, wantedByTable.get(table) || []);
    console.log(`[acs] ${table}: ${counties.size} counties, ${zctas.size} ZCTAs`);
    countyTables.push(counties);
    zctaTables.push(zctas);
  }
  if (!fromDir) fs.rmSync(workDir, { recursive: true, force: true });

  const counties = buildAcsRows(countyTables, "fips");
  const zctas = buildAcsRows(zctaTables, "zcta");
  if (counties.length < 3000 || zctas.length < 30000) throw new Error(`Too few rows (${counties.length} counties, ${zctas.length} ZCTAs); the files don't look like the national 5-year tables`);

  fs.mkdirSync(OUT, { recursive: true });
  const outputs: Record<string, { file: string; sha256: string; rows: number }> = {};
  const write = (name: string, columns: string[], rows: any[]) => {
    const gz = zlib.gzipSync(Buffer.from(toCsv(columns, rows), "utf8"), { level: 9 });
    const file = `${name}.csv.gz`;
    fs.writeFileSync(path.join(OUT, file), gz);
    outputs[name] = { file, sha256: sha256(gz), rows: rows.length };
  };
  write("census_acs_county", ACS_COUNTY_COLUMNS, counties);
  write("census_acs_zcta", ACS_ZCTA_COLUMNS, zctas);
  const start = Number(year) - 4;
  const manifest = {
    vintage: `${start}-${year}`,
    released: `${Number(year) + 1}-12`,
    description: `U.S. Census Bureau American Community Survey ${start}-${year} 5-year estimates (tables B01001, B19013, B25077, B11007) for counties and 2020 ZIP Code Tabulation Areas. Public domain.`,
    sources,
    outputs,
    dataset_sha256: sha256(Object.values(outputs).map((o) => o.sha256).join("")),
  };
  fs.writeFileSync(path.join(OUT, ACS_MANIFEST), JSON.stringify(manifest, null, 2) + "\n");
  console.log(`[acs] ${counties.length} counties, ${zctas.length} ZCTAs → ${OUT}`);
}

main().catch((e) => {
  console.error("[acs] Failed:", e?.message || e);
  process.exit(1);
});
