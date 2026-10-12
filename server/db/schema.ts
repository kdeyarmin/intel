import { pgTable, text, integer, bigint, boolean, timestamp, date, jsonb, doublePrecision, serial, varchar, uuid, index, uniqueIndex, primaryKey, foreignKey, numeric } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  password_hash: text("password_hash").notNull(),
  full_name: varchar("full_name", { length: 255 }),
  role: varchar("role", { length: 50 }).default("user"),
  avatar_url: text("avatar_url"),
  // pending (signed up, awaiting approval) | invited (no password yet) | active | disabled.
  // The column default is "active" so existing accounts keep working; signup
  // inserts "pending" explicitly.
  status: varchar("status", { length: 20 }).notNull().default("active"),
  // Bumped to end every session for the account (password change, disable, revoke).
  token_version: integer("token_version").notNull().default(0),
  last_login_at: timestamp("last_login_at"),
  approved_at: timestamp("approved_at"),
  approved_by: varchar("approved_by", { length: 255 }),
  disabled_at: timestamp("disabled_at"),
  disabled_reason: text("disabled_reason"),
  password_changed_at: timestamp("password_changed_at"),
  // Platform admins run the data operations (imports, crawler, maintenance)
  // and see every organization; org owners administer their own.
  is_platform_admin: boolean("is_platform_admin").notNull().default(false),
  terms_accepted_at: timestamp("terms_accepted_at"),
  terms_version: varchar("terms_version", { length: 20 }),
  created_date: timestamp("created_date").defaultNow(),
  updated_date: timestamp("updated_date").defaultNow(),
}, (table) => [
  // Emails are matched case-insensitively (migration 0008 skips this if
  // existing rows differ only by case).
  uniqueIndex("users_email_lower_uq").on(sql`lower(${table.email})`),
]);

// AI Assistant (server/lib/assistant, migration 0012). Owner-only; not exposed via tableMap.
export const assistantConversations = pgTable("assistant_conversations", {
  org_id: integer("org_id"),
  id: serial("id").primaryKey(),
  user_id: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 200 }),
  created_at: timestamp("created_at").notNull().defaultNow(),
  updated_at: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("assistant_conversations_user_idx").on(table.user_id, table.updated_at),
]);

// One row per question: running | complete | interrupted | refused | error.
// Only complete turns are replayed to the model.
export const assistantTurns = pgTable("assistant_turns", {
  id: serial("id").primaryKey(),
  conversation_id: integer("conversation_id").notNull().references(() => assistantConversations.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 20 }).notNull().default("running"),
  error: text("error"),
  model: varchar("model", { length: 100 }),
  usage: jsonb("usage"),
  created_at: timestamp("created_at").notNull().defaultNow(),
  finished_at: timestamp("finished_at"),
}, (table) => [
  index("assistant_turns_conversation_idx").on(table.conversation_id),
]);

// API message content exactly as sent or received, in order (seq).
export const assistantMessages = pgTable("assistant_messages", {
  id: serial("id").primaryKey(),
  conversation_id: integer("conversation_id").notNull(),
  turn_id: integer("turn_id").notNull().references(() => assistantTurns.id, { onDelete: "cascade" }),
  seq: integer("seq").notNull(),
  role: varchar("role", { length: 10 }).notNull(),
  content: jsonb("content").notNull(),
  created_at: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("assistant_messages_conversation_seq_uq").on(table.conversation_id, table.seq),
  index("assistant_messages_turn_idx").on(table.turn_id),
  // Named explicitly: the generated name is longer than Postgres's 63-character limit.
  foreignKey({ name: "assistant_messages_conversation_id_fk", columns: [table.conversation_id], foreignColumns: [assistantConversations.id] }).onDelete("cascade"),
]);

// Writes the assistant proposed. Nothing happens until the owner confirms.
export const assistantActions = pgTable("assistant_actions", {
  org_id: integer("org_id"),
  id: varchar("id", { length: 36 }).primaryKey(),
  conversation_id: integer("conversation_id").notNull().references(() => assistantConversations.id, { onDelete: "cascade" }),
  turn_id: integer("turn_id").notNull().references(() => assistantTurns.id, { onDelete: "cascade" }),
  user_id: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tool_use_id: varchar("tool_use_id", { length: 100 }).notNull(),
  kind: varchar("kind", { length: 40 }).notNull(),
  payload: jsonb("payload").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("proposed"),
  result: jsonb("result"),
  expires_at: timestamp("expires_at").notNull(),
  decided_at: timestamp("decided_at"),
  reported_at: timestamp("reported_at"),
  created_at: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("assistant_actions_conversation_idx").on(table.conversation_id),
  index("assistant_actions_turn_idx").on(table.turn_id),
  index("assistant_actions_user_idx").on(table.user_id),
]);

export const assistantUsage = pgTable("assistant_usage", {
  org_id: integer("org_id"),
  user_id: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  day: date("day").notNull(),
  units: bigint("units", { mode: "number" }).notNull().default(0),
  requests: integer("requests").notNull().default(0),
}, (table) => [
  primaryKey({ columns: [table.user_id, table.day] }),
]);

// Background rollups (server/lib/rollups). Not exposed via tableMap.
export const rollupRuns = pgTable("rollup_runs", {
  job: varchar("job", { length: 64 }).primaryKey(),
  status: varchar("status", { length: 20 }).notNull().default("idle"),
  started_at: timestamp("started_at"),
  finished_at: timestamp("finished_at"),
  last_success_at: timestamp("last_success_at"),
  rows_scanned: bigint("rows_scanned", { mode: "number" }),
  rows_skipped: bigint("rows_skipped", { mode: "number" }),
  result_rows: integer("result_rows"),
  duration_ms: integer("duration_ms"),
  progress: jsonb("progress"),
  error: text("error"),
});

export const rollupZipLocations = pgTable("rollup_zip_locations", {
  zip5: varchar("zip5", { length: 5 }).primaryKey(),
  practice_locations: integer("practice_locations").notNull(),
  all_locations: integer("all_locations").notNull(),
});

export const rollupCmsServiceTypes = pgTable("rollup_cms_service_types", {
  data_year: varchar("data_year", { length: 10 }).notNull(),
  service_type: varchar("service_type", { length: 255 }).notNull(),
  provider_count: integer("provider_count").notNull(),
  total_services: doublePrecision("total_services").notNull(),
  total_payments: doublePrecision("total_payments").notNull(),
  total_beneficiaries: doublePrecision("total_beneficiaries").notNull(),
}, (table) => [
  primaryKey({ columns: [table.data_year, table.service_type] }),
]);

export const rollupCmsTopReferred = pgTable("rollup_cms_top_referred", {
  data_year: varchar("data_year", { length: 10 }).notNull(),
  referred_to_npi: varchar("referred_to_npi", { length: 10 }).notNull(),
  total_referrals: doublePrecision("total_referrals").notNull(),
  referring_providers: integer("referring_providers").notNull(),
}, (table) => [
  primaryKey({ columns: [table.data_year, table.referred_to_npi] }),
]);

export const rollupFacilityTypes = pgTable("rollup_facility_types", {
  facility_type: varchar("facility_type", { length: 100 }).primaryKey(),
  record_count: bigint("record_count", { mode: "number" }).notNull(),
  state_count: integer("state_count").notNull(),
  latest_year: varchar("latest_year", { length: 10 }),
});

// Market and patient-flow rollups (server/lib/rollups/market.ts).
export const rollupHospitalCatchment = pgTable("rollup_hospital_catchment", {
  ccn: varchar("ccn", { length: 10 }).notNull(),
  zip5: varchar("zip5", { length: 5 }).notNull(),
  data_year: varchar("data_year", { length: 10 }).notNull(),
  county_fips: varchar("county_fips", { length: 5 }),
  cases: integer("cases"),
  days: integer("days"),
  charges: doublePrecision("charges"),
  share_of_hospital: doublePrecision("share_of_hospital"),
}, (table) => [
  primaryKey({ columns: [table.ccn, table.zip5, table.data_year] }),
  index("idx_rollup_hosp_catch_county").on(table.county_fips, table.data_year),
]);

export const rollupCountyHospitalSources = pgTable("rollup_county_hospital_sources", {
  county_fips: varchar("county_fips", { length: 5 }).notNull(),
  ccn: varchar("ccn", { length: 10 }).notNull(),
  data_year: varchar("data_year", { length: 10 }).notNull(),
  cases: integer("cases"),
  days: integer("days"),
  share_of_county: doublePrecision("share_of_county"),
  rank: integer("rank"),
}, (table) => [
  primaryKey({ columns: [table.county_fips, table.ccn, table.data_year] }),
  index("idx_rollup_county_hosp_ccn").on(table.ccn, table.data_year),
]);

export const rollupHospitalDischargeMix = pgTable("rollup_hospital_discharge_mix", {
  ccn: varchar("ccn", { length: 10 }).notNull(),
  data_year: varchar("data_year", { length: 10 }).notNull(),
  facility_name: text("facility_name"),
  state: varchar("state", { length: 2 }),
  pct_snf: doublePrecision("pct_snf"),
  pct_hha: doublePrecision("pct_hha"),
  pct_hospice: doublePrecision("pct_hospice"),
  pct_inpatient: doublePrecision("pct_inpatient"),
  pct_outpatient: doublePrecision("pct_outpatient"),
  pct_snf_state: doublePrecision("pct_snf_state"),
  pct_hha_state: doublePrecision("pct_hha_state"),
  pct_hospice_state: doublePrecision("pct_hospice_state"),
  pct_snf_national: doublePrecision("pct_snf_national"),
  pct_hha_national: doublePrecision("pct_hha_national"),
  pct_hospice_national: doublePrecision("pct_hospice_national"),
  avg_episode_spend: doublePrecision("avg_episode_spend"),
}, (table) => [
  primaryKey({ columns: [table.ccn, table.data_year] }),
]);

export const rollupPacMarketShare = pgTable("rollup_pac_market_share", {
  setting: varchar("setting", { length: 10 }).notNull(),
  data_year: varchar("data_year", { length: 10 }).notNull(),
  geo_level: varchar("geo_level", { length: 10 }).notNull(),
  geo_code: varchar("geo_code", { length: 5 }).notNull(),
  ccn: varchar("ccn", { length: 10 }).notNull(),
  provider_name: text("provider_name"),
  city: varchar("city", { length: 100 }),
  state: varchar("state", { length: 2 }),
  zip5: varchar("zip5", { length: 5 }),
  benes: integer("benes"),
  stays: integer("stays"),
  days: integer("days"),
  payment: doublePrecision("payment"),
  dual_pct: doublePrecision("dual_pct"),
  risk_score: doublePrecision("risk_score"),
  share_benes: doublePrecision("share_benes"),
  rank: integer("rank"),
  providers_in_market: integer("providers_in_market"),
}, (table) => [
  primaryKey({ columns: [table.setting, table.data_year, table.geo_level, table.geo_code, table.ccn] }),
  index("idx_rollup_pac_share_ccn").on(table.ccn, table.setting, table.data_year),
  index("idx_rollup_pac_share_geo").on(table.geo_level, table.geo_code, table.setting, table.data_year),
]);

export const rollupAgencyCoverage = pgTable("rollup_agency_coverage", {
  setting: varchar("setting", { length: 10 }).notNull(),
  county_fips: varchar("county_fips", { length: 5 }).notNull(),
  ccn: varchar("ccn", { length: 10 }).notNull(),
  zips_served: integer("zips_served").notNull(),
  county_zips: integer("county_zips").notNull(),
  share_of_county_zips: doublePrecision("share_of_county_zips"),
}, (table) => [
  primaryKey({ columns: [table.setting, table.county_fips, table.ccn] }),
  index("idx_rollup_agency_cov_ccn").on(table.setting, table.ccn),
  index("idx_rollup_agency_cov_county").on(table.county_fips, table.setting),
]);

export const rollupReferralSources = pgTable("rollup_referral_sources", {
  npi: varchar("npi", { length: 10 }).primaryKey(),
  data_year: varchar("data_year", { length: 10 }).notNull(),
  county_fips: varchar("county_fips", { length: 5 }),
  state: varchar("state", { length: 2 }),
  zip5: varchar("zip5", { length: 5 }),
  specialty: varchar("specialty", { length: 120 }),
  benes: integer("benes"),
  services: doublePrecision("services"),
  avg_risk_score: doublePrecision("avg_risk_score"),
  dual_pct: doublePrecision("dual_pct"),
  cc_chf_pct: doublePrecision("cc_chf_pct"),
  cc_copd_pct: doublePrecision("cc_copd_pct"),
  cc_alzheimer_pct: doublePrecision("cc_alzheimer_pct"),
  cc_ckd_pct: doublePrecision("cc_ckd_pct"),
  cc_diabetes_pct: doublePrecision("cc_diabetes_pct"),
  hha_eligible: boolean("hha_eligible"),
  hospice_eligible: boolean("hospice_eligible"),
  dme_eligible: boolean("dme_eligible"),
  dme_benes: integer("dme_benes"),
  hospital_ccns: text("hospital_ccns").array(),
  affiliations: integer("affiliations"),
  referral_index: integer("referral_index"),
  rank_in_county: integer("rank_in_county"),
  hh_cert_benes: integer("hh_cert_benes"),
  hospice_oversight_benes: integer("hospice_oversight_benes"),
  hh_cert_year: varchar("hh_cert_year", { length: 10 }),
  hospice_index: integer("hospice_index"),
  hospice_rank_in_county: integer("hospice_rank_in_county"),
}, (table) => [
  index("idx_rollup_ref_src_county").on(table.county_fips, table.referral_index),
  index("idx_rollup_ref_src_state").on(table.state, table.referral_index),
  index("idx_rollup_ref_src_county_hospice").on(table.county_fips, table.hospice_index),
  index("idx_rollup_ref_src_state_hospice").on(table.state, table.hospice_index),
]);

export const rollupCountyMarketProfile = pgTable("rollup_county_market_profile", {
  county_fips: varchar("county_fips", { length: 5 }).primaryKey(),
  state: varchar("state", { length: 2 }).notNull(),
  county_name: text("county_name").notNull(),
  enrollment_period: varchar("enrollment_period", { length: 8 }),
  benes: bigint("benes", { mode: "number" }),
  original_medicare: bigint("original_medicare", { mode: "number" }),
  ma_benes: bigint("ma_benes", { mode: "number" }),
  ma_penetration: doublePrecision("ma_penetration"),
  aged: bigint("aged", { mode: "number" }),
  dual: bigint("dual", { mode: "number" }),
  benes_85_plus: bigint("benes_85_plus", { mode: "number" }),
  saturation_period: varchar("saturation_period", { length: 40 }),
  hha_providers: integer("hha_providers"),
  hha_users: bigint("hha_users", { mode: "number" }),
  hha_users_pct: doublePrecision("hha_users_pct"),
  hospice_providers: integer("hospice_providers"),
  hospice_users: bigint("hospice_users", { mode: "number" }),
  hospice_users_pct: doublePrecision("hospice_users_pct"),
  snf_providers: integer("snf_providers"),
  snf_users: bigint("snf_users", { mode: "number" }),
  snf_users_pct: doublePrecision("snf_users_pct"),
  variation_year: varchar("variation_year", { length: 10 }),
  std_per_capita_total: doublePrecision("std_per_capita_total"),
  std_per_capita_snf: doublePrecision("std_per_capita_snf"),
  std_per_capita_hha: doublePrecision("std_per_capita_hha"),
  std_per_capita_hospice: doublePrecision("std_per_capita_hospice"),
  readmission_rate: doublePrecision("readmission_rate"),
  er_visits_per_1000: doublePrecision("er_visits_per_1000"),
  avg_hcc_score: doublePrecision("avg_hcc_score"),
  hsa_year: varchar("hsa_year", { length: 10 }),
  hospitals_serving: integer("hospitals_serving"),
  top_hospital_ccn: varchar("top_hospital_ccn", { length: 10 }),
  top_hospital_share: doublePrecision("top_hospital_share"),
  pac_year: varchar("pac_year", { length: 10 }),
  snf_facilities: integer("snf_facilities"),
  hha_agencies: integer("hha_agencies"),
  hospice_agencies: integer("hospice_agencies"),
  as_of: jsonb("as_of"),
  // Demand (Census ACS) and state-licensed homes (migration 0019).
  pop_total: integer("pop_total"),
  pop_65_plus: integer("pop_65_plus"),
  pop_85_plus: integer("pop_85_plus"),
  median_income: integer("median_income"),
  median_home_value: integer("median_home_value"),
  living_alone_65_plus: integer("living_alone_65_plus"),
  licensed_homes: integer("licensed_homes"),
  licensed_beds: integer("licensed_beds"),
  hha_users_change_pct: doublePrecision("hha_users_change_pct"),
  hha_providers_change_pct: doublePrecision("hha_providers_change_pct"),
  hospice_users_change_pct: doublePrecision("hospice_users_change_pct"),
  hospice_providers_change_pct: doublePrecision("hospice_providers_change_pct"),
  snf_users_change_pct: doublePrecision("snf_users_change_pct"),
  snf_providers_change_pct: doublePrecision("snf_providers_change_pct"),
  avg_hcc_source: varchar("avg_hcc_source", { length: 40 }),
}, (table) => [
  index("idx_rollup_county_profile_state").on(table.state),
]);

// Census ACS 5-year estimates (server/lib/census/acs.ts). Not exposed via tableMap.
const acsColumns = {
  pop_total: integer("pop_total"),
  pop_65_plus: integer("pop_65_plus"),
  pop_85_plus: integer("pop_85_plus"),
  median_income: integer("median_income"),
  median_home_value: integer("median_home_value"),
  hh_65_plus: integer("hh_65_plus"),
  living_alone_65_plus: integer("living_alone_65_plus"),
};
export const censusAcsCounty = pgTable("census_acs_county", { fips: varchar("fips", { length: 5 }).primaryKey(), ...acsColumns });
export const censusAcsZcta = pgTable("census_acs_zcta", { zcta: varchar("zcta", { length: 5 }).primaryKey(), ...acsColumns });

/** State-licensed homes not in CMS files (personal care homes, assisted living), from CSV uploads. */
export const licensedFacilities = pgTable("licensed_facilities", {
  id: serial("id").primaryKey(),
  state: varchar("state", { length: 2 }).notNull(),
  license_type: varchar("license_type", { length: 60 }).notNull(),
  facility_key: varchar("facility_key", { length: 64 }).notNull(),
  license_number: varchar("license_number", { length: 60 }),
  name: text("name").notNull(),
  address: text("address"),
  city: varchar("city", { length: 100 }),
  zip5: varchar("zip5", { length: 5 }),
  county_fips: varchar("county_fips", { length: 5 }),
  capacity: integer("capacity"),
  status: varchar("status", { length: 60 }),
  licensee: text("licensee"),
  phone: varchar("phone", { length: 50 }),
  source_url: text("source_url"),
  as_of: date("as_of"),
  raw_data: jsonb("raw_data"),
  import_batch_id: integer("import_batch_id"),
  updated_date: timestamp("updated_date").defaultNow(),
}, (table) => [
  uniqueIndex("uq_licensed_facilities").on(table.state, table.license_type, table.facility_key),
  index("idx_licensed_facilities_county").on(table.county_fips, table.license_type),
  index("idx_licensed_facilities_state_type").on(table.state, table.license_type),
]);

// Organizations (migration 0020): one per customer. Not exposed via tableMap;
// managed through server/routes/billing.ts and the admin routes.
export const organizations = pgTable("organizations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: varchar("slug", { length: 80 }).notNull().unique(),
  // trial | active | past_due | canceled | disabled
  status: varchar("status", { length: 20 }).notNull().default("trial"),
  plan_code: varchar("plan_code", { length: 40 }),
  stripe_customer_id: varchar("stripe_customer_id", { length: 80 }),
  stripe_subscription_id: varchar("stripe_subscription_id", { length: 80 }),
  subscription_status: varchar("subscription_status", { length: 40 }),
  trial_ends_at: timestamp("trial_ends_at"),
  current_period_end: timestamp("current_period_end"),
  seat_limit: integer("seat_limit").notNull().default(3),
  /** { states: ["PA"], county_fips: ["42003"] }; both empty means unrestricted. */
  territory: jsonb("territory").notNull().default({ states: [], county_fips: [] }),
  quotas: jsonb("quotas"),
  sender: jsonb("sender"),
  terms_version: varchar("terms_version", { length: 20 }),
  /** When the last Stripe event applied to this row happened; an older event is ignored (server/lib/billing.ts). */
  stripe_event_at: timestamp("stripe_event_at"),
  /** When the current billing status began; applyStripeEvent moves it on every status transition, and the dunning ladder (orgAccessTier) reads it. */
  billing_status_since: timestamp("billing_status_since"),
  created_date: timestamp("created_date").defaultNow(),
  updated_date: timestamp("updated_date").defaultNow(),
});

export const organizationMembers = pgTable("organization_members", {
  org_id: integer("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  user_id: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  org_role: varchar("org_role", { length: 20 }).notNull().default("member"),
  created_date: timestamp("created_date").defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.org_id, table.user_id] }),
  index("organization_members_user_idx").on(table.user_id),
]);

export const plans = pgTable("plans", {
  code: varchar("code", { length: 40 }).primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  stripe_price_id: varchar("stripe_price_id", { length: 80 }),
  monthly_price_cents: integer("monthly_price_cents"),
  seat_limit: integer("seat_limit").notNull().default(3),
  territory_scope: varchar("territory_scope", { length: 20 }).notNull().default("county_pack"),
  max_counties: integer("max_counties"),
  features: jsonb("features"),
  active: boolean("active").notNull().default(true),
  sort_order: integer("sort_order").notNull().default(0),
});

export const orgUsage = pgTable("org_usage", {
  org_id: integer("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  day: date("day").notNull(),
  ai_calls: integer("ai_calls").notNull().default(0),
  ai_tokens: bigint("ai_tokens", { mode: "number" }).notNull().default(0),
  exports: integer("exports").notNull().default(0),
  emails_sent: integer("emails_sent").notNull().default(0),
}, (table) => [
  primaryKey({ columns: [table.org_id, table.day] }),
]);

// Census geography (2020), loaded from server/data/census. Not exposed via tableMap.
export const geoCounties = pgTable("geo_counties", {
  fips: varchar("fips", { length: 5 }).primaryKey(),
  state: varchar("state", { length: 2 }).notNull(),
  name: text("name").notNull(),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
}, (table) => [
  index("geo_counties_state_idx").on(table.state),
]);

export const geoZctas = pgTable("geo_zctas", {
  zcta: varchar("zcta", { length: 5 }).primaryKey(),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  land_sqmi: doublePrecision("land_sqmi"),
  primary_county_fips: varchar("primary_county_fips", { length: 5 }),
  state: varchar("state", { length: 2 }),
}, (table) => [
  index("geo_zctas_county_idx").on(table.primary_county_fips),
  index("geo_zctas_state_idx").on(table.state),
]);

export const geoZctaCounties = pgTable("geo_zcta_counties", {
  zcta: varchar("zcta", { length: 5 }).notNull(),
  county_fips: varchar("county_fips", { length: 5 }).notNull(),
  land_share: doublePrecision("land_share").notNull(),
}, (table) => [
  primaryKey({ columns: [table.zcta, table.county_fips] }),
  index("geo_zcta_counties_county_idx").on(table.county_fips),
]);

// NUCC taxonomy code set (server/data/nucc, loaded by server/lib/nucc/load.ts).
export const nuccTaxonomies = pgTable("nucc_taxonomies", {
  code: varchar("code", { length: 10 }).primaryKey(),
  grouping: text("grouping"),
  classification: text("classification"),
  specialization: text("specialization"),
  display_name: text("display_name"),
  section: varchar("section", { length: 20 }),
  definition: text("definition"),
  version: varchar("version", { length: 10 }),
}, (table) => [
  index("nucc_taxonomies_grouping_idx").on(table.grouping),
]);

export const geoMeta = pgTable("geo_meta", {
  key: varchar("key", { length: 50 }).primaryKey(),
  vintage: varchar("vintage", { length: 20 }),
  dataset_sha256: varchar("dataset_sha256", { length: 64 }),
  row_counts: jsonb("row_counts"),
  loaded_at: timestamp("loaded_at").defaultNow(),
});

// Single-use password reset and invite links. Only a sha256 of the token is stored.
export const authTokens = pgTable("auth_tokens", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  purpose: varchar("purpose", { length: 20 }).notNull(),
  token_hash: varchar("token_hash", { length: 64 }).notNull().unique(),
  expires_at: timestamp("expires_at").notNull(),
  used_at: timestamp("used_at"),
  created_by: varchar("created_by", { length: 255 }),
  created_date: timestamp("created_date").defaultNow(),
}, (table) => [
  index("auth_tokens_user_idx").on(table.user_id),
]);

// Sign-in attempts per email in the current lockout window, shared by every
// server instance (UserRepo.countLoginAttempt). Ended windows are deleted.
export const loginAttempts = pgTable("login_attempts", {
  email: varchar("email", { length: 255 }).primaryKey(),
  attempts: integer("attempts").notNull().default(0),
  window_ends_at: timestamp("window_ends_at", { withTimezone: true }).notNull(),
}, (table) => [
  index("login_attempts_window_ends_idx").on(table.window_ends_at),
]);

export const providers = pgTable("providers", {
  id: serial("id").primaryKey(),
  npi: varchar("npi", { length: 20 }).unique(),
  entity_type: varchar("entity_type", { length: 50 }),
  first_name: varchar("first_name", { length: 255 }),
  last_name: varchar("last_name", { length: 255 }),
  organization_name: text("organization_name"),
  credential: varchar("credential", { length: 100 }),
  gender: varchar("gender", { length: 10 }),
  sole_proprietor: varchar("sole_proprietor", { length: 5 }),
  enumeration_date: varchar("enumeration_date", { length: 20 }),
  last_updated_date: varchar("last_updated_date", { length: 20 }),
  npi_deactivation_date: varchar("npi_deactivation_date", { length: 20 }),
  npi_reactivation_date: varchar("npi_reactivation_date", { length: 20 }),
  status: varchar("status", { length: 50 }).default("active"),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  fax: varchar("fax", { length: 50 }),
  website: text("website"),
  source: varchar("source", { length: 100 }),
  import_batch_id: text("import_batch_id"),
  email_confidence: varchar("email_confidence", { length: 20 }),
  email_source: varchar("email_source", { length: 255 }),
  email_validation_status: varchar("email_validation_status", { length: 20 }),
  email_validation_reason: text("email_validation_reason"),
  email_searched_at: timestamp("email_searched_at"),
  // DNS/MX verification result (see server/lib/emailVerification.ts).
  email_quality_score: integer("email_quality_score"),
  email_quality_confidence: varchar("email_quality_confidence", { length: 20 }),
  email_quality_reasons: jsonb("email_quality_reasons"),
  email_quality_risk_flags: jsonb("email_quality_risk_flags"),
  email_analyzed_at: timestamp("email_analyzed_at"),
  additional_emails: jsonb("additional_emails"),
  ai_enrichment_status: varchar("ai_enrichment_status", { length: 50 }),
  ai_summary: text("ai_summary"),
  ai_outreach_score: doublePrecision("ai_outreach_score"),
  ai_outreach_strategy: text("ai_outreach_strategy"),
  ai_engagement_factors: jsonb("ai_engagement_factors"),
  ai_outreach_scored_at: timestamp("ai_outreach_scored_at"),
  ai_category: varchar("ai_category", { length: 100 }),
  ai_tags: jsonb("ai_tags"),
  raw_data: jsonb("raw_data"),
  created_date: timestamp("created_date").defaultNow(),
  updated_date: timestamp("updated_date").defaultNow(),
}, (table) => [
  index("providers_npi_idx").on(table.npi),
  index("providers_last_name_idx").on(table.last_name),
]);

export const providerLocations = pgTable("provider_locations", {
  id: serial("id").primaryKey(),
  npi: varchar("npi", { length: 20 }),
  address_1: text("address_1"),
  address_2: text("address_2"),
  city: varchar("city", { length: 255 }),
  state: varchar("state", { length: 10 }),
  zip: varchar("zip", { length: 20 }),
  country: varchar("country", { length: 10 }),
  phone: varchar("phone", { length: 50 }),
  fax: varchar("fax", { length: 50 }),
  email: varchar("email", { length: 255 }),
  location_type: varchar("location_type", { length: 50 }),
  source: varchar("source", { length: 100 }),
  raw_data: jsonb("raw_data"),
  created_date: timestamp("created_date").defaultNow(),
  updated_date: timestamp("updated_date").defaultNow(),
}, (table) => [
  index("provider_locations_npi_idx").on(table.npi),
  index("provider_locations_state_idx").on(table.state),
]);

export const providerTaxonomies = pgTable("provider_taxonomies", {
  id: serial("id").primaryKey(),
  npi: varchar("npi", { length: 20 }),
  taxonomy_code: varchar("taxonomy_code", { length: 50 }),
  taxonomy_description: text("taxonomy_description"),
  taxonomy_group: text("taxonomy_group"),
  is_primary: boolean("is_primary").default(false),
  license_number: varchar("license_number", { length: 100 }),
  license_state: varchar("license_state", { length: 10 }),
  source: varchar("source", { length: 100 }),
  created_date: timestamp("created_date").defaultNow(),
  updated_date: timestamp("updated_date").defaultNow(),
}, (table) => [
  index("provider_taxonomies_npi_idx").on(table.npi),
]);

export const leadScores = pgTable("lead_scores", {
  id: serial("id").primaryKey(),
  npi: varchar("npi", { length: 20 }),
  score: doublePrecision("score"),
  outreach_potential: doublePrecision("outreach_potential"),
  referral_likelihood: doublePrecision("referral_likelihood"),
  data_completeness: doublePrecision("data_completeness"),
  scoring_rule_id: integer("scoring_rule_id"),
  last_calculated: timestamp("last_calculated"),
  details: jsonb("details"),
  created_date: timestamp("created_date").defaultNow(),
  updated_date: timestamp("updated_date").defaultNow(),
}, (table) => [
  index("lead_scores_npi_idx").on(table.npi),
]);

export const providerAffiliations = pgTable("provider_affiliations", {
  id: serial("id").primaryKey(),
  npi: varchar("npi", { length: 20 }),
  organization_npi: varchar("organization_npi", { length: 20 }),
  organization_name: text("organization_name"),
  affiliation_type: varchar("affiliation_type", { length: 100 }),
  start_date: varchar("start_date", { length: 20 }),
  end_date: varchar("end_date", { length: 20 }),
  role: varchar("role", { length: 255 }),
  city: varchar("city", { length: 100 }),
  state: varchar("state", { length: 10 }),
  confidence: varchar("confidence", { length: 20 }),
  status: varchar("status", { length: 50 }),
  is_active: boolean("is_active").default(true),
  is_primary: boolean("is_primary").default(false),
  notes: text("notes"),
  source: varchar("source", { length: 100 }),
  created_date: timestamp("created_date").defaultNow(),
  updated_date: timestamp("updated_date").defaultNow(),
});

export const providerLocationMatches = pgTable("provider_location_matches", {
  id: serial("id").primaryKey(),
  npi: varchar("npi", { length: 20 }),
  location_id: integer("location_id"),
  // match_type 'facility': a medicare_facilities row (location_id stays null,
  // since it means a provider_locations row elsewhere in the app).
  facility_id: integer("facility_id"),
  confidence_score: doublePrecision("confidence_score"),
  match_type: varchar("match_type", { length: 50 }),
  status: varchar("status", { length: 50 }).default("suggested"),
  provider_name: text("provider_name"),
  location_display: text("location_display"),
  match_reasons: jsonb("match_reasons"),
  address_match_score: doublePrecision("address_match_score"),
  proximity_score: doublePrecision("proximity_score"),
  specialization_score: doublePrecision("specialization_score"),
  referral_score: doublePrecision("referral_score"),
  name_match_score: doublePrecision("name_match_score"),
  override_notes: text("override_notes"),
  matched_at: timestamp("matched_at"),
  created_date: timestamp("created_date").defaultNow(),
  updated_date: timestamp("updated_date").defaultNow(),
}, (table) => [
  index("provider_location_matches_npi_idx").on(table.npi),
]);

export const importBatches = pgTable("import_batches", {
  id: serial("id").primaryKey(),
  import_type: varchar("import_type", { length: 100 }),
  file_name: text("file_name"),
  status: varchar("status", { length: 50 }).default("pending"),
  total_rows: integer("total_rows"),
  imported_rows: integer("imported_rows"),
  updated_rows: integer("updated_rows"),
  skipped_rows: integer("skipped_rows"),
  valid_rows: integer("valid_rows"),
  invalid_rows: integer("invalid_rows"),
  excluded_rows: integer("excluded_rows"),
  error_count: integer("error_count"),
  api_requests_count: integer("api_requests_count"),
  rate_limit_count: integer("rate_limit_count"),
  config: jsonb("config"),
  tags: jsonb("tags"),
  error_samples: jsonb("error_samples"),
  cancel_reason: text("cancel_reason"),
  cancelled_at: timestamp("cancelled_at"),
  paused_at: timestamp("paused_at"),
  // Who paused the batch: 'user' (explicit UI pause — never auto-wake) or
  // 'system' (auto-pause/recovery — may be auto-woken). Null = unknown (older rows).
  paused_by: varchar("paused_by", { length: 10 }),
  completed_at: timestamp("completed_at"),
  retry_params: jsonb("retry_params"),
  // The AI quality analysis the Imports panel shows (server/functions/analyzeImportedDataset.ts).
  ai_analysis: jsonb("ai_analysis"),
  dry_run: boolean("dry_run").default(false),
  // The import schedule that started this batch (null for manual runs); the
  // completion sweep settles that schedule when the batch finishes.
  schedule_id: integer("schedule_id"),
  created_by: varchar("created_by", { length: 255 }),
  created_date: timestamp("created_date").defaultNow(),
  updated_date: timestamp("updated_date").defaultNow(),
}, (table) => [
  index("import_batches_status_idx").on(table.status),
  index("import_batches_type_idx").on(table.import_type),
]);

export const importValidationRules = pgTable("import_validation_rules", {
  id: serial("id").primaryKey(),
  rule_name: varchar("rule_name", { length: 255 }),
  import_type: varchar("import_type", { length: 100 }),
  column: varchar("column_name", { length: 255 }),
  rule_type: varchar("rule_type", { length: 50 }),
  severity: varchar("severity", { length: 50 }).default("reject"),
  description: text("description"),
  config: jsonb("config"),
  enabled: boolean("enabled").default(true),
  order: integer("rule_order"),
  created_date: timestamp("created_date").defaultNow(),
  updated_date: timestamp("updated_date").defaultNow(),
});

export const dataQualityScans = pgTable("data_quality_scans", {
  id: serial("id").primaryKey(),
  scan_type: varchar("scan_type", { length: 100 }),
  status: varchar("status", { length: 50 }).default("pending"),
  results_summary: jsonb("results_summary"),
  total_records: integer("total_records"),
  issues_found: integer("issues_found"),
  started_at: timestamp("started_at"),
  completed_at: timestamp("completed_at"),
  created_date: timestamp("created_date").defaultNow(),
  updated_date: timestamp("updated_date").defaultNow(),
});

export const dataQualityAlerts = pgTable("data_quality_alerts", {
  org_id: integer("org_id"),
  id: serial("id").primaryKey(),
  scan_id: integer("scan_id"),
  alert_type: varchar("alert_type", { length: 100 }),
  severity: varchar("severity", { length: 50 }),
  title: text("title"),
  description: text("description"),
  status: varchar("status", { length: 50 }).default("new"),
  action_required: boolean("action_required").default(false),
  affected_entity_id: text("affected_entity_id"),
  affected_entity_type: varchar("affected_entity_type", { length: 100 }),
  suggested_value: text("suggested_value"),
  resolved_at: timestamp("resolved_at"),
  // Fields written by the client-side AI scanners / alert analysis.
  npi: varchar("npi", { length: 20 }),
  rule_id: varchar("rule_id", { length: 100 }),
  rule_name: text("rule_name"),
  category: varchar("category", { length: 100 }),
  entity_type: varchar("entity_type", { length: 100 }),
  field_name: varchar("field_name", { length: 255 }),
  summary: text("summary"),
  suggestion_reason: text("suggestion_reason"),
  affected_count: integer("affected_count"),
  scan_batch_id: varchar("scan_batch_id", { length: 100 }),
  ai_root_cause: text("ai_root_cause"),
  ai_solutions: jsonb("ai_solutions"),
  ai_impact_assessment: text("ai_impact_assessment"),
  ai_analyzed_at: timestamp("ai_analyzed_at"),
  created_date: timestamp("created_date").defaultNow(),
  updated_date: timestamp("updated_date").defaultNow(),
}, (table) => [
  index("dq_alerts_status_idx").on(table.status),
]);

export const dataCleaningRules = pgTable("data_cleaning_rules", {
  id: serial("id").primaryKey(),
  rule_name: varchar("rule_name", { length: 255 }),
  target_field: varchar("target_field", { length: 255 }),
  rule_type: varchar("rule_type", { length: 50 }),
  pattern: text("pattern"),
  replacement: text("replacement"),
  description: text("description"),
  auto_fix: boolean("auto_fix").default(true),
  severity: varchar("severity", { length: 50 }).default("info"),
  enabled: boolean("enabled").default(true),
  created_date: timestamp("created_date").defaultNow(),
  updated_date: timestamp("updated_date").defaultNow(),
});

export const outreachCampaigns = pgTable("outreach_campaigns", {
  org_id: integer("org_id"),
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }),
  description: text("description"),
  status: varchar("status", { length: 50 }).default("draft"),
  campaign_type: varchar("campaign_type", { length: 50 }),
  subject: text("subject"),
  body: text("body"),
  sender_email: varchar("sender_email", { length: 255 }),
  sender_name: varchar("sender_name", { length: 255 }),
  target_list_id: integer("target_list_id"),
  target_npis: jsonb("target_npis"),
  total_recipients: integer("total_recipients"),
  template_id: integer("template_id"),
  schedule: jsonb("schedule"),
  metrics: jsonb("metrics"),
  automation_steps: jsonb("automation_steps"),
  tone: varchar("tone", { length: 50 }),
  goal: varchar("goal", { length: 100 }),
  start_date: timestamp("start_date"),
  end_date: timestamp("end_date"),
  created_by: varchar("created_by", { length: 255 }),
  created_date: timestamp("created_date").defaultNow(),
  updated_date: timestamp("updated_date").defaultNow(),
}, (table) => [
  index("campaigns_status_idx").on(table.status),
]);

export const outreachMessages = pgTable("outreach_messages", {
  org_id: integer("org_id"),
  id: serial("id").primaryKey(),
  campaign_id: integer("campaign_id"),
  npi: varchar("npi", { length: 20 }),
  recipient_email: varchar("recipient_email", { length: 255 }),
  recipient_name: varchar("recipient_name", { length: 255 }),
  subject: text("subject"),
  body: text("body"),
  status: varchar("status", { length: 50 }).default("pending"),
  sent_at: timestamp("sent_at"),
  opened_at: timestamp("opened_at"),
  clicked_at: timestamp("clicked_at"),
  bounced_at: timestamp("bounced_at"),
  responded_at: timestamp("responded_at"),
  // SendGrid's X-Message-Id, for matching delivery events to this row.
  provider_message_id: varchar("provider_message_id", { length: 255 }),
  error_message: text("error_message"),
  metadata: jsonb("metadata"),
  created_date: timestamp("created_date").defaultNow(),
  updated_date: timestamp("updated_date").defaultNow(),
}, (table) => [
  index("messages_campaign_idx").on(table.campaign_id),
  index("messages_npi_idx").on(table.npi),
  index("messages_status_idx").on(table.status),
  // Unsubscribes and bounces suppress pending messages by address.
  index("messages_pending_email_idx").on(sql`lower(${table.recipient_email})`).where(sql`${table.status} = 'pending'`),
]);

export const campaignTemplates = pgTable("campaign_templates", {
  org_id: integer("org_id"),
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }),
  subject_template: text("subject_template"),
  body_template: text("body_template"),
  category: varchar("category", { length: 50 }),
  ai_generated: boolean("ai_generated").default(false),
  use_count: integer("use_count").default(0),
  created_date: timestamp("created_date").defaultNow(),
  updated_date: timestamp("updated_date").defaultNow(),
});

export const leadLists = pgTable("lead_lists", {
  org_id: integer("org_id"),
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }),
  description: text("description"),
  list_type: varchar("list_type", { length: 50 }),
  filter_criteria: jsonb("filter_criteria"),
  member_count: integer("member_count").default(0),
  created_by: varchar("created_by", { length: 255 }),
  created_date: timestamp("created_date").defaultNow(),
  updated_date: timestamp("updated_date").defaultNow(),
});

export const leadListMembers = pgTable("lead_list_members", {
  id: serial("id").primaryKey(),
  list_id: integer("list_id"),
  npi: varchar("npi", { length: 20 }),
  status: varchar("status", { length: 50 }).default("active"),
  notes: text("notes"),
  added_by: varchar("added_by", { length: 255 }),
  created_date: timestamp("created_date").defaultNow(),
  updated_date: timestamp("updated_date").defaultNow(),
}, (table) => [
  index("lead_list_members_list_idx").on(table.list_id),
  index("lead_list_members_npi_idx").on(table.npi),
]);

export const cmsUtilization = pgTable("cms_utilization", {
  id: serial("id").primaryKey(),
  npi: varchar("npi", { length: 20 }),
  provider_type: text("provider_type"),
  hcpcs_code: varchar("hcpcs_code", { length: 20 }),
  hcpcs_description: text("hcpcs_description"),
  place_of_service: varchar("place_of_service", { length: 10 }),
  total_services: varchar("total_services", { length: 50 }),
  total_unique_benes: varchar("total_unique_benes", { length: 50 }),
  total_submitted_chrg_amt: varchar("total_submitted_chrg_amt", { length: 50 }),
  total_medicare_allowed_amt: varchar("total_medicare_allowed_amt", { length: 50 }),
  total_medicare_payment_amt: varchar("total_medicare_payment_amt", { length: 50 }),
  average_submitted_chrg_amt: varchar("average_submitted_chrg_amt", { length: 50 }),
  average_medicare_allowed_amt: varchar("average_medicare_allowed_amt", { length: 50 }),
  average_medicare_payment_amt: varchar("average_medicare_payment_amt", { length: 50 }),
  data_year: varchar("data_year", { length: 10 }),
  raw_data: jsonb("raw_data"),
  import_batch_id: text("import_batch_id"),
  created_date: timestamp("created_date").defaultNow(),
  updated_date: timestamp("updated_date").defaultNow(),
}, (table) => [
  index("cms_util_npi_idx").on(table.npi),
]);

export const cmsReferrals = pgTable("cms_referrals", {
  id: serial("id").primaryKey(),
  npi: varchar("npi", { length: 20 }),
  referred_to_npi: varchar("referred_to_npi", { length: 20 }),
  referred_to_name: text("referred_to_name"),
  total_referrals: integer("total_referrals"),
  total_beneficiaries: integer("total_beneficiaries"),
  data_year: varchar("data_year", { length: 10 }),
  raw_data: jsonb("raw_data"),
  import_batch_id: text("import_batch_id"),
  created_date: timestamp("created_date").defaultNow(),
  updated_date: timestamp("updated_date").defaultNow(),
}, (table) => [
  index("cms_ref_npi_idx").on(table.npi),
]);

export const medicareFacilities = pgTable("medicare_facilities", {
  id: serial("id").primaryKey(),
  facility_type: varchar("facility_type", { length: 100 }),
  provider_id: varchar("provider_id", { length: 50 }),
  facility_name: text("facility_name"),
  address: text("address"),
  city: varchar("city", { length: 255 }),
  state: varchar("state", { length: 10 }),
  zip: varchar("zip", { length: 20 }),
  total_discharges: integer("total_discharges"),
  total_days_of_care: integer("total_days_of_care"),
  avg_length_of_stay: doublePrecision("avg_length_of_stay"),
  total_charges: doublePrecision("total_charges"),
  total_payments: doublePrecision("total_payments"),
  quality_rating: doublePrecision("quality_rating"),
  data_year: varchar("data_year", { length: 10 }),
  raw_data: jsonb("raw_data"),
  import_batch_id: text("import_batch_id"),
  created_date: timestamp("created_date").defaultNow(),
  updated_date: timestamp("updated_date").defaultNow(),
});

// Side table for medicare_facilities.raw_data — split off to keep the hot
// medicare_facilities row narrow (the blob can be very large and was being
// pulled in implicitly by every select *). One-to-one: the FK is also the PK,
// and rows cascade-delete with their facility.
//
// Phase 1 (current): the table exists, writers dual-write (column + side table
// in a transaction), and readers prefer the side table via LEFT JOIN with a
// COALESCE fallback so the rollout is safe to soak in prod.
// Phase 2 (later PR): once dual-write has soaked, drop medicare_facilities.raw_data.
export const medicareFacilitiesRaw = pgTable("medicare_facilities_raw", {
  facility_id: integer("facility_id")
    .primaryKey()
    .references(() => medicareFacilities.id, { onDelete: "cascade" }),
  raw_data: jsonb("raw_data").notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const enrichmentRecords = pgTable("enrichment_records", {
  id: serial("id").primaryKey(),
  npi: varchar("npi", { length: 20 }),
  source: varchar("source", { length: 100 }),
  field_name: varchar("field_name", { length: 255 }),
  old_value: text("old_value"),
  new_value: text("new_value"),
  confidence: doublePrecision("confidence"),
  status: varchar("status", { length: 50 }).default("pending"),
  enrichment_details: jsonb("enrichment_details"),
  applied_at: timestamp("applied_at"),
  reviewed_by: varchar("reviewed_by", { length: 255 }),
  reviewed_at: timestamp("reviewed_at"),
  created_date: timestamp("created_date").defaultNow(),
  updated_date: timestamp("updated_date").defaultNow(),
}, (table) => [
  index("enrichment_npi_idx").on(table.npi),
]);

export const auditEvents = pgTable("audit_events", {
  org_id: integer("org_id"),
  id: serial("id").primaryKey(),
  event_type: varchar("event_type", { length: 100 }),
  user_email: varchar("user_email", { length: 255 }),
  entity_id: text("entity_id"),
  entity_type: varchar("entity_type", { length: 100 }),
  action: varchar("action", { length: 50 }),
  details: jsonb("details"),
  ip_address: varchar("ip_address", { length: 50 }),
  created_date: timestamp("created_date").defaultNow(),
});

export const analyticsDashboards = pgTable("analytics_dashboards", {
  org_id: integer("org_id"),
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }),
  description: text("description"),
  widgets: jsonb("widgets"),
  layout: jsonb("layout"),
  is_default: boolean("is_default").default(false),
  is_favorite: boolean("is_favorite").default(false),
  created_by: varchar("created_by", { length: 255 }),
  created_date: timestamp("created_date").defaultNow(),
  updated_date: timestamp("updated_date").defaultNow(),
});

export const scoringRules = pgTable("scoring_rules", {
  org_id: integer("org_id"),
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }),
  description: text("description"),
  rule_type: varchar("rule_type", { length: 50 }),
  conditions: jsonb("conditions"),
  weight: doublePrecision("weight").default(1.0),
  enabled: boolean("enabled").default(true),
  created_date: timestamp("created_date").defaultNow(),
  updated_date: timestamp("updated_date").defaultNow(),
});

export const nppesQueueItems = pgTable("nppes_queue_items", {
  id: serial("id").primaryKey(),
  batch_id: integer("batch_id"),
  state: varchar("state", { length: 5 }),
  zip_prefix: varchar("zip_prefix", { length: 10 }),
  status: varchar("status", { length: 50 }).default("pending"),
  retry_count: integer("retry_count").default(0),
  error_message: text("error_message"),
  results_count: integer("results_count"),
  created_date: timestamp("created_date").defaultNow(),
  updated_date: timestamp("updated_date").defaultNow(),
}, (table) => [
  index("nppes_queue_status_idx").on(table.status),
  index("nppes_queue_batch_idx").on(table.batch_id),
]);

export const nppesCrawlerConfigs = pgTable("nppes_crawler_configs", {
  id: serial("id").primaryKey(),
  config_key: varchar("config_key", { length: 100 }).unique(),
  api_batch_size: integer("api_batch_size").default(200),
  api_delay_ms: integer("api_delay_ms").default(200),
  max_retries: integer("max_retries").default(3),
  concurrency: integer("concurrency").default(4),
  max_workers: integer("max_workers").default(3),
  crawler_stopped: boolean("crawler_stopped").default(false),
  excluded_credentials: jsonb("excluded_credentials"),
  import_chunk_size: integer("import_chunk_size").default(50),
  retry_backoff_ms: integer("retry_backoff_ms").default(2000),
  request_timeout_ms: integer("request_timeout_ms").default(15000),
  crawl_entity_types: jsonb("crawl_entity_types").default(["NPI-1", "NPI-2"]),
  max_crawl_duration_sec: integer("max_crawl_duration_sec").default(160),
  auto_retry_enabled: boolean("auto_retry_enabled").default(false),
  retry_delay_minutes: integer("retry_delay_minutes").default(60),
  retry_escalation_threshold: integer("retry_escalation_threshold").default(3),
  escalation_tags: jsonb("escalation_tags").default(["manual_review_required"]),
  max_pages_per_query: integer("max_pages_per_query").default(6),
  max_skip: integer("max_skip").default(1000),
  crawl_all_states: boolean("crawl_all_states").default(true),
  selected_states: jsonb("selected_states").default([]),
  created_date: timestamp("created_date").defaultNow(),
  updated_date: timestamp("updated_date").defaultNow(),
});

export const cmsApiConnectors = pgTable("cms_api_connectors", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }),
  api_endpoint: text("api_endpoint"),
  api_type: varchar("api_type", { length: 50 }),
  status: varchar("status", { length: 50 }).default("active"),
  last_sync: timestamp("last_sync"),
  config: jsonb("config"),
  created_date: timestamp("created_date").defaultNow(),
  updated_date: timestamp("updated_date").defaultNow(),
});

export const errorReports = pgTable("error_reports", {
  id: serial("id").primaryKey(),
  error_type: varchar("error_type", { length: 100 }),
  severity: varchar("severity", { length: 50 }),
  message: text("message"),
  stack_trace: text("stack_trace"),
  context: jsonb("context"),
  batch_id: integer("batch_id"),
  resolved: boolean("resolved").default(false),
  created_date: timestamp("created_date").defaultNow(),
});

export const referralPathways = pgTable("referral_pathways", {
  id: serial("id").primaryKey(),
  provider_npi: varchar("provider_npi", { length: 20 }),
  analysis_data: jsonb("analysis_data"),
  score: doublePrecision("score"),
  status: varchar("status", { length: 50 }).default("active"),
  created_date: timestamp("created_date").defaultNow(),
  updated_date: timestamp("updated_date").defaultNow(),
});

export const preferredAgencies = pgTable("preferred_agencies", {
  id: serial("id").primaryKey(),
  provider_npi: varchar("provider_npi", { length: 20 }),
  agency_name: text("agency_name"),
  agency_npi: varchar("agency_npi", { length: 20 }),
  referral_count: integer("referral_count"),
  preference_score: doublePrecision("preference_score"),
  active: boolean("active").default(true),
  created_date: timestamp("created_date").defaultNow(),
  updated_date: timestamp("updated_date").defaultNow(),
});

export const providerReconciliations = pgTable("provider_reconciliations", {
  id: serial("id").primaryKey(),
  npi: varchar("npi", { length: 20 }),
  source_a: varchar("source_a", { length: 100 }),
  source_b: varchar("source_b", { length: 100 }),
  field_name: varchar("field_name", { length: 255 }),
  value_a: text("value_a"),
  value_b: text("value_b"),
  resolution: varchar("resolution", { length: 50 }),
  status: varchar("status", { length: 50 }).default("pending"),
  resolution_status: varchar("resolution_status", { length: 50 }).default("pending"),
  discrepancies: jsonb("discrepancies"),
  ai_suggestions: jsonb("ai_suggestions"),
  job_id: integer("job_id"),
  created_date: timestamp("created_date").defaultNow(),
  updated_date: timestamp("updated_date").defaultNow(),
});

export const providerServiceUtilization = pgTable("provider_service_utilization", {
  id: serial("id").primaryKey(),
  npi: varchar("npi", { length: 20 }),
  service_type: varchar("service_type", { length: 100 }),
  hcpcs_code: varchar("hcpcs_code", { length: 20 }),
  hcpcs_description: text("hcpcs_description"),
  place_of_service: varchar("place_of_service", { length: 10 }),
  total_services: varchar("total_services", { length: 50 }),
  total_unique_benes: varchar("total_unique_benes", { length: 50 }),
  average_submitted_chrg_amt: varchar("average_submitted_chrg_amt", { length: 50 }),
  average_medicare_payment_amt: varchar("average_medicare_payment_amt", { length: 50 }),
  total_medicare_payment_amt: varchar("total_medicare_payment_amt", { length: 50 }),
  data_year: varchar("data_year", { length: 10 }),
  raw_data: jsonb("raw_data"),
  created_date: timestamp("created_date").defaultNow(),
  updated_date: timestamp("updated_date").defaultNow(),
}, (table) => [
  index("psu_npi_idx").on(table.npi),
]);

export const metricsSnapshots = pgTable("metrics_snapshots", {
  id: serial("id").primaryKey(),
  metric_type: varchar("metric_type", { length: 100 }),
  value: doublePrecision("value"),
  metadata: jsonb("metadata"),
  captured_at: timestamp("captured_at").defaultNow(),
  created_date: timestamp("created_date").defaultNow(),
});

export const savedFilters = pgTable("saved_filters", {
  org_id: integer("org_id"),
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }),
  page: varchar("page", { length: 100 }),
  filters: jsonb("filters"),
  is_default: boolean("is_default").default(false),
  user_id: integer("user_id"),
  created_date: timestamp("created_date").defaultNow(),
  updated_date: timestamp("updated_date").defaultNow(),
});

export const scheduledReports = pgTable("scheduled_reports", {
  org_id: integer("org_id"),
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }),
  report_type: varchar("report_type", { length: 100 }),
  schedule: varchar("schedule", { length: 50 }),
  recipients: jsonb("recipients"),
  config: jsonb("config"),
  last_run: timestamp("last_run"),
  status: varchar("status", { length: 50 }).default("active"),
  created_date: timestamp("created_date").defaultNow(),
  updated_date: timestamp("updated_date").defaultNow(),
});

export const scheduledExports = pgTable("scheduled_exports", {
  org_id: integer("org_id"),
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }),
  export_type: varchar("export_type", { length: 100 }),
  schedule: varchar("schedule", { length: 50 }),
  filters: jsonb("filters"),
  format: varchar("format", { length: 20 }),
  recipients: jsonb("recipients"),
  // Form settings without a dedicated column (dataset, columns, frequency,
  // schedule_day/time, include_summary...) — see JSONB_OVERFLOW in lib/entityFields.ts.
  config: jsonb("config"),
  last_run: timestamp("last_run"),
  status: varchar("status", { length: 50 }).default("active"),
  created_date: timestamp("created_date").defaultNow(),
  updated_date: timestamp("updated_date").defaultNow(),
});

export const customReports = pgTable("custom_reports", {
  org_id: integer("org_id"),
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }),
  description: text("description"),
  query_config: jsonb("query_config"),
  visualization: jsonb("visualization"),
  is_favorite: boolean("is_favorite").default(false),
  user_id: integer("user_id"),
  created_date: timestamp("created_date").defaultNow(),
  updated_date: timestamp("updated_date").defaultNow(),
});

export const backgroundTasks = pgTable("background_tasks", {
  id: serial("id").primaryKey(),
  task_type: varchar("task_type", { length: 100 }),
  status: varchar("status", { length: 50 }).default("pending"),
  progress: integer("progress").default(0),
  result: jsonb("result"),
  error: text("error"),
  metadata: jsonb("metadata"),
  started_at: timestamp("started_at"),
  completed_at: timestamp("completed_at"),
  created_date: timestamp("created_date").defaultNow(),
  updated_date: timestamp("updated_date").defaultNow(),
});

export const reconciliationSettings = pgTable("reconciliation_settings", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }),
  config_key: varchar("config_key", { length: 100 }),
  nppes_endpoint: text("nppes_endpoint"),
  pecos_endpoint: text("pecos_endpoint"),
  pecos_api_key: text("pecos_api_key"),
  cms_endpoint: text("cms_endpoint"),
  cms_api_key: text("cms_api_key"),
  enable_ai_fallback: boolean("enable_ai_fallback").default(true),
  enable_ai_suggestions: boolean("enable_ai_suggestions").default(true),
  auto_accept_threshold: integer("auto_accept_threshold").default(90),
  auto_accept_low_severity: boolean("auto_accept_low_severity").default(false),
  source_config: jsonb("source_config"),
  rules: jsonb("rules"),
  auto_resolve: boolean("auto_resolve").default(false),
  created_date: timestamp("created_date").defaultNow(),
  updated_date: timestamp("updated_date").defaultNow(),
});

export const reconciliationJobs = pgTable("reconciliation_jobs", {
  id: serial("id").primaryKey(),
  settings_id: integer("settings_id"),
  status: varchar("status", { length: 50 }).default("pending"),
  total_records: integer("total_records"),
  total_providers: integer("total_providers"),
  matched: integer("matched"),
  unmatched: integer("unmatched"),
  conflicts: integer("conflicts"),
  discrepancies_found: integer("discrepancies_found"),
  ai_suggestions_generated: integer("ai_suggestions_generated"),
  sources: jsonb("sources"),
  job_type: varchar("job_type", { length: 50 }),
  results: jsonb("results"),
  started_at: timestamp("started_at"),
  completed_at: timestamp("completed_at"),
  created_date: timestamp("created_date").defaultNow(),
  updated_date: timestamp("updated_date").defaultNow(),
});

export const importScheduleConfigs = pgTable("import_schedule_configs", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }),
  label: varchar("label", { length: 255 }),
  import_type: varchar("import_type", { length: 100 }),
  schedule: varchar("schedule", { length: 50 }),
  schedule_frequency: varchar("schedule_frequency", { length: 30 }),
  schedule_time: varchar("schedule_time", { length: 10 }),
  config: jsonb("config"),
  nppes_config: jsonb("nppes_config"),
  api_url: text("api_url"),
  data_year: varchar("data_year", { length: 10 }),
  enabled: boolean("enabled").default(true),
  is_active: boolean("is_active").default(true),
  last_run: timestamp("last_run"),
  last_run_at: timestamp("last_run_at"),
  last_run_status: varchar("last_run_status", { length: 30 }),
  last_run_summary: text("last_run_summary"),
  last_successful_run_at: timestamp("last_successful_run_at"),
  next_run_at: timestamp("next_run_at"),
  consecutive_failures: integer("consecutive_failures").default(0),
  depends_on_import_type: varchar("depends_on_import_type", { length: 100 }),
  // The batch the last run started. last_run_status is "running" until that
  // batch completes or fails (server/lib/importCompletion.ts).
  last_batch_id: integer("last_batch_id"),
  created_date: timestamp("created_date").defaultNow(),
  updated_date: timestamp("updated_date").defaultNow(),
});

// Which version of each source dataset is loaded (server/lib/cmsCatalog.ts
// fills the catalog_* columns from data.cms.gov; imports fill imported_*).
export const datasetVersions = pgTable("dataset_versions", {
  import_type: varchar("import_type", { length: 100 }).primaryKey(),
  // cms_data_api | cms_provider_data | cms_gov_zip | census_bundle | nppes_file | manual_upload
  source: varchar("source", { length: 30 }).notNull(),
  source_dataset_id: text("source_dataset_id"),
  source_title: text("source_title"),
  catalog_modified: timestamp("catalog_modified"),
  catalog_issued: timestamp("catalog_issued"),
  temporal_start: date("temporal_start"),
  temporal_end: date("temporal_end"),
  accrual_periodicity: varchar("accrual_periodicity", { length: 50 }),
  catalog_checked_at: timestamp("catalog_checked_at"),
  imported_modified: timestamp("imported_modified"),
  imported_at: timestamp("imported_at"),
  imported_batch_id: integer("imported_batch_id"),
  row_count: bigint("row_count", { mode: "number" }),
  data_year: varchar("data_year", { length: 10 }),
  // never_imported | current | update_available | importing | failed
  status: varchar("status", { length: 20 }).notNull().default("never_imported"),
  notes: text("notes"),
  updated_date: timestamp("updated_date").defaultNow(),
});

// Medicare Order & Referring eligibility, one row per NPI (replaced per release).
export const cmsOrderReferring = pgTable("cms_order_referring", {
  npi: varchar("npi", { length: 10 }).primaryKey(),
  last_name: text("last_name"),
  first_name: text("first_name"),
  partb: boolean("partb"),
  dme: boolean("dme"),
  hha: boolean("hha"),
  pmd: boolean("pmd"),
  hospice: boolean("hospice"),
  as_of: date("as_of"),
  import_batch_id: integer("import_batch_id"),
  updated_date: timestamp("updated_date").defaultNow(),
});

export const providerNPIValidations = pgTable("provider_npi_validations", {
  id: serial("id").primaryKey(),
  npi: varchar("npi", { length: 20 }),
  validation_status: varchar("validation_status", { length: 50 }),
  validation_details: jsonb("validation_details"),
  validated_at: timestamp("validated_at"),
  created_date: timestamp("created_date").defaultNow(),
  updated_date: timestamp("updated_date").defaultNow(),
});

export const providerMedicareCompare = pgTable("provider_medicare_compare", {
  id: serial("id").primaryKey(),
  npi: varchar("npi", { length: 20 }),
  facility_id: varchar("facility_id", { length: 20 }),
  quality_score: doublePrecision("quality_score"),
  patient_experience: doublePrecision("patient_experience"),
  timely_care: doublePrecision("timely_care"),
  data: jsonb("data"),
  data_year: varchar("data_year", { length: 10 }),
  created_date: timestamp("created_date").defaultNow(),
  updated_date: timestamp("updated_date").defaultNow(),
});

export const providerDEASchedules = pgTable("provider_dea_schedules", {
  id: serial("id").primaryKey(),
  npi: varchar("npi", { length: 20 }),
  dea_number: varchar("dea_number", { length: 20 }),
  schedules: jsonb("schedules"),
  status: varchar("status", { length: 50 }),
  expiration_date: timestamp("expiration_date"),
  created_date: timestamp("created_date").defaultNow(),
  updated_date: timestamp("updated_date").defaultNow(),
});

export const inpatientDRG = pgTable("inpatient_drg", {
  id: serial("id").primaryKey(),
  npi: varchar("npi", { length: 20 }),
  drg_code: varchar("drg_code", { length: 10 }),
  drg_description: text("drg_description"),
  total_discharges: integer("total_discharges"),
  average_covered_charges: doublePrecision("average_covered_charges"),
  average_total_payments: doublePrecision("average_total_payments"),
  average_medicare_payments: doublePrecision("average_medicare_payments"),
  data_year: varchar("data_year", { length: 10 }),
  raw_data: jsonb("raw_data"),
  created_date: timestamp("created_date").defaultNow(),
  updated_date: timestamp("updated_date").defaultNow(),
});

export const medicareHHAStats = pgTable("medicare_hha_stats", {
  id: serial("id").primaryKey(),
  npi: varchar("npi", { length: 20 }),
  facility_name: text("facility_name"),
  state: varchar("state", { length: 10 }),
  quality_score: doublePrecision("quality_score"),
  star_rating: doublePrecision("star_rating"),
  data: jsonb("data"),
  data_year: varchar("data_year", { length: 10 }),
  raw_data: jsonb("raw_data"),
  created_date: timestamp("created_date").defaultNow(),
  updated_date: timestamp("updated_date").defaultNow(),
});

export const medicareSNFStats = pgTable("medicare_snf_stats", {
  id: serial("id").primaryKey(),
  npi: varchar("npi", { length: 20 }),
  facility_name: text("facility_name"),
  state: varchar("state", { length: 10 }),
  overall_rating: doublePrecision("overall_rating"),
  health_inspection_rating: doublePrecision("health_inspection_rating"),
  staffing_rating: doublePrecision("staffing_rating"),
  quality_rating: doublePrecision("quality_rating"),
  data: jsonb("data"),
  data_year: varchar("data_year", { length: 10 }),
  raw_data: jsonb("raw_data"),
  created_date: timestamp("created_date").defaultNow(),
  updated_date: timestamp("updated_date").defaultNow(),
});

export const columnMappingRules = pgTable("column_mapping_rules", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }),
  source_column: varchar("source_column", { length: 255 }),
  target_field: varchar("target_field", { length: 255 }),
  transform: varchar("transform", { length: 100 }),
  import_type: varchar("import_type", { length: 100 }),
  source: varchar("source", { length: 50 }),
  times_used: integer("times_used").default(0),
  last_used_at: timestamp("last_used_at"),
  created_date: timestamp("created_date").defaultNow(),
  updated_date: timestamp("updated_date").defaultNow(),
});

export const apiInteractionLogs = pgTable("api_interaction_logs", {
  id: serial("id").primaryKey(),
  endpoint: text("endpoint"),
  method: varchar("method", { length: 10 }),
  status_code: integer("status_code"),
  source: varchar("source", { length: 50 }),
  npi: varchar("npi", { length: 20 }),
  is_success: boolean("is_success"),
  response_time_ms: integer("response_time_ms"),
  error_message: text("error_message"),
  request_body: jsonb("request_body"),
  response_body: jsonb("response_body"),
  duration_ms: integer("duration_ms"),
  user_id: integer("user_id"),
  created_date: timestamp("created_date").defaultNow(),
});

// Addresses that must never receive outreach: unsubscribed, bounced or
// reported as spam. Checked before every campaign or direct send.
export const callSheets = pgTable("call_sheets", {
  id: serial("id").primaryKey(),
  org_id: integer("org_id"),
  name: varchar("name", { length: 255 }).notNull(),
  state: varchar("state", { length: 2 }),
  county_fips: varchar("county_fips", { length: 5 }),
  county_name: text("county_name"),
  account_count: integer("account_count").default(0),
  created_by: varchar("created_by", { length: 255 }),
  created_date: timestamp("created_date").defaultNow(),
  updated_date: timestamp("updated_date").defaultNow(),
}, (table) => [
  index("call_sheets_org_idx").on(table.org_id),
]);

export const callSheetAccounts = pgTable("call_sheet_accounts", {
  id: serial("id").primaryKey(),
  sheet_id: integer("sheet_id").notNull(),
  account_kind: varchar("account_kind", { length: 20 }).notNull(),
  account_key: varchar("account_key", { length: 64 }).notNull(),
  account_type: varchar("account_type", { length: 40 }).notNull(),
  name: text("name"),
  city: varchar("city", { length: 100 }),
  phone: varchar("phone", { length: 50 }),
  detail: text("detail"),
  status: varchar("status", { length: 40 }).notNull().default("new"),
  next_date: varchar("next_date", { length: 10 }),
  notes: text("notes"),
  created_date: timestamp("created_date").defaultNow(),
  updated_date: timestamp("updated_date").defaultNow(),
}, (table) => [
  uniqueIndex("call_sheet_accounts_unique").on(table.sheet_id, table.account_type, table.account_key),
  index("call_sheet_accounts_sheet_idx").on(table.sheet_id),
]);

// The marketer's book of accounts (one organization). Contacts, visits and
// referrals hang off the account and are removed with it.
export const crmAccounts = pgTable("crm_accounts", {
  id: serial("id").primaryKey(),
  org_id: integer("org_id"),
  account_key: varchar("account_key", { length: 64 }).notNull(),
  account_type: varchar("account_type", { length: 40 }).notNull(),
  name: text("name").notNull(),
  city: varchar("city", { length: 100 }),
  phone: varchar("phone", { length: 50 }),
  created_date: timestamp("created_date").defaultNow(),
  updated_date: timestamp("updated_date").defaultNow(),
}, (table) => [
  uniqueIndex("crm_accounts_org_key_uq").on(table.org_id, table.account_type, table.account_key),
  index("crm_accounts_org_idx").on(table.org_id),
]);

export const crmContacts = pgTable("crm_contacts", {
  id: serial("id").primaryKey(),
  account_id: integer("account_id").notNull(),
  role: varchar("role", { length: 40 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 50 }),
  email: varchar("email", { length: 255 }),
  created_date: timestamp("created_date").defaultNow(),
}, (table) => [
  index("crm_contacts_account_idx").on(table.account_id),
]);

// A visit or call the marketer made or scheduled, or a note. `done` is false
// for something still on the schedule.
export const crmActivities = pgTable("crm_activities", {
  id: serial("id").primaryKey(),
  account_id: integer("account_id").notNull(),
  kind: varchar("kind", { length: 20 }).notNull(),
  activity_date: varchar("activity_date", { length: 10 }).notNull(),
  done: boolean("done").notNull().default(true),
  note: text("note"),
  created_date: timestamp("created_date").defaultNow(),
}, (table) => [
  index("crm_activities_account_idx").on(table.account_id, table.activity_date),
]);

// A referral the account sent. No patient name. outcome: open, admitted, lost.
export const crmReferrals = pgTable("crm_referrals", {
  id: serial("id").primaryKey(),
  account_id: integer("account_id").notNull(),
  received_on: varchar("received_on", { length: 10 }).notNull(),
  outcome: varchar("outcome", { length: 20 }).notNull().default("open"),
  admitted_on: varchar("admitted_on", { length: 10 }),
  note: text("note"),
  created_date: timestamp("created_date").defaultNow(),
}, (table) => [
  index("crm_referrals_account_idx").on(table.account_id, table.received_on),
]);

export const emailSuppressions = pgTable("email_suppressions", {
  email: varchar("email", { length: 255 }).primaryKey(),
  reason: varchar("reason", { length: 50 }),
  source: varchar("source", { length: 50 }),
  created_date: timestamp("created_date").defaultNow(),
});

export const tableMap: Record<string, any> = {
  User: users,
  Provider: providers,
  ProviderLocation: providerLocations,
  ProviderTaxonomy: providerTaxonomies,
  LeadScore: leadScores,
  ProviderAffiliation: providerAffiliations,
  ProviderLocationMatch: providerLocationMatches,
  ImportBatch: importBatches,
  ImportValidationRule: importValidationRules,
  DataQualityScan: dataQualityScans,
  DataQualityAlert: dataQualityAlerts,
  DataCleaningRule: dataCleaningRules,
  OutreachCampaign: outreachCampaigns,
  OutreachMessage: outreachMessages,
  CampaignTemplate: campaignTemplates,
  LeadList: leadLists,
  LeadListMember: leadListMembers,
  CallSheet: callSheets,
  CallSheetAccount: callSheetAccounts,
  CrmAccount: crmAccounts,
  CrmContact: crmContacts,
  CrmActivity: crmActivities,
  CrmReferral: crmReferrals,
  CMSUtilization: cmsUtilization,
  CMSReferral: cmsReferrals,
  MedicareFacility: medicareFacilities,
  MedicareMAInpatient: medicareFacilities,
  CMSHHAStats: medicareFacilities,
  CMSSNFStats: medicareFacilities,
  MedicareHHAStats: medicareHHAStats,
  MedicareSNFStats: medicareSNFStats,
  EnrichmentRecord: enrichmentRecords,
  AuditEvent: auditEvents,
  AnalyticsDashboard: analyticsDashboards,
  ScoringRule: scoringRules,
  NPPESQueueItem: nppesQueueItems,
  NPPESCrawlerConfig: nppesCrawlerConfigs,
  CMSApiConnector: cmsApiConnectors,
  ErrorReport: errorReports,
  ReferralPathwayAnalysis: referralPathways,
  PreferredAgency: preferredAgencies,
  ProviderReconciliation: providerReconciliations,
  ProviderServiceUtilization: providerServiceUtilization,
  MetricsSnapshot: metricsSnapshots,
  SavedFilter: savedFilters,
  ScheduledReport: scheduledReports,
  ScheduledExport: scheduledExports,
  CustomReport: customReports,
  BackgroundTask: backgroundTasks,
  ReconciliationSettings: reconciliationSettings,
  ReconciliationJob: reconciliationJobs,
  ImportScheduleConfig: importScheduleConfigs,
  ProviderNPIValidation: providerNPIValidations,
  ProviderMedicareCompare: providerMedicareCompare,
  ProviderDEASchedules: providerDEASchedules,
  InpatientDRG: inpatientDRG,
  ColumnMappingRule: columnMappingRules,
  ApiInteractionLog: apiInteractionLogs,
};

// ─── Typed CMS datasets (migration 0016; mappers in server/functions/cmsTypedTables.ts) ───
// Geography and time-series datasets that medicare_facilities collapsed to one
// row per provider. Each natural key carries the period and the place.

/** Hospital Service Area: Medicare inpatient cases by hospital and the ZIP the beneficiary lives in. */
export const cmsHospitalServiceArea = pgTable("cms_hospital_service_area", {
  id: serial("id").primaryKey(),
  ccn: varchar("ccn", { length: 10 }).notNull(),
  zip5: varchar("zip5", { length: 5 }).notNull(),
  data_year: varchar("data_year", { length: 10 }).notNull(),
  total_cases: integer("total_cases"),
  total_days: integer("total_days"),
  total_charges: doublePrecision("total_charges"),
  raw_data: jsonb("raw_data"),
  import_batch_id: integer("import_batch_id"),
  updated_date: timestamp("updated_date").defaultNow(),
}, (table) => [
  uniqueIndex("uq_cms_hsa").on(table.ccn, table.zip5, table.data_year),
  index("idx_cms_hsa_zip_year").on(table.zip5, table.data_year),
]);

/** Post-acute care utilization (SNF/HHA/hospice/IRF/LTCH) by provider, with the state and national summary rows. */
export const cmsPacUtilization = pgTable("cms_pac_utilization", {
  id: serial("id").primaryKey(),
  setting: varchar("setting", { length: 10 }).notNull(),
  summary_level: varchar("summary_level", { length: 10 }).notNull(),
  ccn: varchar("ccn", { length: 10 }).notNull().default(""),
  state: varchar("state", { length: 2 }).notNull().default(""),
  data_year: varchar("data_year", { length: 10 }).notNull(),
  year_type: varchar("year_type", { length: 4 }),
  provider_name: text("provider_name"),
  city: varchar("city", { length: 100 }),
  zip5: varchar("zip5", { length: 5 }),
  bene_count: integer("bene_count"),
  stays: integer("stays"),
  service_days: integer("service_days"),
  charges: doublePrecision("charges"),
  allowed: doublePrecision("allowed"),
  medicare_payment: doublePrecision("medicare_payment"),
  standardized_payment: doublePrecision("standardized_payment"),
  avg_age: doublePrecision("avg_age"),
  dual_pct: doublePrecision("dual_pct"),
  rural_pct: doublePrecision("rural_pct"),
  avg_risk_score: doublePrecision("avg_risk_score"),
  chronic_conditions: jsonb("chronic_conditions"),
  metrics: jsonb("metrics"),
  raw_data: jsonb("raw_data"),
  import_batch_id: integer("import_batch_id"),
  updated_date: timestamp("updated_date").defaultNow(),
}, (table) => [
  uniqueIndex("uq_cms_pac").on(table.setting, table.summary_level, table.ccn, table.state, table.data_year),
  index("idx_cms_pac_state_zip").on(table.setting, table.state, table.zip5, table.data_year),
]);

/** Medicare Hospital Spending by Claim: spend per episode around an index admission, by claim type. */
export const cmsHospitalSpendingByClaim = pgTable("cms_hospital_spending_by_claim", {
  id: serial("id").primaryKey(),
  ccn: varchar("ccn", { length: 10 }).notNull(),
  period: varchar("period", { length: 80 }).notNull(),
  claim_type: varchar("claim_type", { length: 80 }).notNull(),
  data_year: varchar("data_year", { length: 10 }).notNull(),
  period_start: date("period_start"),
  period_end: date("period_end"),
  facility_name: text("facility_name"),
  state: varchar("state", { length: 2 }),
  avg_spend_hospital: doublePrecision("avg_spend_hospital"),
  avg_spend_state: doublePrecision("avg_spend_state"),
  avg_spend_national: doublePrecision("avg_spend_national"),
  pct_spend_hospital: doublePrecision("pct_spend_hospital"),
  pct_spend_state: doublePrecision("pct_spend_state"),
  pct_spend_national: doublePrecision("pct_spend_national"),
  raw_data: jsonb("raw_data"),
  import_batch_id: integer("import_batch_id"),
  updated_date: timestamp("updated_date").defaultNow(),
}, (table) => [
  uniqueIndex("uq_cms_hsbc").on(table.ccn, table.period, table.claim_type, table.data_year),
]);

/** Market Saturation & Utilization by county or CBSA and type of service. */
export const cmsMarketSaturation = pgTable("cms_market_saturation", {
  id: serial("id").primaryKey(),
  reference_period: varchar("reference_period", { length: 40 }).notNull(),
  geo_level: varchar("geo_level", { length: 30 }).notNull(),
  geo_code: varchar("geo_code", { length: 10 }).notNull().default(""),
  service: varchar("service", { length: 120 }).notNull(),
  state: varchar("state", { length: 2 }),
  geo_name: text("geo_name"),
  ffs_benes: bigint("ffs_benes", { mode: "number" }),
  providers: integer("providers"),
  users: bigint("users", { mode: "number" }),
  users_per_provider: doublePrecision("users_per_provider"),
  users_pct: doublePrecision("users_pct"),
  dual_users: bigint("dual_users", { mode: "number" }),
  dual_users_pct: doublePrecision("dual_users_pct"),
  total_payment: doublePrecision("total_payment"),
  moratorium: boolean("moratorium"),
  providers_change_pct: doublePrecision("providers_change_pct"),
  users_change_pct: doublePrecision("users_change_pct"),
  raw_data: jsonb("raw_data"),
  import_batch_id: integer("import_batch_id"),
  updated_date: timestamp("updated_date").defaultNow(),
}, (table) => [
  uniqueIndex("uq_cms_mktsat").on(table.reference_period, table.geo_level, table.geo_code, table.service),
]);

/** Medicare Monthly Enrollment by nation, state and county (period "YYYY-MM", or "YYYY-ALL" for the yearly row). */
export const cmsMonthlyEnrollment = pgTable("cms_monthly_enrollment", {
  id: serial("id").primaryKey(),
  period: varchar("period", { length: 8 }).notNull(),
  geo_level: varchar("geo_level", { length: 10 }).notNull(),
  geo_code: varchar("geo_code", { length: 5 }).notNull().default(""),
  state: varchar("state", { length: 2 }),
  county_name: text("county_name"),
  total_benes: bigint("total_benes", { mode: "number" }),
  original_medicare: bigint("original_medicare", { mode: "number" }),
  ma_and_other: bigint("ma_and_other", { mode: "number" }),
  aged: bigint("aged", { mode: "number" }),
  disabled: bigint("disabled", { mode: "number" }),
  dual: bigint("dual", { mode: "number" }),
  full_dual: bigint("full_dual", { mode: "number" }),
  age_85_plus: bigint("age_85_plus", { mode: "number" }),
  metrics: jsonb("metrics"),
  raw_data: jsonb("raw_data"),
  import_batch_id: integer("import_batch_id"),
  updated_date: timestamp("updated_date").defaultNow(),
}, (table) => [
  uniqueIndex("uq_cms_enroll").on(table.period, table.geo_level, table.geo_code),
]);

/** Medicare Geographic Variation by nation, state and county. */
export const cmsGeoVariation = pgTable("cms_geo_variation", {
  id: serial("id").primaryKey(),
  data_year: varchar("data_year", { length: 10 }).notNull(),
  geo_level: varchar("geo_level", { length: 10 }).notNull(),
  geo_code: varchar("geo_code", { length: 10 }).notNull().default(""),
  age_level: varchar("age_level", { length: 10 }).notNull().default("All"),
  geo_desc: text("geo_desc"),
  state: varchar("state", { length: 2 }),
  benes: bigint("benes", { mode: "number" }),
  ma_benes: bigint("ma_benes", { mode: "number" }),
  ma_participation_rate: doublePrecision("ma_participation_rate"),
  avg_age: doublePrecision("avg_age"),
  dual_pct: doublePrecision("dual_pct"),
  avg_hcc_score: doublePrecision("avg_hcc_score"),
  std_per_capita_total: doublePrecision("std_per_capita_total"),
  std_per_capita_ip: doublePrecision("std_per_capita_ip"),
  std_per_capita_snf: doublePrecision("std_per_capita_snf"),
  std_per_capita_hha: doublePrecision("std_per_capita_hha"),
  std_per_capita_hospice: doublePrecision("std_per_capita_hospice"),
  readmission_rate: doublePrecision("readmission_rate"),
  er_visits_per_1000: doublePrecision("er_visits_per_1000"),
  snf_stays_per_1000: doublePrecision("snf_stays_per_1000"),
  metrics: jsonb("metrics"),
  raw_data: jsonb("raw_data"),
  import_batch_id: integer("import_batch_id"),
  updated_date: timestamp("updated_date").defaultNow(),
}, (table) => [
  uniqueIndex("uq_cms_geovar").on(table.data_year, table.geo_level, table.geo_code, table.age_level),
]);

/** Care Compare "Zip Data": the ZIP codes each home health agency or hospice serves. */
export const cmsZipServiceArea = pgTable("cms_zip_service_area", {
  id: serial("id").primaryKey(),
  setting: varchar("setting", { length: 10 }).notNull(),
  ccn: varchar("ccn", { length: 10 }).notNull(),
  zip5: varchar("zip5", { length: 5 }).notNull(),
  state: varchar("state", { length: 2 }),
  as_of: date("as_of"),
  import_batch_id: integer("import_batch_id"),
  updated_date: timestamp("updated_date").defaultNow(),
}, (table) => [
  uniqueIndex("uq_cms_zipsvc").on(table.setting, table.ccn, table.zip5),
  index("idx_cms_zipsvc_zip").on(table.setting, table.zip5),
]);

/** Medicare Physician & Other Practitioners by Provider (Part B totals per NPI and year). */
export const cmsPhysicianByProvider = pgTable("cms_physician_by_provider", {
  id: serial("id").primaryKey(),
  npi: varchar("npi", { length: 10 }).notNull(),
  data_year: varchar("data_year", { length: 10 }).notNull(),
  entity_code: varchar("entity_code", { length: 1 }),
  provider_type: varchar("provider_type", { length: 120 }),
  state: varchar("state", { length: 2 }),
  zip5: varchar("zip5", { length: 5 }),
  ruca: varchar("ruca", { length: 5 }),
  benes: integer("benes"),
  services: doublePrecision("services"),
  hcpcs_codes: integer("hcpcs_codes"),
  submitted_charges: doublePrecision("submitted_charges"),
  allowed: doublePrecision("allowed"),
  medicare_payment: doublePrecision("medicare_payment"),
  standardized_payment: doublePrecision("standardized_payment"),
  avg_age: doublePrecision("avg_age"),
  dual_count: integer("dual_count"),
  avg_risk_score: doublePrecision("avg_risk_score"),
  chronic_conditions: jsonb("chronic_conditions"),
  metrics: jsonb("metrics"),
  raw_data: jsonb("raw_data"),
  import_batch_id: integer("import_batch_id"),
  updated_date: timestamp("updated_date").defaultNow(),
}, (table) => [
  uniqueIndex("uq_cms_phys").on(table.npi, table.data_year),
  index("idx_cms_phys_state_zip").on(table.state, table.zip5, table.data_year),
]);

/** Doctors & Clinicians facility affiliations: clinician NPI → facility CCN. */
export const cmsFacilityAffiliation = pgTable("cms_facility_affiliation", {
  id: serial("id").primaryKey(),
  npi: varchar("npi", { length: 10 }).notNull(),
  facility_type: varchar("facility_type", { length: 60 }).notNull(),
  facility_ccn: varchar("facility_ccn", { length: 10 }).notNull().default(""),
  ind_pac_id: varchar("ind_pac_id", { length: 20 }),
  as_of: date("as_of"),
  import_batch_id: integer("import_batch_id"),
  updated_date: timestamp("updated_date").defaultNow(),
}, (table) => [
  uniqueIndex("uq_cms_affil").on(table.npi, table.facility_type, table.facility_ccn),
  index("idx_cms_affil_ccn").on(table.facility_ccn),
]);

/** Medicare DME by Referring Provider (per NPI and year). */
export const cmsDmeByReferring = pgTable("cms_dme_by_referring", {
  id: serial("id").primaryKey(),
  npi: varchar("npi", { length: 10 }).notNull(),
  data_year: varchar("data_year", { length: 10 }).notNull(),
  state: varchar("state", { length: 2 }),
  zip5: varchar("zip5", { length: 5 }),
  specialty: varchar("specialty", { length: 120 }),
  suppliers: integer("suppliers"),
  benes: integer("benes"),
  claims: integer("claims"),
  services: doublePrecision("services"),
  medicare_payment: doublePrecision("medicare_payment"),
  standardized_payment: doublePrecision("standardized_payment"),
  hcpcs_codes: integer("hcpcs_codes"),
  allowed: doublePrecision("allowed"),
  submitted_charges: doublePrecision("submitted_charges"),
  dme_suppressed: boolean("dme_suppressed"),
  dme_benes: integer("dme_benes"),
  dme_payment: doublePrecision("dme_payment"),
  pos_suppressed: boolean("pos_suppressed"),
  pos_benes: integer("pos_benes"),
  pos_payment: doublePrecision("pos_payment"),
  drug_suppressed: boolean("drug_suppressed"),
  drug_benes: integer("drug_benes"),
  drug_payment: doublePrecision("drug_payment"),
  avg_age: doublePrecision("avg_age"),
  avg_risk_score: doublePrecision("avg_risk_score"),
  chronic_conditions: jsonb("chronic_conditions"),
  raw_data: jsonb("raw_data"),
  import_batch_id: integer("import_batch_id"),
  updated_date: timestamp("updated_date").defaultNow(),
}, (table) => [
  uniqueIndex("uq_cms_dmeref").on(table.npi, table.data_year),
]);

/**
 * Home health certifications and care plan oversight billed by a clinician (Medicare Physician & Other
 * Practitioners by Provider and Service, HCPCS G0180, G0179, G0181, G0182), one row per code and place of service.
 * CMS publishes only clinicians with more than 10 patients for a code.
 */
export const cmsPhysicianCertifications = pgTable("cms_physician_certifications", {
  id: serial("id").primaryKey(),
  npi: varchar("npi", { length: 10 }).notNull(),
  hcpcs_code: varchar("hcpcs_code", { length: 10 }).notNull(),
  place_of_service: varchar("place_of_service", { length: 1 }).notNull(),
  data_year: varchar("data_year", { length: 10 }).notNull(),
  provider_type: varchar("provider_type", { length: 120 }),
  state: varchar("state", { length: 2 }),
  benes: integer("benes"),
  services: doublePrecision("services"),
  raw_data: jsonb("raw_data"),
  import_batch_id: integer("import_batch_id"),
  updated_date: timestamp("updated_date").defaultNow(),
}, (table) => [
  uniqueIndex("uq_cms_phys_cert").on(table.npi, table.hcpcs_code, table.place_of_service, table.data_year),
]);

/** Medicare Inpatient Hospitals by Provider and Service: one row per hospital, DRG and year. */
export const cmsInpatientDrg = pgTable("cms_inpatient_drg", {
  id: serial("id").primaryKey(),
  ccn: varchar("ccn", { length: 10 }).notNull(),
  drg_code: varchar("drg_code", { length: 10 }).notNull(),
  data_year: varchar("data_year", { length: 10 }).notNull(),
  drg_desc: text("drg_desc"),
  provider_name: text("provider_name"),
  state: varchar("state", { length: 2 }),
  discharges: integer("discharges"),
  avg_covered_charges: doublePrecision("avg_covered_charges"),
  avg_total_payments: doublePrecision("avg_total_payments"),
  avg_medicare_payments: doublePrecision("avg_medicare_payments"),
  raw_data: jsonb("raw_data"),
  import_batch_id: integer("import_batch_id"),
  updated_date: timestamp("updated_date").defaultNow(),
}, (table) => [
  uniqueIndex("uq_cms_inpatient_drg").on(table.ccn, table.drg_code, table.data_year),
]);

// The importer writes cms_inpatient_drg. Reports read it through the entity API.
tableMap.CmsInpatientDrg = cmsInpatientDrg;

/** Long-Term Care Facility Characteristics (CMS-671): quarterly nursing-home census and payer mix. */
export const cmsLtcFacilityCharacteristics = pgTable("cms_ltc_facility_characteristics", {
  id: serial("id").primaryKey(),
  ccn: varchar("ccn", { length: 10 }).notNull(),
  period_end: date("period_end").notNull(),
  facility_name: text("facility_name"),
  city: varchar("city", { length: 100 }),
  state: varchar("state", { length: 2 }),
  zip5: varchar("zip5", { length: 5 }),
  certification_date: date("certification_date"),
  medicare_census: integer("medicare_census"),
  medicaid_census: integer("medicaid_census"),
  other_census: integer("other_census"),
  total_residents: integer("total_residents"),
  participation: varchar("participation", { length: 60 }),
  hospital_based: boolean("hospital_based"),
  ownership_type: varchar("ownership_type", { length: 80 }),
  multi_facility: boolean("multi_facility"),
  multi_facility_org_name: text("multi_facility_org_name"),
  special_care_beds: jsonb("special_care_beds"),
  ccrc: boolean("ccrc"),
  raw_data: jsonb("raw_data"),
  import_batch_id: integer("import_batch_id"),
  updated_date: timestamp("updated_date").defaultNow(),
}, (table) => [
  uniqueIndex("uq_cms_ltc671").on(table.ccn, table.period_end),
]);

// County and provider reference files that are not in the CMS data-api catalog
// (migrations 0024–0027). Composite keys match the SQL primary keys.

/** Medicare Advantage enrollment by parent organization and county, one month at a time. */
export const cmsMaPlanEnrollment = pgTable("cms_ma_plan_enrollment", {
  period: varchar("period", { length: 7 }).notNull(),
  county_fips: varchar("county_fips", { length: 5 }).notNull(),
  state: varchar("state", { length: 2 }),
  county_name: text("county_name"),
  organization: text("organization").notNull(),
  enrollment: integer("enrollment").notNull(),
  contracts: integer("contracts"),
}, (table) => [
  primaryKey({ columns: [table.period, table.county_fips, table.organization] }),
  index("idx_cms_ma_plan_fips").on(table.county_fips),
]);

export const cmsPartdGeoDrug = pgTable("cms_partd_geo_drug", {
  county_fips: varchar("county_fips", { length: 5 }).notNull(),
  data_year: varchar("data_year", { length: 4 }).notNull(),
  generic_name: text("generic_name").notNull(),
  claims: integer("claims"),
  drug_cost: numeric("drug_cost", { precision: 16, scale: 2 }),
  beneficiaries: integer("beneficiaries"),
  opioid: boolean("opioid"),
}, (table) => [
  primaryKey({ columns: [table.county_fips, table.data_year, table.generic_name] }),
]);

export const cmsPartdProviderDrug = pgTable("cms_partd_provider_drug", {
  npi: varchar("npi", { length: 10 }).notNull(),
  data_year: varchar("data_year", { length: 4 }).notNull(),
  generic_name: text("generic_name").notNull(),
  brand_name: text("brand_name"),
  claims: integer("claims"),
  drug_cost: numeric("drug_cost", { precision: 16, scale: 2 }),
  beneficiaries: integer("beneficiaries"),
}, (table) => [
  primaryKey({ columns: [table.npi, table.data_year, table.generic_name] }),
  index("idx_cms_partd_npi").on(table.npi),
]);

export const cdcPlacesCounty = pgTable("cdc_places_county", {
  county_fips: varchar("county_fips", { length: 5 }).notNull(),
  measure_id: varchar("measure_id", { length: 40 }).notNull(),
  measure: text("measure"),
  data_value: numeric("data_value", { precision: 8, scale: 2 }),
  year: varchar("year", { length: 4 }),
}, (table) => [
  primaryKey({ columns: [table.county_fips, table.measure_id] }),
]);

export const oigExclusions = pgTable("oig_exclusions", {
  npi: varchar("npi", { length: 10 }).primaryKey(),
  name: text("name"),
  excl_type: varchar("excl_type", { length: 20 }),
  excl_date: varchar("excl_date", { length: 8 }),
  state: varchar("state", { length: 2 }),
});

export const medicareOptOut = pgTable("medicare_opt_out", {
  npi: varchar("npi", { length: 10 }).primaryKey(),
  name: text("name"),
  specialty: text("specialty"),
  state: varchar("state", { length: 2 }),
  effective_date: varchar("effective_date", { length: 20 }),
  end_date: varchar("end_date", { length: 20 }),
});

export const cmsGeoService = pgTable("cms_geo_service", {
  county_fips: varchar("county_fips", { length: 5 }).notNull(),
  data_year: varchar("data_year", { length: 4 }).notNull(),
  hcpcs: varchar("hcpcs", { length: 10 }).notNull(),
  description: text("description"),
  beneficiaries: integer("beneficiaries"),
  services: numeric("services", { precision: 14, scale: 1 }),
  payment: numeric("payment", { precision: 16, scale: 2 }),
}, (table) => [
  primaryKey({ columns: [table.county_fips, table.data_year, table.hcpcs] }),
]);

export const hrsaShortage = pgTable("hrsa_shortage", {
  county_fips: varchar("county_fips", { length: 5 }).notNull(),
  discipline: varchar("discipline", { length: 40 }).notNull(),
  designation_type: text("designation_type").notNull().default(""),
  hpsa_score: numeric("hpsa_score", { precision: 6, scale: 2 }),
  status: text("status"),
}, (table) => [
  primaryKey({ columns: [table.county_fips, table.discipline, table.designation_type] }),
]);

export const cmsOpenPaymentTotals = pgTable("cms_open_payment_totals", {
  npi: varchar("npi", { length: 20 }).primaryKey(),
  recipient_state: varchar("recipient_state", { length: 2 }),
  program_year: integer("program_year").notNull(),
  payment_count: integer("payment_count").notNull(),
  total_amount: numeric("total_amount", { precision: 14, scale: 2 }).notNull(),
});

export const phc4CardiacVolume = pgTable("phc4_cardiac_volume", {
  report_period: varchar("report_period", { length: 9 }).notNull(),
  procedure_code: varchar("procedure_code", { length: 40 }).notNull(),
  county_name: text("county_name").notNull().default(""),
  facility_name: text("facility_name").notNull(),
  total_cases: integer("total_cases"),
  inpatient_cases: integer("inpatient_cases"),
  outpatient_cases: integer("outpatient_cases"),
}, (table) => [
  primaryKey({ columns: [table.report_period, table.procedure_code, table.county_name, table.facility_name] }),
  index("idx_phc4_cardiac_volume_county").on(table.county_name),
]);

export const phc4CardiacOutcome = pgTable("phc4_cardiac_outcome", {
  report_period: varchar("report_period", { length: 9 }).notNull(),
  procedure_code: varchar("procedure_code", { length: 40 }).notNull(),
  facility_name: text("facility_name").notNull(),
  measure: varchar("measure", { length: 24 }).notNull(),
  cases: integer("cases"),
  actual_value: numeric("actual_value", { precision: 14, scale: 2 }),
  expected_value: numeric("expected_value", { precision: 14, scale: 2 }),
  expected_low: numeric("expected_low", { precision: 14, scale: 2 }),
  expected_high: numeric("expected_high", { precision: 14, scale: 2 }),
  actual_rate: numeric("actual_rate", { precision: 8, scale: 2 }),
  expected_rate: numeric("expected_rate", { precision: 8, scale: 2 }),
  p_value: numeric("p_value", { precision: 8, scale: 4 }),
  rating: varchar("rating", { length: 16 }),
  adjusted_average: numeric("adjusted_average", { precision: 14, scale: 2 }),
}, (table) => [
  primaryKey({ columns: [table.report_period, table.procedure_code, table.facility_name, table.measure] }),
  index("idx_phc4_cardiac_outcome_facility").on(table.facility_name),
]);

export const phc4CancerSurgery = pgTable("phc4_cancer_surgery", {
  report_period: varchar("report_period", { length: 12 }).notNull(),
  county_name: text("county_name").notNull().default(""),
  facility_name: text("facility_name").notNull(),
  facility_type: text("facility_type"),
  cancer: varchar("cancer", { length: 24 }).notNull(),
  inpatient_cases: integer("inpatient_cases"),
  outpatient_cases: integer("outpatient_cases"),
  total_cases: integer("total_cases"),
}, (table) => [
  primaryKey({ columns: [table.report_period, table.county_name, table.facility_name, table.cancer] }),
  index("idx_phc4_cancer_county").on(table.county_name),
]);

export const phc4CountyStat = pgTable("phc4_county_stat", {
  period: varchar("period", { length: 12 }).notNull(),
  report: varchar("report", { length: 40 }).notNull(),
  county_name: text("county_name").notNull(),
  category: text("category").notNull(),
  cases: integer("cases"),
  value: numeric("value", { precision: 10, scale: 2 }),
  value_unit: varchar("value_unit", { length: 32 }).notNull(),
}, (table) => [
  primaryKey({ columns: [table.period, table.report, table.county_name, table.category] }),
  index("idx_phc4_county_stat_county").on(table.county_name),
]);

export const paMcoEnrollment = pgTable("pa_mco_enrollment", {
  period: varchar("period", { length: 7 }).notNull(),
  county_name: text("county_name").notNull(),
  plan: text("plan").notNull(),
  zone: varchar("zone", { length: 32 }),
  enrollment: integer("enrollment").notNull(),
}, (table) => [
  primaryKey({ columns: [table.period, table.county_name, table.plan] }),
  index("idx_pa_mco_county").on(table.county_name),
]);

export const qhpCountyIssuer = pgTable("qhp_county_issuer", {
  plan_year: varchar("plan_year", { length: 4 }).notNull(),
  county_fips: varchar("county_fips", { length: 5 }).notNull(),
  issuer_id: varchar("issuer_id", { length: 8 }).notNull(),
  issuer_name: text("issuer_name").notNull(),
  market: varchar("market", { length: 20 }).notNull(),
  plan_count: integer("plan_count"),
  metals: text("metals"),
  state_enrollment: integer("state_enrollment"),
}, (table) => [
  primaryKey({ columns: [table.plan_year, table.county_fips, table.issuer_id, table.market] }),
  index("idx_qhp_county_issuer_fips").on(table.county_fips),
]);

export const cmsMaStar = pgTable("cms_ma_star", {
  rating_year: varchar("rating_year", { length: 4 }).notNull(),
  contract_id: varchar("contract_id", { length: 16 }).notNull(),
  organization_type: varchar("organization_type", { length: 80 }),
  contract_name: text("contract_name"),
  marketing_name: text("marketing_name"),
  parent_organization: text("parent_organization"),
  snp: varchar("snp", { length: 3 }),
  part_c_rating: numeric("part_c_rating", { precision: 3, scale: 1 }),
  part_d_rating: numeric("part_d_rating", { precision: 3, scale: 1 }),
  overall_rating: numeric("overall_rating", { precision: 3, scale: 1 }),
}, (table) => [
  primaryKey({ columns: [table.rating_year, table.contract_id] }),
]);

export const cmsMaContractCounty = pgTable("cms_ma_contract_county", {
  period: varchar("period", { length: 7 }).notNull(),
  county_fips: varchar("county_fips", { length: 5 }).notNull(),
  contract_id: varchar("contract_id", { length: 16 }).notNull(),
  enrollment: integer("enrollment").notNull(),
}, (table) => [
  primaryKey({ columns: [table.period, table.county_fips, table.contract_id] }),
  index("idx_cms_ma_contract_county_fips").on(table.county_fips),
]);

export const cmsMlr = pgTable("cms_mlr", {
  reporting_year: varchar("reporting_year", { length: 4 }).notNull(),
  state: varchar("state", { length: 2 }).notNull(),
  market: varchar("market", { length: 20 }).notNull(),
  company: text("company").notNull(),
  mlr: numeric("mlr", { precision: 8, scale: 2 }),
  mlr_denominator: numeric("mlr_denominator", { precision: 16, scale: 2 }),
  rebate: numeric("rebate", { precision: 16, scale: 2 }),
}, (table) => [
  primaryKey({ columns: [table.reporting_year, table.state, table.market, table.company] }),
  index("idx_cms_mlr_state").on(table.state),
]);

export const cmsOepState = pgTable("cms_oep_state", {
  coverage_year: varchar("coverage_year", { length: 4 }).notNull(),
  state: varchar("state", { length: 2 }).notNull(),
  platform: varchar("platform", { length: 20 }),
  plan_selections: integer("plan_selections"),
  avg_premium: numeric("avg_premium", { precision: 10, scale: 2 }),
  avg_premium_after_aptc: numeric("avg_premium_after_aptc", { precision: 10, scale: 2 }),
}, (table) => [
  primaryKey({ columns: [table.coverage_year, table.state] }),
]);

export const paAcaRate = pgTable("pa_aca_rate", {
  plan_year: varchar("plan_year", { length: 4 }).notNull(),
  market: varchar("market", { length: 20 }).notNull(),
  company: text("company").notNull(),
  on_marketplace: varchar("on_marketplace", { length: 3 }),
  requested_pct: numeric("requested_pct", { precision: 6, scale: 2 }),
  approved_pct: numeric("approved_pct", { precision: 6, scale: 2 }),
  market_share: numeric("market_share", { precision: 6, scale: 2 }),
}, (table) => [
  primaryKey({ columns: [table.plan_year, table.market, table.company] }),
]);

/** Medicare DMEPOS by the supplier who was paid (calendar year). */
export const cmsDmeBySupplier = pgTable("cms_dme_by_supplier", {
  npi: varchar("npi", { length: 10 }).notNull(),
  data_year: varchar("data_year", { length: 4 }).notNull(),
  name: text("name"),
  city: text("city"),
  state: varchar("state", { length: 2 }),
  zip5: varchar("zip5", { length: 5 }),
  specialty: text("specialty"),
  hcpcs_codes: integer("hcpcs_codes"),
  benes: integer("benes"),
  claims: integer("claims"),
  services: doublePrecision("services"),
  medicare_payment: doublePrecision("medicare_payment"),
  allowed: doublePrecision("allowed"),
  dme_suppressed: boolean("dme_suppressed"),
  dme_benes: integer("dme_benes"),
  dme_payment: doublePrecision("dme_payment"),
  pos_suppressed: boolean("pos_suppressed"),
  pos_benes: integer("pos_benes"),
  pos_payment: doublePrecision("pos_payment"),
  drug_suppressed: boolean("drug_suppressed"),
  drug_benes: integer("drug_benes"),
  drug_payment: doublePrecision("drug_payment"),
}, (table) => [
  primaryKey({ columns: [table.data_year, table.npi] }),
  index("idx_cms_dme_supplier_zip").on(table.zip5),
]);

/** One HCPCS a referring provider ordered. `rental` is blank when the line is not a rental. */
export const cmsDmeOrderLine = pgTable("cms_dme_order_line", {
  data_year: varchar("data_year", { length: 4 }).notNull(),
  npi: varchar("npi", { length: 10 }).notNull(),
  hcpcs: varchar("hcpcs", { length: 10 }).notNull(),
  rental: varchar("rental", { length: 1 }).notNull().default(""),
  state: varchar("state", { length: 2 }),
  rbcs_desc: text("rbcs_desc"),
  hcpcs_desc: text("hcpcs_desc"),
  suppliers: integer("suppliers"),
  benes: integer("benes"),
  claims: integer("claims"),
  services: doublePrecision("services"),
  avg_payment: doublePrecision("avg_payment"),
}, (table) => [
  primaryKey({ columns: [table.data_year, table.npi, table.hcpcs, table.rental] }),
  index("idx_dme_order_npi").on(table.npi),
]);

/** One HCPCS a supplier was paid for. */
export const cmsDmeSupplyLine = pgTable("cms_dme_supply_line", {
  data_year: varchar("data_year", { length: 4 }).notNull(),
  npi: varchar("npi", { length: 10 }).notNull(),
  hcpcs: varchar("hcpcs", { length: 10 }).notNull(),
  rental: varchar("rental", { length: 1 }).notNull().default(""),
  state: varchar("state", { length: 2 }),
  rbcs_desc: text("rbcs_desc"),
  hcpcs_desc: text("hcpcs_desc"),
  benes: integer("benes"),
  claims: integer("claims"),
  services: doublePrecision("services"),
  avg_payment: doublePrecision("avg_payment"),
}, (table) => [
  primaryKey({ columns: [table.data_year, table.npi, table.hcpcs, table.rental] }),
  index("idx_dme_supply_npi").on(table.npi),
]);

/** DMEPOS by the referring provider's geography. `geo_code` is a state FIPS, or blank for the national row. */
export const cmsDmeGeoService = pgTable("cms_dme_geo_service", {
  data_year: varchar("data_year", { length: 4 }).notNull(),
  geo_level: varchar("geo_level", { length: 16 }).notNull(),
  geo_code: varchar("geo_code", { length: 5 }).notNull().default(""),
  hcpcs: varchar("hcpcs", { length: 10 }).notNull(),
  rental: varchar("rental", { length: 1 }).notNull().default(""),
  state: varchar("state", { length: 2 }).notNull().default(""),
  geo_desc: text("geo_desc"),
  rbcs_desc: text("rbcs_desc"),
  hcpcs_desc: text("hcpcs_desc"),
  referring_providers: integer("referring_providers"),
  suppliers: integer("suppliers"),
  benes: integer("benes"),
  claims: integer("claims"),
  services: doublePrecision("services"),
  avg_payment: doublePrecision("avg_payment"),
}, (table) => [
  primaryKey({ columns: [table.data_year, table.geo_level, table.geo_code, table.hcpcs, table.rental] }),
  index("idx_dme_geo_state").on(table.state),
]);

/** Medicare DMEPOS supplier directory. `provider_id` is the supplier number, not an NPI. */
export const dmeSupplierDirectory = pgTable("dme_supplier_directory", {
  provider_id: varchar("provider_id", { length: 20 }).primaryKey(),
  npi: varchar("npi", { length: 10 }),
  business_name: text("business_name"),
  practice_name: text("practice_name"),
  address: text("address"),
  city: text("city"),
  state: varchar("state", { length: 2 }),
  zip5: varchar("zip5", { length: 5 }),
  phone: varchar("phone", { length: 20 }),
  accepts_assignment: boolean("accepts_assignment"),
  participation_begin: date("participation_begin"),
  specialties: text("specialties"),
  provider_types: text("provider_types"),
  supplies: text("supplies"),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  cba_contracted: boolean("cba_contracted"),
  as_of: date("as_of"),
}, (table) => [
  index("idx_dme_dir_zip").on(table.zip5),
  index("idx_dme_dir_npi").on(table.npi),
]);
