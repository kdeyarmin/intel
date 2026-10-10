import { describe, it, expect } from "vitest";
import { addressScore, nameScore, proximityScore, scoreProviderMatches, specialtyFit, streetTokens, type MatchFacility, type MatchProvider } from "../server/lib/matching";

const cardiologist: MatchProvider = {
  npi: "1990000001", name: "Ann Heart, MD", isOrganization: false, taxonomy: "Cardiovascular Disease",
  address: "200 Lothrop Street, Suite 4", city: "Pittsburgh", zip: "15213-2582",
};
const hospital: MatchFacility = { id: 1, group: "hospital", provider_id: "390164", name: "UPMC Presbyterian", address: "200 LOTHROP ST", city: "PITTSBURGH", zip: "15213" };
const snfAcrossTown: MatchFacility = { id: 2, group: "snf", provider_id: "395001", name: "Oak Manor", address: "9 Elm Rd", city: "Pittsburgh", zip: "15237" };
const farAway: MatchFacility = { id: 3, group: "hospital", provider_id: "390001", name: "Erie Hospital", address: "1 Lake Dr", city: "Erie", zip: "16501" };

describe("matching scores", () => {
  it("normalises street names", () => {
    expect(streetTokens("200 Lothrop Street, Suite 4")).toEqual(["200", "lothrop", "st", "4"]);
  });

  it("scores the same street address highly", () => {
    expect(addressScore(cardiologist, hospital)).toBeGreaterThanOrEqual(60);
    expect(addressScore(cardiologist, snfAcrossTown)).toBe(0);
  });

  it("uses ZIP and city for proximity (there are no coordinates)", () => {
    expect(proximityScore(cardiologist, hospital)).toBe(100);
    expect(proximityScore(cardiologist, snfAcrossTown)).toBe(70);
    expect(proximityScore(cardiologist, farAway)).toBe(0);
  });

  it("fits specialties to facility types", () => {
    expect(specialtyFit("Cardiovascular Disease", "hospital")).toBe(100);
    expect(specialtyFit("Hospice and Palliative Medicine", "hospice")).toBe(100);
    expect(specialtyFit("Cardiovascular Disease", "hospice")).toBe(0);
    expect(specialtyFit(null, "hospital")).toBe(0);
  });

  it("compares organization names only for organizations", () => {
    expect(nameScore(cardiologist, hospital)).toBeUndefined();
    expect(nameScore({ ...cardiologist, isOrganization: true, name: "UPMC Presbyterian Hospital" }, hospital)).toBe(100);
  });
});

describe("scoreProviderMatches", () => {
  it("keeps the best nearby facilities with reasons, and skips distant ones", () => {
    const matches = scoreProviderMatches(cardiologist, [farAway, snfAcrossTown, hospital], () => 0);
    expect(matches.map((m) => m.facility_id)).toEqual([1]);
    expect(matches[0]).toMatchObject({ npi: "1990000001", provider_name: "Ann Heart, MD", proximity_score: 100, specialization_score: 100 });
    expect(matches[0].confidence_score).toBeGreaterThanOrEqual(70);
    expect(matches[0].match_reasons).toEqual(expect.arrayContaining(["Same ZIP code", "Practice address matches the facility's address"]));
    expect(matches[0].location_display).toBe("UPMC Presbyterian · 200 LOTHROP ST, PITTSBURGH · Hospital");
  });

  it("treats a referral tie as strong evidence", () => {
    const geriatrician = { ...cardiologist, taxonomy: "Internal Medicine, Geriatric Medicine", address: "1 Other Way" };
    const withoutReferral = scoreProviderMatches(geriatrician, [{ ...snfAcrossTown, provider_id: "1234567893" }], () => 0);
    const withReferral = scoreProviderMatches(geriatrician, [{ ...snfAcrossTown, provider_id: "1234567893" }], () => 40);
    expect(withReferral[0].confidence_score).toBeGreaterThanOrEqual(60);
    expect(withReferral[0].referral_score).toBeGreaterThan(50);
    expect(withReferral[0].match_reasons).toContain("Sent 40 referrals to this facility");
    expect(withoutReferral[0]?.confidence_score ?? 0).toBeLessThan(withReferral[0].confidence_score);
  });

  it("keeps at most three per provider", () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ ...hospital, id: 10 + i }));
    expect(scoreProviderMatches(cardiologist, many, () => 0)).toHaveLength(3);
  });
});
