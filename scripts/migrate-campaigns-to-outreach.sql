-- Migrate legacy `campaigns` rows into the unified `outreach_campaigns` table.
--
-- Background: the app previously shipped two disconnected campaign systems —
--   * `campaigns`           (the old "Campaigns" page / Campaign entity), and
--   * `outreach_campaigns`  (the "Outreach" page + the Intelligence launcher).
-- A campaign created in one was invisible in the other. The UI is now unified
-- onto `outreach_campaigns`, so this script copies any pre-existing `campaigns`
-- rows across so they remain visible in the merged page.
--
-- Idempotent: re-running skips rows already copied (matched on the legacy id
-- stashed under metrics._legacy.legacy_id).
--
-- Non-destructive: it does NOT drop the legacy `campaigns` table. After you have
-- verified the migrated campaigns look correct in the app, run the gated drop
-- script (which is just `DROP TABLE IF EXISTS campaigns;`):
--     psql "$DATABASE_URL" -f scripts/drop-legacy-campaigns.sql

INSERT INTO outreach_campaigns
  (name, description, status, campaign_type, metrics, created_date, updated_date)
SELECT
  c.name,
  c.description,
  c.status,
  c.type AS campaign_type,
  jsonb_build_object(
    '_legacy', jsonb_build_object(
      'source', 'campaigns',
      'legacy_id', c.id,
      'target_audience', c.target_audience,
      'settings', c.settings
    )
  ) AS metrics,
  COALESCE(c.created_date, now()),
  COALESCE(c.updated_date, now())
FROM campaigns c
WHERE NOT EXISTS (
  SELECT 1 FROM outreach_campaigns oc
  WHERE oc.metrics #>> '{_legacy,legacy_id}' = c.id::text
);
