/**
 * The hospice index note (server/lib/referralIndex.ts) matches the weights in the referral_sources rollup.
 * The formulas are written so they are not the referral index's "ELSE round(" (that split is owned by
 * tests/referralIndexNote.test.ts).
 */
import { describe, expect, it } from "vitest";
import { hospiceIndexNote } from "../server/lib/referralIndex";
import { MARKET_JOBS } from "../server/lib/rollups/market";

const sql = MARKET_JOBS.find((j) => j.name === "referral_sources")!.sql;

describe("the hospice index note", () => {
  it("describes the formula used once the certification file is imported", () => {
    expect(sql).toContain("35 * s.hospice_fit");
    expect(sql).toContain("25 * least(COALESCE((SELECT avg(v) FROM (VALUES (s.cc_alzheimer_pct), (s.cc_chf_pct), (s.cc_copd_pct)) AS t(v) WHERE v IS NOT NULL), 0) / 0.25, 1)");
    expect(sql).toContain("15 * least(COALESCE(s.avg_risk_score, 0) / 2.5, 1)");
    expect(sql).toContain("15 * s.hospice_fit * least(COALESCE(s.benes, 0) / 400.0, 1)");
    expect(sql).toContain("4 + 6 * least(s.hospice_oversight_benes / 20.0, 1)");
    const note = hospiceIndexNote(true);
    expect(note).toMatch(/specialty fit up to 35/);
    expect(note).toMatch(/full at 25%/);
    expect(note).toMatch(/full at 2\.5/);
    expect(note).toMatch(/full at 400 patients/);
    expect(note).toMatch(/up to 10 for hospice care-plan oversight/);
    expect(note).toMatch(/few hundred/);
  });

  it("describes the formula used before that file is imported, without eligibility or the oversight count", () => {
    expect(sql).toContain("40 * s.hospice_fit");
    expect(sql).toContain("20 * least(COALESCE(s.avg_risk_score, 0) / 2.5, 1)");
    const unloaded = sql.slice(sql.indexOf("(round(40 * s.hospice_fit"));
    expect(unloaded.slice(0, unloaded.indexOf(")::int)"))).not.toMatch(/hospice_eligible|oversight/);
    const note = hospiceIndexNote(false);
    expect(note).toMatch(/specialty fit up to 40/);
    expect(note).toMatch(/not in the index yet/);
    expect(note).toMatch(/raw volume, or ordering eligibility/);
  });

  it("adds up to 100 either way, and ranks hospice separately from the referral index", () => {
    expect(35 + 25 + 15 + 15 + 10).toBe(100);
    expect(40 + 25 + 20 + 15).toBe(100);
    expect(sql).toContain("ORDER BY hospice_index DESC, benes DESC, npi");
    expect(sql).toMatch(/ELSE\s+\(round\(40 \* s\.hospice_fit/);
  });
});
