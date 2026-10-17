export type HudCrosswalkRow = {
  zip5: string;
  county_fips: string;
  residential_ratio: number | null;
  total_ratio: number | null;
};

function better(candidate: HudCrosswalkRow, current: HudCrosswalkRow): boolean {
  const residential = (candidate.residential_ratio ?? -1) - (current.residential_ratio ?? -1);
  if (residential !== 0) return residential > 0;
  const total = (candidate.total_ratio ?? -1) - (current.total_ratio ?? -1);
  if (total !== 0) return total > 0;
  return candidate.county_fips < current.county_fips;
}

/**
 * One county per ZIP: the county with the highest residential share.
 * A ZIP that the crosswalk splits is not counted in two counties.
 */
export function assignZipCounties(rows: HudCrosswalkRow[]): { zip5: string; county_fips: string }[] {
  const best = new Map<string, HudCrosswalkRow>();
  for (const row of rows) {
    const current = best.get(row.zip5);
    if (!current || better(row, current)) best.set(row.zip5, row);
  }
  return [...best.values()]
    .map((row) => ({ zip5: row.zip5, county_fips: row.county_fips }))
    .sort((a, b) => a.zip5.localeCompare(b.zip5));
}

/**
 * Service-area rollup county assignment. When the HUD crosswalk has any rows,
 * each ZIP goes to its highest residential-ratio county. Otherwise the Census
 * ZCTA primary county is used, so an empty crosswalk leaves the old result.
 */
export const ZIP_COUNTY_ASSIGNMENT_SQL = `
hud_zip AS (
  SELECT DISTINCT ON (zip5) zip5, county_fips
    FROM hud_zip_county
   ORDER BY zip5, residential_ratio DESC NULLS LAST, total_ratio DESC NULLS LAST, county_fips
),
zip_county AS (
  SELECT h.zip5, h.county_fips
    FROM hud_zip h
   WHERE EXISTS (SELECT 1 FROM hud_zip_county)
  UNION ALL
  SELECT z.zcta, z.primary_county_fips
    FROM geo_zctas z
   WHERE NOT EXISTS (SELECT 1 FROM hud_zip_county)
     AND z.primary_county_fips IS NOT NULL
)`;
