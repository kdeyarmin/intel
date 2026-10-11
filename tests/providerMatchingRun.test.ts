import { describe, it, expect, vi, beforeEach } from "vitest";

const { client } = vi.hoisted(() => ({ client: { query: vi.fn(), release: vi.fn() } }));
vi.mock("../server/db", () => ({ pool: { connect: async () => client } }));

import { handleMatchProvidersToLocations } from "../server/functions/providerMatching";

const NPI = "1234567893";
const HOSPITAL = "hospital_general_info";
// Facility A is at the provider's own address, so it would rank first.
const fac = (id: number, provider_id: string, name: string) =>
  ({ id, facility_type: HOSPITAL, provider_id, facility_name: name, address: name === "A" ? "1 Main St" : `${id} Elm St`, city: "Pittsburgh", zip: "15222" });

let lockFree = true;
let inserted: unknown[] = [];

beforeEach(() => {
  lockFree = true;
  inserted = [];
  client.query.mockReset();
  client.query.mockImplementation(async (sql: string, params: unknown[] = []) => {
    if (sql.includes("pg_try_advisory_lock")) return { rows: [{ ok: lockFree }] };
    if (sql.includes("FROM provider_locations")) return { rows: [{ npi: NPI, address_1: "1 Main St", city: "Pittsburgh", zip: "15222" }] };
    if (sql.includes("FROM providers")) return { rows: [{ npi: NPI, entity_type: "Individual", first_name: "Ann", last_name: "Lee" }] };
    if (sql.includes("FROM cms_referrals")) {
      return { rows: [["1111111111", 900], ["2222222222", 500], ["3333333333", 200], ["4444444444", 50]]
        .map(([to, n]) => ({ npi: NPI, referred_to_npi: to, total_referrals: n })) };
    }
    // Facility A appears twice: this year's row (40) and last year's (10).
    if (sql.includes("WHERE facility_type = ANY")) {
      return { rows: [fac(40, "1111111111", "A"), fac(30, "2222222222", "B"), fac(20, "3333333333", "C"), fac(15, "4444444444", "D"), fac(10, "1111111111", "A")] };
    }
    if (sql.includes("status <> 'suggested'")) return { rows: [{ npi: NPI, facility_id: 10 }] }; // A was rejected last year
    if (sql.includes("FROM medicare_facilities WHERE id = ANY")) return { rows: [fac(10, "1111111111", "A")] };
    if (sql.includes("INSERT INTO provider_location_matches")) inserted = params;
    return { rows: [] };
  });
});

describe("matchProvidersToLocations", () => {
  it("skips a reviewed facility by identity, not row id, and suggests the next best instead", async () => {
    const out = await handleMatchProvidersToLocations({ state: "PA", facility_types: ["hospital"] });
    expect(out).toMatchObject({ success: true, suggestions_created: 3 });
    const facilityIds = inserted.filter((_, i) => i % 11 === 1);
    expect([...facilityIds].sort()).toEqual([15, 20, 30]); // B, C, D; never A again
  });

  it("refuses to start while another run holds the lock", async () => {
    lockFree = false;
    const out = await handleMatchProvidersToLocations({ state: "PA", facility_types: ["hospital"] });
    expect(out).toMatchObject({ success: false, error: expect.stringMatching(/already|in progress/) });
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes("DELETE"))).toBe(false);
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes("pg_advisory_unlock"))).toBe(false);
    expect(client.release).toHaveBeenCalled();
  });

  it("releases the lock when it finishes", async () => {
    await handleMatchProvidersToLocations({ state: "PA", facility_types: ["hospital"] });
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes("pg_advisory_unlock"))).toBe(true);
  });
});
