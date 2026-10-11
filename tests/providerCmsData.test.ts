/**
 * getProviderCMSData hands the provider page its CMS-derived extras: Order &
 * Referring eligibility and the clinician's referral potential (the market
 * rollup row). The page and the assistant read `referral_potential`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ rows: {} as Record<string, any[]> }));

vi.mock("../server/db", async () => {
  const { getTableName } = await import("drizzle-orm");
  // A drizzle select builder that resolves to the rows registered for the table it reads.
  const query = (table: string) => {
    const b: any = {
      leftJoin: () => b, where: () => b, orderBy: () => b, limit: () => b,
      then: (res: any, rej: any) => Promise.resolve(h.rows[table] ?? []).then(res, rej),
      catch: (rej: any) => Promise.resolve(h.rows[table] ?? []).catch(rej),
    };
    return b;
  };
  return { pool: {}, db: { select: () => ({ from: (t: any) => query(getTableName(t)) }) } };
});
vi.mock("../server/lib/geo", () => ({
  getGeoIndex: async () => ({ counties: new Map([["42003", { fips: "42003", name: "Allegheny County", state: "PA" }]]) }),
}));

import { handleGetProviderCMSData } from "../server/functions/facilityDetail";

beforeEach(() => {
  h.rows = {};
});

describe("handleGetProviderCMSData", () => {
  it("returns the clinician's referral potential, with the county named", async () => {
    h.rows.rollup_referral_sources = [{ npi: "1000000001", data_year: "2024", county_fips: "42003", referral_index: 96, rank_in_county: 1, benes: 620, cc_alzheimer_pct: 0.12 }];
    h.rows.cms_order_referring = [{ partb: true, dme: false, hha: true, pmd: false, hospice: true, as_of: "2026-10-03" }];
    const r: any = await handleGetProviderCMSData({ npi: "1000000001" });
    expect(r.referral_potential).toMatchObject({ npi: "1000000001", referral_index: 96, rank_in_county: 1, county_name: "Allegheny County", cc_alzheimer_pct: 0.12 });
    expect(r.order_referring).toMatchObject({ hha: true, hospice: true, as_of: "2026-10-03" });
  });

  it("returns null for a clinician the rollup doesn't cover", async () => {
    const r: any = await handleGetProviderCMSData({ npi: "1000000009" });
    expect(r.referral_potential).toBeNull();
    expect(r.order_referring).toBeNull();
    expect(r.total_records).toBe(0);
  });

  it("requires an NPI", async () => {
    expect(await handleGetProviderCMSData({})).toEqual({ error: "npi is required" });
  });
});
