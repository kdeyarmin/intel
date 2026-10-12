import { describe, it, expect } from "vitest";
import { mapSharedPatientPatternRow, sharedPatientWindowDays } from "../server/functions/triggerImport";

// A representative directed edge from the CMS "Physician Shared Patient
// Patterns" dataset: two providers, the count of shared encounters, and the
// count of shared beneficiaries.
const ROW = {
  npi_1: "1234567890",
  npi_2: "9876543210",
  transaction_count: "42",
  bene_count: "30",
};

describe("mapSharedPatientPatternRow", () => {
  it("maps the provider pair into npi -> referred_to_npi", () => {
    const m = mapSharedPatientPatternRow(ROW, 2015, 7);
    expect(m.npi).toBe("1234567890");
    expect(m.referred_to_npi).toBe("9876543210");
  });

  it("populates total_referrals + total_beneficiaries the consumers read", () => {
    const m = mapSharedPatientPatternRow(ROW, 2015, 7);
    expect(m.total_referrals).toBe(42); // encounter/transaction count
    expect(m.total_beneficiaries).toBe(30);
    expect(m.data_year).toBe("2015");
    expect(m.import_batch_id).toBe("7");
    expect(m.raw_data).toBe(ROW);
  });

  it("falls back to the shared-beneficiary count when no encounter count is published", () => {
    // PSPP files that only publish a single shared-patient count must still
    // populate total_referrals, since consumers ORDER BY total_referrals.
    const m = mapSharedPatientPatternRow(
      { npi_1: "1", npi_2: "2", patient_count: "15" },
      2014,
      1,
    );
    expect(m.total_referrals).toBe(15);
    expect(m.total_beneficiaries).toBe(15);
  });

  it("tolerates from_npi/to_npi + pair_count aliases", () => {
    const m = mapSharedPatientPatternRow(
      { from_npi: "111", to_npi: "222", pair_count: "7" },
      2013,
      1,
    );
    expect(m.npi).toBe("111");
    expect(m.referred_to_npi).toBe("222");
    expect(m.total_referrals).toBe(7);
    expect(m.total_beneficiaries).toBeNull();
  });

  it("parses numeric strings containing separators", () => {
    const m = mapSharedPatientPatternRow(
      { npi_1: "1", npi_2: "2", count: "1,234" },
      2015,
      1,
    );
    expect(m.total_referrals).toBe(1234);
  });

  it("returns null NPIs when fields are absent (so the importer can filter them)", () => {
    const m = mapSharedPatientPatternRow({ count: "5" }, 2015, 1);
    expect(m.npi).toBeNull();
    expect(m.referred_to_npi).toBeNull();
  });

  it("always sets referred_to_name to null (not sourced from PSPP data)", () => {
    const m = mapSharedPatientPatternRow(ROW, 2015, 7);
    expect(m.referred_to_name).toBeNull();
  });

  it("stores the full original row in raw_data", () => {
    const row = { npi_1: "A", npi_2: "B", transaction_count: "3", bene_count: "2" };
    const m = mapSharedPatientPatternRow(row, 2020, 99);
    expect(m.raw_data).toBe(row);
  });

  it("truncates NPI values longer than 20 characters", () => {
    const m = mapSharedPatientPatternRow(
      { npi_1: "12345678901234567890EXTRA", npi_2: "B", count: "1" },
      2020,
      1,
    );
    expect(m.npi).toBe("12345678901234567890");
    expect(m.npi!.length).toBeLessThanOrEqual(20);
  });

  it("accepts uppercase NPI_1 / NPI_2 column names (header variant)", () => {
    const m = mapSharedPatientPatternRow(
      { NPI_1: "1111111111", NPI_2: "2222222222", TRANSACTION_COUNT: "5" },
      2016,
      1,
    );
    expect(m.npi).toBe("1111111111");
    expect(m.referred_to_npi).toBe("2222222222");
    expect(m.total_referrals).toBe(5);
  });

  it("returns null total_referrals and total_beneficiaries when no count field is present", () => {
    const m = mapSharedPatientPatternRow({ npi_1: "A", npi_2: "B" }, 2015, 1);
    expect(m.total_referrals).toBeNull();
    expect(m.total_beneficiaries).toBeNull();
  });

  it("accepts referring_npi / paired_npi aliases", () => {
    const m = mapSharedPatientPatternRow(
      { referring_npi: "3333333333", paired_npi: "4444444444", referral_count: "10" },
      2017,
      1,
    );
    expect(m.npi).toBe("3333333333");
    expect(m.referred_to_npi).toBe("4444444444");
    expect(m.total_referrals).toBe(10);
  });

  it("handles a zero count (genuinely zero shared patients is a valid row)", () => {
    const m = mapSharedPatientPatternRow(
      { npi_1: "1", npi_2: "2", transaction_count: "0" },
      2015,
      1,
    );
    // toIntOrNull returns 0 for "0" since parseInt("0") === 0 which is finite
    expect(m.total_referrals).toBe(0);
  });

  it("reads the official CMS FOIA columns, including space-padded counts", () => {
    const row = { npi1: "1003000126", npi2: "1093886657", paircount: "354", benecount: "48", samedaycount: "13" };
    const m = mapSharedPatientPatternRow(row, 2015, 1, 30);
    expect(m.npi).toBe("1003000126");
    expect(m.referred_to_npi).toBe("1093886657");
    expect(m.total_referrals).toBe(354);
    expect(m.total_beneficiaries).toBe(48);
    expect(m.raw_data).toMatchObject({ ...row, same_day: 13, days: 30 });
  });

  it("parses space-padded FOIA counts", () => {
    const m = mapSharedPatientPatternRow(
      { npi1: "1000026017", npi2: "1598773715", paircount: "56        ", benecount: "23        ", samedaycount: "29" },
      2015,
      1,
    );
    expect(m.total_referrals).toBe(56);
    expect(m.total_beneficiaries).toBe(23);
    expect(m.raw_data.same_day).toBe(29);
  });

  it("takes the window from a days30/days180 file name, and ignores anything else", () => {
    expect(sharedPatientWindowDays("https://downloads.cms.gov/foia/physician-shared-patient-patterns-2015-days30.zip")).toBe(30);
    expect(sharedPatientWindowDays("/api/storage/physician-shared-patient-patterns-2014-days180.txt")).toBe(180);
    expect(sharedPatientWindowDays("2015_90_csv.zip")).toBe(90);
    expect(sharedPatientWindowDays("/api/storage/pairs.csv")).toBeNull();
    expect(sharedPatientWindowDays("days15.txt")).toBeNull();
  });

  it("produces string data_year and string import_batch_id regardless of numeric input", () => {
    const m = mapSharedPatientPatternRow(ROW, 2019, 42);
    expect(typeof m.data_year).toBe("string");
    expect(typeof m.import_batch_id).toBe("string");
    expect(m.data_year).toBe("2019");
    expect(m.import_batch_id).toBe("42");
  });
});
