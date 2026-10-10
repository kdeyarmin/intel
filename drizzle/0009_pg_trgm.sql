-- Trigram matching for "contains" search on organization names. Managed
-- databases sometimes refuse CREATE EXTENSION; search then falls back to
-- prefix matching, so a refusal must not fail the migration. The index
-- itself is built at boot (server/lib/searchIndexes.ts), CONCURRENTLY.
DO $$
BEGIN
	CREATE EXTENSION IF NOT EXISTS pg_trgm;
EXCEPTION
	WHEN insufficient_privilege OR undefined_file OR feature_not_supported THEN
		RAISE NOTICE 'pg_trgm not available (%); organization search will use prefix matching', SQLERRM;
END $$;
