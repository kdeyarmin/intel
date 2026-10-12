/**
 * The words that explain the referral index (server/lib/referralIndex.ts) match the weights in the rollup's SQL
 * (server/lib/rollups/market.ts): a number changed in one without the other would explain a score that is not the one shown.
 */
import { describe, expect, it } from "vitest";
import { referralIndexNote } from "../server/lib/referralIndex";
import { MARKET_JOBS } from "../server/lib/rollups/market";

const sql = MARKET_JOBS.find((j) => j.name === "referral_sources")!.sql;
// The two formulas: the first branch of the CASE (certifications loaded), then the ELSE.
const [withCertifications, without] = sql.split(/\bELSE round\(/).map((part, i) => (i === 0 ? part.slice(part.lastIndexOf("THEN round(")) : part.slice(0, part.indexOf("AS referral_index"))));
const numbers = (formula: string, re: RegExp) => [...formula.matchAll(re)].map((m) => Number(m[1]));

describe("the referral index note", () => {
  it("describes the formula used once the Home Health Certifications file is imported", () => {
    const note = referralIndexNote(true);
    expect(withCertifications).toContain("15 + 35 * least(ce.hh_cert_benes / 40.0, 1)");
    expect(withCertifications).toContain("20 * least(p.benes / 500.0, 1)");
    expect(withCertifications).toContain("15 * least(COALESCE(p.avg_risk_score, 0) / 2.5, 1)");
    expect(withCertifications).toContain("15 * ((COALESCE(o.hha, false)::int + COALESCE(o.hospice, false)::int) / 2.0)");
    expect(note).toMatch(/up to 50 points for patients certified for home health \(15 for being listed, the rest in proportion, full at 40 patients\)/);
    expect(note).toMatch(/20 for Medicare beneficiaries served \(full at 500\), 15 for average patient risk score \(full at 2\.5\), 15 for eligibility/);
  });

  it("describes the formula used before it", () => {
    const note = referralIndexNote(false);
    expect(numbers(without, /(\d+) \* least\(p\.benes/g)).toEqual([50]);
    expect(without).toContain("25 * least(COALESCE(p.avg_risk_score, 0) / 2.5, 1)");
    expect(without).toContain("25 * ((COALESCE(o.hha, false)::int");
    expect(note).toMatch(/50 points for Medicare beneficiaries served \(full at 500\), 25 for average patient risk score \(full at 2\.5\), 25 for eligibility/);
    expect(note).not.toMatch(/certified/);
  });

  it("adds up to 100 either way", () => {
    expect(50 + 20 + 15 + 15).toBe(100);
    expect(50 + 25 + 25).toBe(100);
  });
});
