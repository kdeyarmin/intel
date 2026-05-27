-- One-time maintenance: remove EXISTING duplicate rows created by the old
-- blind-insert CMS importer / NPPES crawler (before the natural-key de-dup in
-- server/functions/cmsUpsert.ts + the crawler upsert fix).
--
-- This is intentionally NOT run automatically — it deletes data from very large
-- tables (medicare_facilities can be tens of millions of rows). Run it manually,
-- ideally during a maintenance window, after taking a backup. Each statement
-- keeps the lowest id per natural key and deletes the rest.
--
--   psql "$DATABASE_URL" -f scripts/dedupe-existing-imports.sql
--
-- Consider running one block at a time and checking row counts in between.
-- After de-duping you can optionally add the unique indexes at the bottom so the
-- database itself enforces uniqueness going forward.

\timing on

-- medicare_facilities: identity is (facility_type, provider_id) when a
-- provider_id exists, otherwise (facility_type, facility_name).
DELETE FROM medicare_facilities a
USING medicare_facilities b
WHERE a.id > b.id
  AND a.facility_type IS NOT DISTINCT FROM b.facility_type
  AND a.provider_id IS NOT NULL
  AND a.provider_id = b.provider_id;

DELETE FROM medicare_facilities a
USING medicare_facilities b
WHERE a.id > b.id
  AND a.facility_type IS NOT DISTINCT FROM b.facility_type
  AND a.provider_id IS NULL AND b.provider_id IS NULL
  AND a.facility_name IS NOT DISTINCT FROM b.facility_name;

-- cms_referrals: identity is (npi, data_year).
DELETE FROM cms_referrals a
USING cms_referrals b
WHERE a.id > b.id
  AND a.npi IS NOT DISTINCT FROM b.npi
  AND a.data_year IS NOT DISTINCT FROM b.data_year;

-- provider_service_utilization: identity is (npi, service_type, data_year).
DELETE FROM provider_service_utilization a
USING provider_service_utilization b
WHERE a.id > b.id
  AND a.npi IS NOT DISTINCT FROM b.npi
  AND a.service_type IS NOT DISTINCT FROM b.service_type
  AND a.data_year IS NOT DISTINCT FROM b.data_year;

-- provider_locations: identity is (npi, location_type, address_1, first 5 of zip).
DELETE FROM provider_locations a
USING provider_locations b
WHERE a.id > b.id
  AND a.npi IS NOT DISTINCT FROM b.npi
  AND a.location_type IS NOT DISTINCT FROM b.location_type
  AND lower(btrim(coalesce(a.address_1, ''))) = lower(btrim(coalesce(b.address_1, '')))
  AND left(coalesce(a.zip, ''), 5) = left(coalesce(b.zip, ''), 5);

-- provider_taxonomies: identity is (npi, taxonomy_code).
DELETE FROM provider_taxonomies a
USING provider_taxonomies b
WHERE a.id > b.id
  AND a.npi IS NOT DISTINCT FROM b.npi
  AND btrim(coalesce(a.taxonomy_code, '')) = btrim(coalesce(b.taxonomy_code, ''));

-- Optional: enforce uniqueness at the DB level after de-duping. Build these
-- CONCURRENTLY (outside a transaction) so they don't lock the tables for long.
-- They will fail if duplicates still remain, which is a useful safety check.
--
-- CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_cms_referrals_npi_year
--   ON cms_referrals (npi, data_year);
-- CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_psu_npi_service_year
--   ON provider_service_utilization (npi, service_type, data_year);
-- CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_prov_loc_natural
--   ON provider_locations (npi, location_type, left(coalesce(zip,''),5), md5(lower(btrim(coalesce(address_1,'')))));
-- CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_prov_tax_natural
--   ON provider_taxonomies (npi, taxonomy_code);
