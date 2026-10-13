import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildGeoIndex } from "../server/lib/geo";

const mocks = vi.hoisted(() => ({ query: vi.fn(), getGeoIndex: vi.fn() }));
vi.mock("../server/db", () => ({
  db: {},
  pool: { connect: async () => ({ query: mocks.query, release: () => {} }) },
}));
vi.mock("../server/lib/geo", async (importOriginal) => ({
  ...await importOriginal<typeof import("../server/lib/geo")>(),
  getGeoIndex: mocks.getGeoIndex,
}));
import { handleListFacilities } from "../server/functions/facilityDetail";

beforeEach(() => {
  mocks.query.mockReset().mockImplementation(async (text: string) => {
    if (/^\s*(SET|RESET)/.test(text)) return { rows: [] };
    if (/SELECT count/.test(text)) return { rows: [{ count: 1 }] };
    if (/SELECT state/.test(text)) return { rows: [{ state: "MA", count: 1 }] };
    return { rows: [{ provider_id: "1", facility_key: "1", facility_name: "Nearby", zip: "01001-1234" }] };
  });
  mocks.getGeoIndex.mockResolvedValue(buildGeoIndex({
    counties: [],
    zctas: [
      { zcta: "01001", lat: 0, lng: 0, primary_county_fips: null, state: "MA" },
      { zcta: "01002", lat: 0.2, lng: 0, primary_county_fips: null, state: "MA" },
    ],
    zctaCounties: [],
  }));
});

describe("facility radius search", () => {
  it.each(["hospital", "licensed"])("filters %s rows and counts before pagination, preserving search and state", async (facility_group) => {
    const result = await handleListFacilities({
      facility_group, state: "MA", search: "Nearby", page: 2, limit: 1, radius_zip: "01001", radius_miles: 5,
    });
    expect(result.facilities[0].distance_miles).toBe(0);
    const listing = mocks.query.mock.calls.find(([text]) => text.includes("LIMIT") && !text.startsWith("SELECT state"))!;
    expect(listing[0]).toContain(facility_group === "licensed" ? "zip5 = ANY($3)" : "left(m.zip, 5) = ANY($4)");
    expect(listing[1]).toContain("MA");
    expect(listing[1]).toContain("%Nearby%");
    expect(listing[1]).toContainEqual(["01001"]);
    expect(listing[1].slice(-2)).toEqual([1, 1]);
    const count = mocks.query.mock.calls.find(([text]) => text.includes("SELECT count"))!;
    expect(count[0]).toContain("ANY(");
    expect(count[1]).toContainEqual(["01001"]);
  });

  it("separates cached counts by radius", async () => {
    mocks.query.mockImplementation(async (text: string, values: any[]) => {
      if (/SELECT count/.test(text)) return { rows: [{ count: values.at(-1).length }] };
      return { rows: [] };
    });
    const narrow = await handleListFacilities({ facility_group: "hospice", radius_zip: "01001", radius_miles: 5 });
    const wide = await handleListFacilities({ facility_group: "hospice", radius_zip: "01001", radius_miles: 50 });
    expect(narrow.total).toBe(1);
    expect(wide.total).toBe(2);
    expect(mocks.query.mock.calls.filter(([text]) => /SELECT count/.test(text))).toHaveLength(2);
  });

  it("rejects a ZIP with no centroid before reading facility rows", async () => {
    await expect(handleListFacilities({ facility_group: "snf", radius_zip: "99999", radius_miles: 25 })).rejects.toMatchObject({ status: 400 });
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("keeps a zero count when a shared URL points beyond the last page", async () => {
    mocks.query.mockImplementation(async (text: string) => ({
      rows: /SELECT count/.test(text) ? [{ count: 0 }] : [],
    }));
    const result = await handleListFacilities({ facility_group: "snf", page: 4, radius_zip: "01001", radius_miles: 10 });
    expect(result.total).toBe(0);
    expect(result.facilities).toEqual([]);
  });
});
