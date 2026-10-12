import { describe, expect, it } from "vitest";
import { STATE_NAMES, stateCodeOf } from "../server/lib/stateNames";

describe("stateCodeOf", () => {
  it("takes a postal code in any case", () => {
    expect(stateCodeOf("PA")).toBe("PA");
    expect(stateCodeOf(" pa ")).toBe("PA");
  });

  it("takes a state spelled out, with stray case, spacing and periods", () => {
    expect(stateCodeOf("Pennsylvania")).toBe("PA");
    expect(stateCodeOf("NEW   YORK")).toBe("NY");
    expect(stateCodeOf("west virginia")).toBe("WV");
    expect(stateCodeOf("Virginia")).toBe("VA");
    expect(stateCodeOf("District of Columbia")).toBe("DC");
    expect(stateCodeOf("Puerto Rico")).toBe("PR");
  });

  it("says nothing for what is not a state", () => {
    for (const v of ["", "  ", null, undefined, "XX", "P", "Penn", "Narnia", "Washington, D.C.", 42]) expect(stateCodeOf(v), String(v)).toBeNull();
  });

  it("covers the states, DC and the five territories, each name once", () => {
    expect(Object.keys(STATE_NAMES)).toHaveLength(56);
    expect(new Set(Object.values(STATE_NAMES)).size).toBe(56);
    for (const [code, name] of Object.entries(STATE_NAMES)) expect(stateCodeOf(name), name).toBe(code);
  });
});
