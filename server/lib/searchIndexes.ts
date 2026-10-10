// Index expressions shared by the search query builders and the boot index
// list. A query only uses an expression index when it repeats the expression
// exactly, so both sides import these constants.

export const SEARCH_EXPR = {
  lastName: "lower(last_name)",
  firstName: "lower(first_name)",
  orgName: "lower(organization_name)",
  zip5: "left(zip, 5)",
  cityUpper: "upper(city)",
} as const;

export const SEARCH_INDEX_NAMES = {
  lastName: "idx_providers_last_name_lower",
  orgPrefix: "idx_providers_org_name_lower",
  orgTrigram: "idx_providers_org_name_trgm",
  zip5: "idx_provloc_zip5",
  stateCity: "idx_provloc_state_city",
  primaryTaxonomy: "idx_provtax_primary_code",
} as const;

const N = SEARCH_INDEX_NAMES;
const E = SEARCH_EXPR;

export const SEARCH_INDEXES: string[] = [
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS ${N.lastName} ON providers (${E.lastName} text_pattern_ops) WHERE last_name IS NOT NULL`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS ${N.orgPrefix} ON providers (${E.orgName} text_pattern_ops) WHERE organization_name IS NOT NULL`,
  // "Contains" search on organization names (needs pg_trgm).
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS ${N.orgTrigram} ON providers USING gin (${E.orgName} gin_trgm_ops) WHERE organization_name IS NOT NULL`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS ${N.zip5} ON provider_locations (${E.zip5})`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS ${N.stateCity} ON provider_locations (state, ${E.cityUpper} text_pattern_ops)`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS ${N.primaryTaxonomy} ON provider_taxonomies (taxonomy_code varchar_pattern_ops, npi) WHERE is_primary = true`,
];
