import { describe, it, expect } from "vitest";
import { buildLocationSearchPlan, parseCityState, rankLocations } from "../server/lib/locationSearch";
import { SEARCH_EXPR } from "../server/lib/searchIndexes";

const plan = (input: any) => buildLocationSearchPlan(input) as any;

describe("buildLocationSearchPlan", () => {
  it("looks up an NPI", () => {
    const p = plan({ q: "1234567890" });
    expect(p).toMatchObject({ interpretation: "npi", label: "NPI 1234567890" });
    expect(p.text).toContain("npi = $1");
  });

  it("matches ZIP5 and ZIP+4 on the 5-digit index expression", () => {
    const p = plan({ q: "15213-1234" });
    expect(p).toMatchObject({ interpretation: "zip", label: "ZIP 15213-1234" });
    expect(p.text).toContain(`${SEARCH_EXPR.zip5} = $1`);
    expect(p.values[0]).toBe("15213");
    expect(plan({ q: "152131234" }).interpretation).toBe("zip");
    expect(plan({ q: "15213", state: "pa" }).values.slice(0, 2)).toEqual(["15213", "PA"]);
  });

  it('understands "City, ST" and "City ST"', () => {
    expect(parseCityState("Pittsburgh, PA")).toEqual({ city: "Pittsburgh", state: "PA" });
    expect(parseCityState("new castle de")).toEqual({ city: "new castle", state: "DE" });
    expect(parseCityState("Pittsburgh, XX")).toBeNull();
    const p = plan({ q: "Pittsburgh, pa", location_type: "Practice", locationType: "Practice", limit: 50 });
    expect(p).toMatchObject({ interpretation: "city_state", label: "Pittsburgh, PA" });
    expect(p.text).toContain(`state = $1 AND ${SEARCH_EXPR.cityUpper} LIKE $2`);
    expect(p.text).toContain("location_type = $3");
    expect(p.values).toEqual(["PA", "PITTSBURGH%", "Practice", 51]);
  });

  it("uses the state filter for a bare city", () => {
    expect(plan({ q: "Erie", state: "PA" })).toMatchObject({ interpretation: "city_state", label: "Erie, PA" });
  });

  it("asks for a state instead of scanning for a city", () => {
    expect(buildLocationSearchPlan({ q: "Springfield" })).toEqual({ needsState: true, message: expect.stringContaining("Springfield, PA") });
  });

  it("browses a state", () => {
    expect(plan({ q: "", state: "oh" })).toMatchObject({ interpretation: "state", values: ["OH", 201] });
    expect(plan({ q: "wv" })).toMatchObject({ interpretation: "state", label: "Locations in WV" });
    expect(buildLocationSearchPlan({ q: "" })).toBeNull();
  });

  it("escapes LIKE wildcards in city names", () => {
    expect(plan({ q: "50%_, PA" }).values[1]).toBe("50\\%\\_%");
  });
});

describe("rankLocations", () => {
  it("puts exact ZIP+4 matches first", () => {
    const rows = [{ id: 1, zip: "152130001" }, { id: 2, zip: "15213-1234" }];
    expect(rankLocations(rows, "15213-1234").map((r) => r.id)).toEqual([2, 1]);
    expect(rankLocations(rows, "15213")).toBe(rows);
  });
});
