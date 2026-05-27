-- OPTIONAL, operator-run migration: give CMS numeric columns real numeric types.
--
-- The utilization/spend columns in cms_utilization and provider_service_utilization
-- are stored as varchar, so every aggregation must cast and any non-numeric junk
-- silently breaks SUM/AVG. This converts them to numeric. It is NOT run
-- automatically because:
--   * ALTER TYPE rewrites the whole table and takes a heavy lock,
--   * a bad value would otherwise abort the migration.
-- The USING clause coerces unparseable values to NULL so the migration can't fail
-- on dirty data. Run during a maintenance window, after a backup:
--
--   psql "$DATABASE_URL" -f scripts/optional-numeric-typing.sql
--
-- Safe to run incrementally (one ALTER at a time). After converting, update the
-- Drizzle schema columns to numeric and the mappers to insert numbers.

\timing on

-- Reusable cast: keep digits, sign and a single decimal point; NULL if nothing
-- numeric remains (e.g. "*", "N/A", "Not Available").
CREATE OR REPLACE FUNCTION _to_numeric_or_null(txt text) RETURNS numeric AS $$
  SELECT CASE
    WHEN txt IS NULL THEN NULL
    WHEN regexp_replace(txt, '[^0-9.\-]', '', 'g') ~ '^-?[0-9]+(\.[0-9]+)?$'
      THEN regexp_replace(txt, '[^0-9.\-]', '', 'g')::numeric
    ELSE NULL
  END;
$$ LANGUAGE sql IMMUTABLE;

-- provider_service_utilization
ALTER TABLE provider_service_utilization
  ALTER COLUMN total_services TYPE numeric USING _to_numeric_or_null(total_services),
  ALTER COLUMN total_unique_benes TYPE numeric USING _to_numeric_or_null(total_unique_benes),
  ALTER COLUMN average_submitted_chrg_amt TYPE numeric USING _to_numeric_or_null(average_submitted_chrg_amt),
  ALTER COLUMN total_medicare_payment_amt TYPE numeric USING _to_numeric_or_null(total_medicare_payment_amt);

-- cms_utilization
ALTER TABLE cms_utilization
  ALTER COLUMN total_services TYPE numeric USING _to_numeric_or_null(total_services),
  ALTER COLUMN total_unique_benes TYPE numeric USING _to_numeric_or_null(total_unique_benes),
  ALTER COLUMN total_submitted_chrg_amt TYPE numeric USING _to_numeric_or_null(total_submitted_chrg_amt),
  ALTER COLUMN total_medicare_allowed_amt TYPE numeric USING _to_numeric_or_null(total_medicare_allowed_amt),
  ALTER COLUMN total_medicare_payment_amt TYPE numeric USING _to_numeric_or_null(total_medicare_payment_amt),
  ALTER COLUMN average_submitted_chrg_amt TYPE numeric USING _to_numeric_or_null(average_submitted_chrg_amt),
  ALTER COLUMN average_medicare_allowed_amt TYPE numeric USING _to_numeric_or_null(average_medicare_allowed_amt),
  ALTER COLUMN average_medicare_payment_amt TYPE numeric USING _to_numeric_or_null(average_medicare_payment_amt);

DROP FUNCTION IF EXISTS _to_numeric_or_null(text);

-- Storage note: every medicare_facilities / utilization row also keeps the full
-- source payload in raw_data (jsonb). That is relied on by the FacilityDetail
-- page (it renders all raw_data columns), so it is intentionally NOT dropped
-- here. If storage becomes a problem, consider moving raw_data to a side table
-- keyed by row id and joining only on the detail view, rather than deleting it.
