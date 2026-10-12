// US states, the District of Columbia and the territories, for files that spell
// the state out ("Pennsylvania") where the rest of the app uses the postal code.
export const STATE_NAMES: Readonly<Record<string, string>> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut",
  DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
  VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  PR: "Puerto Rico", VI: "Virgin Islands", GU: "Guam", AS: "American Samoa", MP: "Northern Mariana Islands",
};

const BY_NAME = new Map(Object.entries(STATE_NAMES).map(([code, name]) => [name.toLowerCase(), code]));

/**
 * The postal code for a state given as a code ("pa") or a name ("Pennsylvania", "District of Columbia"),
 * or null when it is neither (blank, a typo, a code that isn't one).
 */
export function stateCodeOf(value: unknown): string | null {
  const v = String(value ?? "").trim();
  if (!v) return null;
  if (/^[A-Za-z]{2}$/.test(v)) return STATE_NAMES[v.toUpperCase()] ? v.toUpperCase() : null;
  return BY_NAME.get(v.toLowerCase().replace(/\./g, "").replace(/\s+/g, " ")) ?? null;
}
