// The NPPES data dissemination files CMS publishes at
// https://download.cms.gov/nppes/NPI_Files.html (V.2 since 2026-03): a full
// replacement file each month, an incremental file each week, and a monthly
// deactivation report. The page is plain HTML with relative zip links.
import { safeFetchStream } from "./safeFetch";

export const NPI_FILES_PAGE = "https://download.cms.gov/nppes/NPI_Files.html";
export const NPI_FILES_BASE = "https://download.cms.gov/nppes/";

export type NppesFileKind = "monthly" | "weekly" | "deactivation";

export interface NppesFile {
  kind: NppesFileKind;
  name: string;
  url: string;
  /** The last day the file covers (YYYY-MM-DD). */
  periodEnd: string;
  periodStart: string | null;
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

function mmddyy(s: string): string {
  return `20${s.slice(4, 6)}-${s.slice(0, 2)}-${s.slice(2, 4)}`;
}

/** Pure: the file a zip link names, or null for anything else (V.1 files, dictionaries). */
export function classifyNppesLink(href: string): NppesFile | null {
  const name = href.split("/").pop() || "";
  const url = /^https?:\/\//i.test(href) ? href : NPI_FILES_BASE + name;
  let m = /^NPPES_Data_Dissemination_(\d{6})_(\d{6})_Weekly_V2\.zip$/i.exec(name);
  if (m) return { kind: "weekly", name, url, periodStart: mmddyy(m[1]), periodEnd: mmddyy(m[2]) };
  m = /^NPPES_Data_Dissemination_([A-Za-z]+)_(\d{4})_V2\.zip$/i.exec(name);
  if (m) {
    const month = MONTHS.indexOf(m[1].toLowerCase());
    if (month < 0) return null;
    const last = new Date(Date.UTC(Number(m[2]), month + 1, 0)).getUTCDate();
    const mm = String(month + 1).padStart(2, "0");
    return { kind: "monthly", name, url, periodStart: `${m[2]}-${mm}-01`, periodEnd: `${m[2]}-${mm}-${String(last).padStart(2, "0")}` };
  }
  m = /^NPPES_Deactivated_NPI_Report_(\d{6})_V2\.zip$/i.exec(name);
  if (m) return { kind: "deactivation", name, url, periodStart: null, periodEnd: mmddyy(m[1]) };
  return null;
}

/** Pure: every V.2 file linked from the NPI files page, newest first per kind. */
export function parseNpiFilesPage(html: string): NppesFile[] {
  const out: NppesFile[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(/href\s*=\s*["']([^"']+\.zip)["']/gi)) {
    const file = classifyNppesLink(m[1]);
    if (!file || seen.has(file.name)) continue;
    seen.add(file.name);
    out.push(file);
  }
  return out.sort((a, b) => b.periodEnd.localeCompare(a.periodEnd));
}

export function newestNppesFile(files: NppesFile[], kind: NppesFileKind): NppesFile | null {
  return files.find((f) => f.kind === kind) || null;
}

export async function fetchNpiFilesPage(): Promise<string> {
  const res = await safeFetchStream(NPI_FILES_PAGE);
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${NPI_FILES_PAGE}`);
  return res.text();
}

/** The newest file of a kind on CMS's page. */
export async function resolveNppesFile(kind: NppesFileKind, fetchPage: () => Promise<string> = fetchNpiFilesPage): Promise<NppesFile | null> {
  return newestNppesFile(parseNpiFilesPage(await fetchPage()), kind);
}
