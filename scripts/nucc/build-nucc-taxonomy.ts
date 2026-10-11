// Developer-only: rebuilds server/data/nucc from the NUCC Health Care
// Provider Taxonomy CSV (nucc.org publishes a new version each January and
// July; the code set is freely redistributable). Run when updating the
// version; the app loads the committed output.
//
//   npx tsx scripts/nucc/build-nucc-taxonomy.ts --version 261            # download
//   npx tsx scripts/nucc/build-nucc-taxonomy.ts --version 261 --from DIR # use a file already in DIR
import crypto from "crypto";
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { toCsv } from "../../server/lib/census/parse";
import { parseNuccTaxonomy, TAXONOMY_COLUMNS } from "../../server/lib/nucc/parse";

const OUT = path.resolve(import.meta.dirname, "..", "..", "server", "data", "nucc");
const sha256 = (b: Buffer | string) => crypto.createHash("sha256").update(b).digest("hex");

export function sourceUrl(version: string) {
  return `https://www.nucc.org/images/stories/CSV/nucc_taxonomy_${version}.csv`;
}

/** "261" → "26.1" (year 2026, release 1: January; 2 is July). */
export function versionLabel(version: string) {
  return `${version.slice(0, 2)}.${version.slice(2)}`;
}

/** The release month of a version: .0 is January, .1 is July. */
export function releaseDate(version: string) {
  const year = 2000 + Number(version.slice(0, 2));
  return version.endsWith("0") ? `${year}-01` : `${year}-07`;
}

async function fetchSource(url: string, fromDir: string | null): Promise<Buffer> {
  if (fromDir) return fs.readFileSync(path.join(fromDir, path.basename(url)));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0) throw new Error(`${url}: empty response (no such version?)`);
  return buf;
}

async function main() {
  const arg = (name: string) => {
    const i = process.argv.indexOf(name);
    return i > 0 ? process.argv[i + 1] : null;
  };
  const version = arg("--version");
  if (!version || !/^\d{3}$/.test(version)) throw new Error("--version NNN is required (e.g. 261 for 26.1)");
  const fromDir = arg("--from");
  const url = sourceUrl(version);
  const raw = await fetchSource(url, fromDir ? path.resolve(fromDir) : null);
  const rows = parseNuccTaxonomy(raw.toString("utf8"));
  if (rows.length < 800) throw new Error(`Only ${rows.length} codes parsed; the file doesn't look like the NUCC taxonomy`);

  fs.mkdirSync(OUT, { recursive: true });
  // gzip headers carry no timestamp, so identical input gives identical bytes.
  const gz = zlib.gzipSync(Buffer.from(toCsv([...TAXONOMY_COLUMNS], rows), "utf8"), { level: 9 });
  const file = "nucc_taxonomies.csv.gz";
  fs.writeFileSync(path.join(OUT, file), gz);
  const outputs = { nucc_taxonomies: { file, sha256: sha256(gz), rows: rows.length } };
  const manifest = {
    version: versionLabel(version),
    released: releaseDate(version),
    description: "NUCC Health Care Provider Taxonomy code set (nucc.org). Codes, grouping, classification, specialization, display name, section and definition; the Notes column is not kept.",
    source: { url, sha256: sha256(raw) },
    outputs,
    dataset_sha256: sha256(Object.values(outputs).map((o) => o.sha256).join("")),
  };
  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log(`[nucc] ${rows.length} codes (version ${manifest.version}) → ${OUT}`);
}

main().catch((e) => {
  console.error("[nucc] Failed:", e?.message || e);
  process.exit(1);
});
