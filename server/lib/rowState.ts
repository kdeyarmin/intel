// Which state a CMS row belongs to when it has no state column, so an import's state_filter still works on
// feeds keyed by a CCN or a FIPS code. Pure (no database): used by the import row filter.
import { STATE_FIPS, stateOfFips } from "./stateFips";

/**
 * The two-character CCN prefixes CMS has assigned to each state or territory. A state gets its first prefix (01 for
 * Alabama), then further ones as its ranges fill up: later two-digit codes (69, 73, 91...), then letter-and-digit
 * codes (A2, D3...). This is the table in the State Operations Manual, chapter 2, section 2779A1 (Rev. 226,
 * 12-06-24), by state. Canada (56), Mexico (59) and foreign countries (99) name no state of ours and are left out.
 * CMS adds codes as it needs them, so check the manual when it is revised; tests/rowState.test.ts holds this table
 * to the prefixes of the live Provider of Services file (October 2026).
 */
export const CCN_STATE_CODES: Readonly<Record<string, readonly string[]>> = {
  AL: ["01", "B7"], AK: ["02"], AZ: ["03", "00", "D9"], AR: ["04", "89"],
  CA: ["05", "55", "75", "92", "A0", "A1", "B2", "B3", "B4", "B5", "D6", "D7", "D8"],
  CO: ["06", "91"], CT: ["07", "81"], DE: ["08", "B9"], DC: ["09", "C0"],
  FL: ["10", "68", "69", "A2", "C1"], GA: ["11", "85", "C2"], HI: ["12"], ID: ["13", "54"],
  IL: ["14", "78", "C4"], IN: ["15", "C5"], IA: ["16", "76"], KS: ["17", "70"], KY: ["18", "B0"],
  LA: ["19", "71", "95", "A3"], ME: ["20", "C6"], MD: ["21", "80"], MA: ["22", "82"],
  MI: ["23", "A4", "C7"], MN: ["24", "77"], MS: ["25", "A5", "C8"], MO: ["26", "79", "C9"],
  MT: ["27"], NE: ["28", "D0"], NV: ["29", "E1"], NH: ["30"], NJ: ["31", "83"], NM: ["32", "96"],
  NY: ["33", "57", "D1"], NC: ["34", "86", "B6"], ND: ["35"], OH: ["36", "72", "A6", "D2"],
  OK: ["37", "90"], OR: ["38", "93"], PA: ["39", "73", "A7", "D3"], PR: ["40", "84"], RI: ["41"],
  SC: ["42", "87", "D4"], SD: ["43"], TN: ["44", "88", "A8"], TX: ["45", "67", "74", "97", "A9", "E2", "E3"],
  UT: ["46"], VT: ["47"], VI: ["48"], VA: ["49", "D5"], WA: ["50", "94"], WV: ["51", "58", "B1"],
  WI: ["52"], WY: ["53"], AS: ["64"], GU: ["65", "C3"], MP: ["66", "B8"],
};

/** The same table the other way round: a prefix names exactly one state (a test keeps it so). A prefix that is not listed names no state, and a state filter drops that row. */
export const CCN_PREFIX_STATE: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(CCN_STATE_CODES).flatMap(([state, codes]) => codes.map((code) => [code, state])),
);

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
