-- NUCC Health Care Provider Taxonomy code set, loaded from the bundle in
-- server/data/nucc at boot (server/lib/nucc/load.ts). Gives the NPPES file
-- importer descriptions for codes and the UI a reference for specialties.
-- The loaded version is recorded in geo_meta under key 'nucc'.
CREATE TABLE IF NOT EXISTS "nucc_taxonomies" (
	"code" varchar(10) PRIMARY KEY NOT NULL,
	"grouping" text,
	"classification" text,
	"specialization" text,
	"display_name" text,
	"section" varchar(20),
	"definition" text,
	"version" varchar(10)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "nucc_taxonomies_grouping_idx" ON "nucc_taxonomies" ("grouping");
