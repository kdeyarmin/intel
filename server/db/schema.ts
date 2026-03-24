import { pgTable, text, integer, boolean, timestamp, jsonb, doublePrecision, serial, varchar, uuid, index } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  password_hash: text("password_hash").notNull(),
  full_name: varchar("full_name", { length: 255 }),
  role: varchar("role", { length: 50 }).default("user"),
  avatar_url: text("avatar_url"),
  created_date: timestamp("created_date").defaultNow(),
  updated_date: timestamp("updated_date").defaultNow(),
});

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
  additional_emails: jsonb("additional_emails"),
  ai_enrichment_status: varchar("ai_enrichment_status", { length: 50 }),
  ai_summary: text("ai_summary"),
  ai_outreach_score: doublePrecision("ai_outreach_score"),
  ai_category: varchar("ai_category", { length: 100 }),
  ai_tags: jsonb("ai_tags"),
  raw_data: jsonb("raw_data"),
  created_date: timestamp("created_date").defaultNow(),
  updated_date: timestamp("updated_date").defaultNow(),
}, (table) => [
  index("providers_npi_idx").on(table.npi),
  index("providers_state_idx").on(table.last_name),
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
  source: varchar("source", { length: 100 }),
  created_date: timestamp("created_date").defaultNow(),
  updated_date: timestamp("updated_date").defaultNow(),
});

export const providerLocationMatches = pgTable("provider_location_matches", {
  id: serial("id").primaryKey(),
  npi: varchar("npi", { length: 20 }),
  location_id: integer("location_id"),
  confidence_score: doublePrecision("confidence_score"),
  match_type: varchar("match_type", { length: 50 }),
  status: varchar("status", { length: 50 }).default("pending"),
  matched_at: timestamp("matched_at"),
  created_date: timestamp("created_date").defaultNow(),
  updated_date: timestamp("updated_date").defaultNow(),
});

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
  completed_at: timestamp("completed_at"),
  retry_params: jsonb("retry_params"),
  dry_run: boolean("dry_run").default(false),
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
  id: serial("id").primaryKey(),
  campaign_id: integer("campaign_id"),
  npi: varchar("npi", { length: 20 }),
  recipient_email: varchar("recipient_email", { length: 255 }),
  subject: text("subject"),
  body: text("body"),
  status: varchar("status", { length: 50 }).default("pending"),
  sent_at: timestamp("sent_at"),
  opened_at: timestamp("opened_at"),
  clicked_at: timestamp("clicked_at"),
  bounced_at: timestamp("bounced_at"),
  error_message: text("error_message"),
  metadata: jsonb("metadata"),
  created_date: timestamp("created_date").defaultNow(),
  updated_date: timestamp("updated_date").defaultNow(),
}, (table) => [
  index("messages_campaign_idx").on(table.campaign_id),
  index("messages_npi_idx").on(table.npi),
  index("messages_status_idx").on(table.status),
]);

export const campaignTemplates = pgTable("campaign_templates", {
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
  quality_rating: integer("quality_rating"),
  data_year: varchar("data_year", { length: 10 }),
  raw_data: jsonb("raw_data"),
  import_batch_id: text("import_batch_id"),
  created_date: timestamp("created_date").defaultNow(),
  updated_date: timestamp("updated_date").defaultNow(),
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
  created_date: timestamp("created_date").defaultNow(),
  updated_date: timestamp("updated_date").defaultNow(),
}, (table) => [
  index("enrichment_npi_idx").on(table.npi),
]);

export const auditEvents = pgTable("audit_events", {
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

export const campaignTasks = pgTable("campaign_tasks", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }),
  description: text("description"),
  status: varchar("status", { length: 50 }).default("pending"),
  priority: varchar("priority", { length: 50 }).default("medium"),
  assigned_to: varchar("assigned_to", { length: 255 }),
  due_date: timestamp("due_date"),
  campaign_id: integer("campaign_id"),
  tags: jsonb("tags"),
  notes: text("notes"),
  created_by: varchar("created_by", { length: 255 }),
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
  total_services: varchar("total_services", { length: 50 }),
  total_unique_benes: varchar("total_unique_benes", { length: 50 }),
  average_submitted_chrg_amt: varchar("average_submitted_chrg_amt", { length: 50 }),
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

export const campaigns = pgTable("campaigns", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }),
  description: text("description"),
  status: varchar("status", { length: 50 }).default("draft"),
  type: varchar("type", { length: 50 }),
  target_audience: jsonb("target_audience"),
  settings: jsonb("settings"),
  created_date: timestamp("created_date").defaultNow(),
  updated_date: timestamp("updated_date").defaultNow(),
});

export const campaignSequenceSteps = pgTable("campaign_sequence_steps", {
  id: serial("id").primaryKey(),
  campaign_id: integer("campaign_id"),
  step_number: integer("step_number"),
  step_type: varchar("step_type", { length: 50 }),
  template_id: integer("template_id"),
  delay_days: integer("delay_days"),
  conditions: jsonb("conditions"),
  is_active: boolean("is_active").default(true),
  created_date: timestamp("created_date").defaultNow(),
  updated_date: timestamp("updated_date").defaultNow(),
});

export const savedFilters = pgTable("saved_filters", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }),
  page: varchar("page", { length: 100 }),
  filters: jsonb("filters"),
  user_id: integer("user_id"),
  created_date: timestamp("created_date").defaultNow(),
  updated_date: timestamp("updated_date").defaultNow(),
});

export const scheduledReports = pgTable("scheduled_reports", {
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
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }),
  export_type: varchar("export_type", { length: 100 }),
  schedule: varchar("schedule", { length: 50 }),
  filters: jsonb("filters"),
  format: varchar("format", { length: 20 }),
  recipients: jsonb("recipients"),
  last_run: timestamp("last_run"),
  status: varchar("status", { length: 50 }).default("active"),
  created_date: timestamp("created_date").defaultNow(),
  updated_date: timestamp("updated_date").defaultNow(),
});

export const customReports = pgTable("custom_reports", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }),
  description: text("description"),
  query_config: jsonb("query_config"),
  visualization: jsonb("visualization"),
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
  import_type: varchar("import_type", { length: 100 }),
  schedule: varchar("schedule", { length: 50 }),
  config: jsonb("config"),
  enabled: boolean("enabled").default(true),
  last_run: timestamp("last_run"),
  depends_on_import_type: varchar("depends_on_import_type", { length: 100 }),
  created_date: timestamp("created_date").defaultNow(),
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
  CampaignTask: campaignTasks,
  NPPESQueueItem: nppesQueueItems,
  NPPESCrawlerConfig: nppesCrawlerConfigs,
  CMSApiConnector: cmsApiConnectors,
  ErrorReport: errorReports,
  ReferralPathwayAnalysis: referralPathways,
  PreferredAgency: preferredAgencies,
  ProviderReconciliation: providerReconciliations,
  ProviderServiceUtilization: providerServiceUtilization,
  MetricsSnapshot: metricsSnapshots,
  Campaign: campaigns,
  CampaignSequenceStep: campaignSequenceSteps,
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
