// The Billing page works out a county pack's state from its counties' FIPS
// prefix, with a map that mirrors the server's (server/lib/entitlements.ts).
import { describe, expect, it } from "vitest";
import { STATE_FIPS as clientMap, stateFipsOf as clientFips, stateOfCounty } from "../src/lib/stateFips.js";
import { STATE_FIPS as serverMap, stateFipsOf } from "../server/lib/entitlements";
import { US_STATES } from "../src/lib/usStates.js";

describe("state FIPS prefixes", () => {
  it("are the same on the client and the server, state by state", () => {
    expect(clientMap).toEqual(serverMap);
    for (const [abbr, fips] of Object.entries(serverMap)) expect(clientFips(abbr), abbr).toBe(fips);
    expect(stateFipsOf("pa")).toBe("42");
    expect(clientFips("pa")).toBe("42");
  });

  it("cover every state the territory picker offers", () => {
    for (const state of US_STATES) expect(clientFips(state), state).toMatch(/^\d{2}$/);
  });

  it("map a county FIPS back to its state", () => {
    expect(stateOfCounty("42003")).toBe("PA");
    expect(stateOfCounty("39035")).toBe("OH");
    expect(stateOfCounty("72001")).toBe("PR");
    for (const [abbr, fips] of Object.entries(serverMap)) expect(stateOfCounty(`${fips}001`), abbr).toBe(abbr);
    expect(stateOfCounty("99999")).toBeNull();
    expect(stateOfCounty("")).toBeNull();
    expect(stateOfCounty(undefined)).toBeNull();
  });
});
