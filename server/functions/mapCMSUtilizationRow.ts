// Maps a raw row from the CMS "Physician & Other Practitioners - by Provider
// and Service" dataset into the shape stored in `provider_service_utilization`.
//
// Kept free of DB/Drizzle imports so it can be unit-tested directly.

export type CMSUtilizationRow = {
  npi: string | null;
  service_type: string | null;
  total_services: unknown;
  total_unique_benes: unknown;
  average_submitted_chrg_amt: unknown;
  total_medicare_payment_amt: unknown;
  data_year: string;
  raw_data: Record<string, unknown>;
};

export function mapCMSUtilizationRow(
  row: any,
  year: number,
  _batchId: number,
): CMSUtilizationRow {
  return {
    npi: row.Rndrng_NPI || row.npi || null,
    service_type: row.Rndrng_Prvdr_Type || row.HCPCS_Desc || null,
    total_services: row.Tot_Srvcs || null,
    total_unique_benes: row.Tot_Benes || null,
    average_submitted_chrg_amt: row.Avg_Sbmtd_Chrg || null,
    total_medicare_payment_amt: row.Avg_Mdcr_Pymt_Amt || null,
    data_year: String(year),
    raw_data: row,
  };
}
