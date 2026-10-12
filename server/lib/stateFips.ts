// State FIPS prefixes: a county FIPS code is SSCCC, a state's is SS. Pure (no database), so import paths and
// entitlements can both use it; src/lib/stateFips.js mirrors it for the browser (tests/stateFipsParity.test.ts).
export const STATE_FIPS: Record<string, string> = {
  AL: "01", AK: "02", AZ: "04", AR: "05", CA: "06", CO: "08", CT: "09", DE: "10", DC: "11", FL: "12", GA: "13", HI: "15", ID: "16", IL: "17", IN: "18", IA: "19", KS: "20", KY: "21", LA: "22", ME: "23", MD: "24", MA: "25", MI: "26", MN: "27", MS: "28", MO: "29", MT: "30", NE: "31", NV: "32", NH: "33", NJ: "34", NM: "35", NY: "36", NC: "37", ND: "38", OH: "39", OK: "40", OR: "41", PA: "42", RI: "44", SC: "45", SD: "46", TN: "47", TX: "48", UT: "49", VT: "50", VA: "51", WA: "53", WV: "54", WI: "55", WY: "56", PR: "72", AS: "60", GU: "66", MP: "69", VI: "78",
};

export const FIPS_STATE: Readonly<Record<string, string>> = Object.fromEntries(Object.entries(STATE_FIPS).map(([k, v]) => [v, k]));

export function stateFipsOf(state: string): string | null {
  return STATE_FIPS[state.toUpperCase()] ?? null;
}

/** The state a FIPS code names: a two-digit state code or a five-digit county code. Null for anything else. */
export function stateOfFips(fips: unknown): string | null {
  const v = String(fips ?? "").trim();
  if (!/^\d{2}(\d{3})?$/.test(v)) return null;
  return FIPS_STATE[v.slice(0, 2)] ?? null;
}
