import { describe, expect, it, vi } from "vitest";
import { buildGeoIndex } from "../server/lib/geo";
import { buildZipRadius, haversineMiles, resolveZipRadius, runRadiusProviderSearch, zipDistance } from "../server/lib/radiusSearch";
import { buildProviderSearchPlan } from "../server/lib/providerSearch";

const index = buildGeoIndex({
  counties: [],
  zctas: [
    { zcta: "01001", lat: 0, lng: 0, primary_county_fips: null, state: "MA" },
    { zcta: "01002", lat: 0.1, lng: 0, primary_county_fips: null, state: "MA" },
    { zcta: "01003", lat: 1, lng: 0, primary_county_fips: null, state: "CT" },
  ],
  zctaCounties: [],
});
const caps = { lastName: true, orgPrefix: true, trigram: true, trigramPending: false, zip5: true, stateCity: true, primaryTaxonomy: true };

describe("ZIP centroid radius", () => {
  it("calculates miles, including coincident, antipodal and dateline points", () => {
    expect(haversineMiles({ lat: 0, lng: 0 }, { lat: 0, lng: 0 })).toBe(0);
    expect(haversineMiles({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(69.093, 2);
    expect(haversineMiles({ lat: 0, lng: 0 }, { lat: 0, lng: 180 })).toBeCloseTo(12436.8, 0);
    expect(haversineMiles({ lat: 0, lng: 179.99 }, { lat: 0, lng: -179.99 })).toBeLessThan(2);
  });

  it("includes the boundary, excludes more distant ZIPs, and handles ZIP+4", () => {
    const boundary = haversineMiles(index.zctas.get("01001")!, index.zctas.get("01002")!);
    expect([...buildZipRadius(index, "01001", boundary).distances.keys()]).toEqual(["01001", "01002"]);
    expect([...buildZipRadius(index, "01001", 5).distances.keys()]).toEqual(["01001"]);
    const radius = buildZipRadius(index, "01001", 10);
    expect(zipDistance(radius, "01002-1234")).toBeCloseTo(6.9093, 3);
    expect(zipDistance(radius, "99999")).toBeNull();
    expect(zipDistance(radius, null)).toBeNull();
    expect(zipDistance(radius, "01001")).toBe(0);
  });

  it("rejects unknown centroids and unloaded geography instead of approximating by state", () => {
    expect(() => buildZipRadius(index, "99999", 25)).toThrow(/No ZIP-area centroid/);
    expect(() => buildZipRadius(buildGeoIndex({ counties: [], zctas: [], zctaCounties: [] }), "01001", 25)).toThrow(/not loaded/);
  });

  it.each([
    { radius_zip: "1234", radius_miles: 25 },
    { radius_zip: "01001-1234", radius_miles: 25 },
    { radius_zip: "01001", radius_miles: 0 },
    { radius_zip: "01001", radius_miles: 500 },
    { radius_zip: "01001", radius_miles: "bad" },
    { radius_miles: 25 },
  ])("rejects invalid radius input before querying: %j", async (payload) => {
    const pool = { connect: vi.fn() };
    await expect(resolveZipRadius(pool, payload)).rejects.toMatchObject({ status: 400 });
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it("does not load geography when radius is absent", async () => {
    await expect(resolveZipRadius({}, {})).resolves.toBeNull();
  });
});

describe("radius provider search", () => {
  it("uses the ZIP index and state together, deduplicates NPIs, and returns the closest matching location", async () => {
    const client = { query: vi.fn()
      .mockResolvedValueOnce({ rows: [
        { npi: "a", zip: "01002-1234", state: "MA" },
        { npi: "a", zip: "01001", state: "MA" },
        { npi: "b", zip: "01002", state: "MA" },
      ] })
      .mockResolvedValueOnce({ rows: [{ npi: "b" }, { npi: "a" }] }) };
    const result = await runRadiusProviderSearch(client, "", { limit: 1, state: "MA", entityType: "Individual" }, caps, buildZipRadius(index, "01001", 10));
    expect(client.query.mock.calls[0][0]).toContain("left(zip, 5) = ANY($1) AND state = $2 LIMIT $3");
    expect(client.query.mock.calls[0][1]).toEqual([["01001", "01002"], "MA", 20001]);
    expect(client.query.mock.calls[1][1]).toEqual([["a", "b"], "Individual"]);
    expect(result.providers).toMatchObject([{ npi: "a", distance_miles: 0, radius_location: { zip: "01001" } }]);
    expect(result.truncated).toBe(true);
  });

  it("scopes every text search query to radius NPIs before its LIMIT", () => {
    for (const q of ["Smith", "John Smith", "Mercy", "123", "999", "1234567890"]) {
      for (const entityType of [null, "Individual", "Organization"] as const) {
        const plan = buildProviderSearchPlan(q, { npis: ["a"], entityType }, caps)!;
        for (const query of plan.queries) {
          expect(query.text).toMatch(/AND npi = ANY\(\$\d+\).*LIMIT/);
          const placeholders = [...query.text.matchAll(/\$(\d+)/g)].map((m) => Number(m[1]));
          expect(Math.max(...placeholders)).toBe(query.values.length);
          expect(query.values).toContainEqual(["a"]);
        }
      }
    }
  });

  it("keeps text matching server-side and returns no providers when no nearby locations exist", async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    const result = await runRadiusProviderSearch(client, "Smith", {}, caps, buildZipRadius(index, "01001", 5));
    expect(result.providers).toEqual([]);
    expect(result.truncated).toBe(false);
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it("runs name queries with only the nearby NPIs and reports degraded indexes", async () => {
    const client = { query: vi.fn()
      .mockResolvedValueOnce({ rows: [{ npi: "a", zip: "01001" }] })
      .mockResolvedValue({ rows: [{ npi: "a", first_name: "Jane", last_name: "Smith" }] }) };
    const result = await runRadiusProviderSearch(client, "Smith", { entityType: "Individual" }, { ...caps, zip5: false }, buildZipRadius(index, "01001", 5));
    expect(client.query.mock.calls[1][0]).toContain("AND npi = ANY($3)");
    expect(client.query.mock.calls[1][1]).toEqual(["smith%", "Individual", ["a"], 500]);
    expect(result.providers).toMatchObject([{ npi: "a", distance_miles: 0 }]);
    expect(result.degraded).toBe(true);
  });
});
