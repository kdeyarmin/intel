/**
 * State licensing files carry ZIP codes, not counties: the Census geography places each home in a
 * county. Imported before it is loaded, every home would be stored with no county and vanish from
 * every county view until someone re-imported the file, so the import is refused instead.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ counties: 0 }));

vi.mock("../server/db", () => ({ db: {}, pool: {} }));
vi.mock("../server/lib/geo", () => ({
  getGeoIndex: async () => ({ counties: new Map(Array.from({ length: h.counties }, (_, i) => [String(i), {}])) }),
  zipToCounty: () => null,
}));

import { geographyProblem, handleTriggerImport } from "../server/functions/triggerImport";

beforeEach(() => { h.counties = 0; });

describe("geographyProblem", () => {
  it("says the geography must load first, for a dataset that places ZIP codes in counties", async () => {
    expect(await geographyProblem("licensed_facilities")).toMatch(/Census geography isn't loaded/);
    h.counties = 3143;
    expect(await geographyProblem("licensed_facilities")).toBeNull();
  });

  it("has nothing to say about datasets that don't need it", async () => {
    expect(await geographyProblem("hospital_service_area")).toBeNull();
    expect(await geographyProblem("cms_order_referring")).toBeNull();
  });
});

describe("handleTriggerImport", () => {
  const payload = { import_type: "licensed_facilities", file_url: "/api/storage/pa-homes.csv", year: 2026 };

  it("refuses a licensed facilities import before the geography is loaded, without starting a batch", async () => {
    await expect(handleTriggerImport(payload, { role: "admin" })).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/geo:load/) });
  });
});
