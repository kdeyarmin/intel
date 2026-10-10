// Developer-only: rebuilds server/data/census from the Census Bureau's 2020
// Gazetteer and ZCTA↔county relationship files (public domain). Run once
// when updating the vintage; the app loads the committed output.
//
//   npx tsx scripts/census/build-census-geo.ts            # download
//   npx tsx scripts/census/build-census-geo.ts --from DIR # use files already in DIR
import crypto from "crypto";
import fs from "fs";
import path from "path";
import zlib from "zlib";
import {
  buildGeoTables,
  COUNTY_COLUMNS,
  parseCountyGazetteer,
  parseZctaCountyRelationship,
  parseZctaGazetteer,
  toCsv,
  ZCTA_COLUMNS,
  ZCTA_COUNTY_COLUMNS,
} from "../../server/lib/census/parse";

export const SOURCES = {
  counties: "https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2020_Gazetteer/2020_Gaz_counties_national.zip",
  zctas: "https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2020_Gazetteer/2020_Gaz_zcta_national.zip",
  relationships: "https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/tab20_zcta520_county20_natl.txt",
};

const OUT = path.resolve(import.meta.dirname, "..", "..", "server", "data", "census");
const sha256 = (b: Buffer | string) => crypto.createHash("sha256").update(b).digest("hex");

/** The single .txt member of a Gazetteer zip (stored or deflated). */
function unzipSingleText(buf: Buffer): string {
  const sig = buf.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  if (sig < 0) throw new Error("Not a zip file");
  const method = buf.readUInt16LE(sig + 8);
  const compressed = buf.readUInt32LE(sig + 18);
  const nameLen = buf.readUInt16LE(sig + 26);
  const extraLen = buf.readUInt16LE(sig + 28);
  const start = sig + 30 + nameLen + extraLen;
  const data = buf.subarray(start, start + compressed);
  if (method === 0) return data.toString("utf8");
  if (method === 8) return zlib.inflateRawSync(data).toString("utf8");
  throw new Error(`Unsupported zip method ${method}`);
}

async function fetchSource(url: string, fromDir: string | null): Promise<Buffer> {
  if (fromDir) return fs.readFileSync(path.join(fromDir, path.basename(url)));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  const fromIdx = process.argv.indexOf("--from");
  const fromDir = fromIdx > 0 ? path.resolve(process.argv[fromIdx + 1]) : null;
  const raw = {
    counties: await fetchSource(SOURCES.counties, fromDir),
    zctas: await fetchSource(SOURCES.zctas, fromDir),
    relationships: await fetchSource(SOURCES.relationships, fromDir),
  };
  const tables = buildGeoTables({
    counties: parseCountyGazetteer(unzipSingleText(raw.counties)),
    zctas: parseZctaGazetteer(unzipSingleText(raw.zctas)),
    relationships: parseZctaCountyRelationship(raw.relationships.toString("utf8")),
  });

  fs.mkdirSync(OUT, { recursive: true });
  const outputs: Record<string, { file: string; sha256: string; rows: number }> = {};
  const write = (name: string, columns: string[], rows: any[]) => {
    // gzip headers carry no timestamp, so identical input gives identical bytes.
    const gz = zlib.gzipSync(Buffer.from(toCsv(columns, rows), "utf8"), { level: 9 });
    const file = `${name}.csv.gz`;
    fs.writeFileSync(path.join(OUT, file), gz);
    outputs[name] = { file, sha256: sha256(gz), rows: rows.length };
  };
  write("geo_counties", COUNTY_COLUMNS, tables.counties);
  write("geo_zctas", ZCTA_COLUMNS, tables.zctas);
  write("geo_zcta_counties", ZCTA_COUNTY_COLUMNS, tables.zctaCounties);

  const manifest = {
    vintage: "2020",
    description: "U.S. Census Bureau 2020 Gazetteer (counties, ZCTAs) and 2020 ZCTA-to-county relationship file. Public domain.",
    sources: Object.fromEntries(Object.entries(SOURCES).map(([k, url]) => [k, { url, sha256: sha256(raw[k as keyof typeof raw]) }])),
    outputs,
    // ZCTAs with no relationship rows, given the county of the nearest ZCTA.
    inferred_counties: tables.inferredCounties,
    dataset_sha256: sha256(Object.values(outputs).map((o) => o.sha256).join("")),
  };
  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log(`[census] ${tables.counties.length} counties, ${tables.zctas.length} ZCTAs, ${tables.zctaCounties.length} ZCTA-county pairs → ${OUT}`);
}

main().catch((e) => {
  console.error("[census] Failed:", e?.message || e);
  process.exit(1);
});
