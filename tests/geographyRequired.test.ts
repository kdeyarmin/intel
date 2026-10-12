/**
 * State licensing files carry ZIP codes, not counties: the Census geography places each home in a
 * county. Imported before it is loaded, every home would be stored with no county and vanish from
 * every county view until someone re-imported the file, so the import is refused instead.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ counties: 0, sets: [] as any[] }));

// The only write a refused request makes: failing the batch a client created first.
vi.mock("../server/db", () => ({
  db: { update: () => ({ set: (v: any) => { h.sets.push(v); return { where: () => Promise.resolve() }; } }) },
  pool: {},
}));
vi.mock("../server/lib/geo", () => ({
  getGeoIndex: async () => ({ counties: new Map(Array.from({ length: h.counties }, (_, i) => [String(i), {}])) }),
  zipToCounty: () => null,
}));

import { geographyProblem, handleTriggerImport } from "../server/functions/triggerImport";

beforeEach(() => { h.counties = 0; h.sets.length = 0; });

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
    // 412, not 409: the clients read every 409 as "this import is already running" and would hide the reason.
    await expect(handleTriggerImport(payload, { role: "admin" })).rejects.toMatchObject({ status: 412, message: expect.stringMatching(/geo:load/) });
    expect(h.sets).toEqual([]);
  });

  it("fails the batch a client created first (the Data Center wizard), with the reason, instead of leaving it validating", async () => {
    await expect(handleTriggerImport({ ...payload, batch_id: 41 }, { role: "admin" })).rejects.toMatchObject({ status: 412 });
    expect(h.sets).toHaveLength(1);
    expect(h.sets[0]).toMatchObject({ status: "failed", error_samples: [{ message: expect.stringMatching(/Census geography isn't loaded/) }] });
  });

  it("fails that batch for any refusal, such as a file import without its year", async () => {
    await expect(handleTriggerImport({ import_type: "licensed_facilities", file_url: "/api/storage/pa-homes.csv", batch_id: 41 }, { role: "admin" })).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/year is required/) });
    expect(h.sets[0]).toMatchObject({ status: "failed", error_samples: [{ message: expect.stringMatching(/year is required/) }] });
  });

  it("changes no batch for someone who isn't an admin", async () => {
    await expect(handleTriggerImport({ ...payload, batch_id: 41 }, { role: "user" })).rejects.toMatchObject({ status: 403 });
    expect(h.sets).toEqual([]);
  });
});
