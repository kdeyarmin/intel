// Which state a CMS row belongs to when it has no state column, so an import's state_filter still works on
// feeds keyed by a CCN or a FIPS code. Pure (no database): used by the import row filter.
import { STATE_FIPS, stateOfFips } from "./stateFips";

/**
 * The first two characters of a CMS Certification Number (CCN) say which state it was issued in. Read from CMS's
 * own files (Care Compare hospitals, nursing homes, home health agencies and hospices, October 2026): every
 * prefix below names exactly one state there, the newer series (55, 67, 68, 74, 75, 92, 97, A0-D6) included.
 * A prefix that is not listed names no state, and a state filter drops that row.
 */
export const CCN_PREFIX_STATE: Readonly<Record<string, string>> = {
  "00": "AZ", "01": "AL", "02": "AK", "03": "AZ", "04": "AR", "05": "CA", "06": "CO", "07": "CT", "08": "DE", "09": "DC",
  "10": "FL", "11": "GA", "12": "HI", "13": "ID", "14": "IL", "15": "IN", "16": "IA", "17": "KS", "18": "KY", "19": "LA",
  "20": "ME", "21": "MD", "22": "MA", "23": "MI", "24": "MN", "25": "MS", "26": "MO", "27": "MT", "28": "NE", "29": "NV",
  "30": "NH", "31": "NJ", "32": "NM", "33": "NY", "34": "NC", "35": "ND", "36": "OH", "37": "OK", "38": "OR", "39": "PA",
  "40": "PR", "41": "RI", "42": "SC", "43": "SD", "44": "TN", "45": "TX", "46": "UT", "47": "VT", "48": "VI", "49": "VA",
  "50": "WA", "51": "WV", "52": "WI", "53": "WY", "55": "CA", "64": "AS", "65": "GU", "66": "MP", "67": "TX", "68": "FL",
  "72": "OH", "73": "PA", "74": "TX", "75": "CA", "85": "GA", "92": "CA", "97": "TX",
  A0: "CA", A1: "CA", A9: "TX", B2: "CA", B3: "CA", B4: "CA", B5: "CA", D6: "CA",
};

export function stateOfCcn(ccn: unknown): string | null {
  const v = String(ccn ?? "").trim().toUpperCase();
  return v.length >= 2 ? CCN_PREFIX_STATE[v.slice(0, 2)] ?? null : null;
}

/** Columns that hold a CCN in the feeds that have no state column (Hospital Service Area, facility affiliations). */
const CCN_FIELDS = ["MEDICARE_PROV_NUM", "medicare_prov_num", "facility_affiliations_certification_number", "cms_certification_number_ccn", "ccn", "CCN"];

function firstValue(row: any, keys: string[]): string {
  for (const k of keys) {
    const v = row?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

/**
 * The state a row names without a state column of its own: the state its CCN was issued in, or the state of its
 * geography ("PA-Allegheny" or a FIPS code, as in Medicare Geographic Variation). Null when it names none.
 */
export function derivedStateOf(row: any): string | null {
  const fromCcn = stateOfCcn(firstValue(row, CCN_FIELDS));
  if (fromCcn) return fromCcn;
  const desc = /^([A-Z]{2})(?:\s*-|\s*$)/.exec(firstValue(row, ["BENE_GEO_DESC"]));
  if (desc && STATE_FIPS[desc[1]]) return desc[1];
  return stateOfFips(firstValue(row, ["BENE_GEO_CD"]));
}

/** Rows to read before concluding that a dataset carries no state at all (five pages of 1,000). */
export const STATE_PROBE_ROWS = 5000;

/**
 * Notices a state_filter that can match nothing: a dataset none of whose rows names a state (Order & Referring
 * is keyed by NPI alone) would otherwise be read to the end and import zero rows without saying why. Feed it
 * each page's rows until it answers "ok" (a row named a state); "unsupported" is the signal to stop.
 */
export function stateProbe(stateOf: (row: any) => string | null) {
  let seen = 0;
  let found = false;
  return {
    page(rows: any[]): "unsupported" | "ok" | "unknown" {
      if (found) return "ok";
      for (const row of rows) {
        if (stateOf(row)) { found = true; return "ok"; }
        seen++;
      }
      return seen >= STATE_PROBE_ROWS ? "unsupported" : "unknown";
    },
    /** The data ran out: true when rows were read and none named a state. */
    exhaustedWithoutState(): boolean {
      return !found && seen > 0;
    },
  };
}

/** The failure message of a state_filter that cannot apply (worded so auto-retry does not take it for a transient error). */
export function stateFilterUnsupportedMessage(importType: string, stateFilter: unknown): string {
  return `state_filter ${JSON.stringify(String(stateFilter))} can't be applied to ${importType}: its rows name no state (no state column, CCN or FIPS code), so every row would be skipped. Import it without a state filter.`;
}
