CREATE TABLE IF NOT EXISTS "analytics_dashboards" (
        "id" serial PRIMARY KEY NOT NULL,
        "name" varchar(255),
        "description" text,
        "widgets" jsonb,
        "layout" jsonb,
        "is_default" boolean DEFAULT false,
        "is_favorite" boolean DEFAULT false,
        "created_by" varchar(255),
        "created_date" timestamp DEFAULT now(),
        "updated_date" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "api_interaction_logs" (
        "id" serial PRIMARY KEY NOT NULL,
        "endpoint" text,
        "method" varchar(10),
        "status_code" integer,
        "source" varchar(50),
        "npi" varchar(20),
        "is_success" boolean,
        "response_time_ms" integer,
        "error_message" text,
        "request_body" jsonb,
        "response_body" jsonb,
        "duration_ms" integer,
        "user_id" integer,
        "created_date" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_events" (
        "id" serial PRIMARY KEY NOT NULL,
        "event_type" varchar(100),
        "user_email" varchar(255),
        "entity_id" text,
        "entity_type" varchar(100),
        "action" varchar(50),
        "details" jsonb,
        "ip_address" varchar(50),
        "created_date" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "background_tasks" (
        "id" serial PRIMARY KEY NOT NULL,
        "task_type" varchar(100),
        "status" varchar(50) DEFAULT 'pending',
        "progress" integer DEFAULT 0,
        "result" jsonb,
        "error" text,
        "metadata" jsonb,
        "started_at" timestamp,
        "completed_at" timestamp,
        "created_date" timestamp DEFAULT now(),
        "updated_date" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "campaign_sequence_steps" (
        "id" serial PRIMARY KEY NOT NULL,
        "campaign_id" integer,
        "step_number" integer,
        "step_type" varchar(50),
        "template_id" integer,
        "delay_days" integer,
        "conditions" jsonb,
        "is_active" boolean DEFAULT true,
        "created_date" timestamp DEFAULT now(),
        "updated_date" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "campaign_tasks" (
        "id" serial PRIMARY KEY NOT NULL,
        "title" varchar(255),
        "description" text,
        "status" varchar(50) DEFAULT 'pending',
        "priority" varchar(50) DEFAULT 'medium',
        "assigned_to" varchar(255),
        "due_date" timestamp,
        "campaign_id" integer,
        "tags" jsonb,
        "notes" text,
        "created_by" varchar(255),
        "created_date" timestamp DEFAULT now(),
        "updated_date" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "campaign_templates" (
        "id" serial PRIMARY KEY NOT NULL,
        "name" varchar(255),
        "subject_template" text,
        "body_template" text,
        "category" varchar(50),
        "ai_generated" boolean DEFAULT false,
        "use_count" integer DEFAULT 0,
        "created_date" timestamp DEFAULT now(),
        "updated_date" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "campaigns" (
        "id" serial PRIMARY KEY NOT NULL,
        "name" varchar(255),
        "description" text,
        "status" varchar(50) DEFAULT 'draft',
        "type" varchar(50),
        "target_audience" jsonb,
        "settings" jsonb,
        "created_date" timestamp DEFAULT now(),
        "updated_date" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cms_api_connectors" (
        "id" serial PRIMARY KEY NOT NULL,
        "name" varchar(255),
        "api_endpoint" text,
        "api_type" varchar(50),
        "status" varchar(50) DEFAULT 'active',
        "last_sync" timestamp,
        "config" jsonb,
        "created_date" timestamp DEFAULT now(),
        "updated_date" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cms_referrals" (
        "id" serial PRIMARY KEY NOT NULL,
        "npi" varchar(20),
        "referred_to_npi" varchar(20),
        "referred_to_name" text,
        "total_referrals" integer,
        "total_beneficiaries" integer,
        "data_year" varchar(10),
        "raw_data" jsonb,
        "import_batch_id" text,
        "created_date" timestamp DEFAULT now(),
        "updated_date" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cms_utilization" (
        "id" serial PRIMARY KEY NOT NULL,
        "npi" varchar(20),
        "provider_type" text,
        "hcpcs_code" varchar(20),
        "hcpcs_description" text,
        "place_of_service" varchar(10),
        "total_services" varchar(50),
        "total_unique_benes" varchar(50),
        "total_submitted_chrg_amt" varchar(50),
        "total_medicare_allowed_amt" varchar(50),
        "total_medicare_payment_amt" varchar(50),
        "average_submitted_chrg_amt" varchar(50),
        "average_medicare_allowed_amt" varchar(50),
        "average_medicare_payment_amt" varchar(50),
        "data_year" varchar(10),
        "raw_data" jsonb,
        "import_batch_id" text,
        "created_date" timestamp DEFAULT now(),
        "updated_date" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "column_mapping_rules" (
        "id" serial PRIMARY KEY NOT NULL,
        "name" varchar(255),
        "source_column" varchar(255),
        "target_field" varchar(255),
        "transform" varchar(100),
        "import_type" varchar(100),
        "created_date" timestamp DEFAULT now(),
        "updated_date" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "custom_reports" (
        "id" serial PRIMARY KEY NOT NULL,
        "name" varchar(255),
        "description" text,
        "query_config" jsonb,
        "visualization" jsonb,
        "user_id" integer,
        "created_date" timestamp DEFAULT now(),
        "updated_date" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "data_cleaning_rules" (
        "id" serial PRIMARY KEY NOT NULL,
        "rule_name" varchar(255),
        "target_field" varchar(255),
        "rule_type" varchar(50),
        "pattern" text,
        "replacement" text,
        "description" text,
        "auto_fix" boolean DEFAULT true,
        "severity" varchar(50) DEFAULT 'info',
        "enabled" boolean DEFAULT true,
        "created_date" timestamp DEFAULT now(),
        "updated_date" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "data_quality_alerts" (
        "id" serial PRIMARY KEY NOT NULL,
        "scan_id" integer,
        "alert_type" varchar(100),
        "severity" varchar(50),
        "title" text,
        "description" text,
        "status" varchar(50) DEFAULT 'new',
        "action_required" boolean DEFAULT false,
        "affected_entity_id" text,
        "affected_entity_type" varchar(100),
        "suggested_value" text,
        "resolved_at" timestamp,
        "created_date" timestamp DEFAULT now(),
        "updated_date" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "data_quality_scans" (
        "id" serial PRIMARY KEY NOT NULL,
        "scan_type" varchar(100),
        "status" varchar(50) DEFAULT 'pending',
        "results_summary" jsonb,
        "total_records" integer,
        "issues_found" integer,
        "started_at" timestamp,
        "completed_at" timestamp,
        "created_date" timestamp DEFAULT now(),
        "updated_date" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "enrichment_records" (
        "id" serial PRIMARY KEY NOT NULL,
        "npi" varchar(20),
        "source" varchar(100),
        "field_name" varchar(255),
        "old_value" text,
        "new_value" text,
        "confidence" double precision,
        "status" varchar(50) DEFAULT 'pending',
        "enrichment_details" jsonb,
        "applied_at" timestamp,
        "created_date" timestamp DEFAULT now(),
        "updated_date" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "error_reports" (
        "id" serial PRIMARY KEY NOT NULL,
        "error_type" varchar(100),
        "severity" varchar(50),
        "message" text,
        "stack_trace" text,
        "context" jsonb,
        "batch_id" integer,
        "resolved" boolean DEFAULT false,
        "created_date" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "import_batches" (
        "id" serial PRIMARY KEY NOT NULL,
        "import_type" varchar(100),
        "file_name" text,
        "status" varchar(50) DEFAULT 'pending',
        "total_rows" integer,
        "imported_rows" integer,
        "updated_rows" integer,
        "skipped_rows" integer,
        "valid_rows" integer,
        "invalid_rows" integer,
        "excluded_rows" integer,
        "error_count" integer,
        "api_requests_count" integer,
        "rate_limit_count" integer,
        "config" jsonb,
        "tags" jsonb,
        "error_samples" jsonb,
        "cancel_reason" text,
        "cancelled_at" timestamp,
        "completed_at" timestamp,
        "retry_params" jsonb,
        "dry_run" boolean DEFAULT false,
        "created_by" varchar(255),
        "created_date" timestamp DEFAULT now(),
        "updated_date" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "import_schedule_configs" (
        "id" serial PRIMARY KEY NOT NULL,
        "name" varchar(255),
        "import_type" varchar(100),
        "schedule" varchar(50),
        "config" jsonb,
        "enabled" boolean DEFAULT true,
        "last_run" timestamp,
        "depends_on_import_type" varchar(100),
        "created_date" timestamp DEFAULT now(),
        "updated_date" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "import_validation_rules" (
        "id" serial PRIMARY KEY NOT NULL,
        "rule_name" varchar(255),
        "import_type" varchar(100),
        "column_name" varchar(255),
        "rule_type" varchar(50),
        "severity" varchar(50) DEFAULT 'reject',
        "description" text,
        "config" jsonb,
        "enabled" boolean DEFAULT true,
        "rule_order" integer,
        "created_date" timestamp DEFAULT now(),
        "updated_date" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inpatient_drg" (
        "id" serial PRIMARY KEY NOT NULL,
        "npi" varchar(20),
        "drg_code" varchar(10),
        "drg_description" text,
        "total_discharges" integer,
        "average_covered_charges" double precision,
        "average_total_payments" double precision,
        "average_medicare_payments" double precision,
        "data_year" varchar(10),
        "raw_data" jsonb,
        "created_date" timestamp DEFAULT now(),
        "updated_date" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lead_list_members" (
        "id" serial PRIMARY KEY NOT NULL,
        "list_id" integer,
        "npi" varchar(20),
        "status" varchar(50) DEFAULT 'active',
        "notes" text,
        "added_by" varchar(255),
        "created_date" timestamp DEFAULT now(),
        "updated_date" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lead_lists" (
        "id" serial PRIMARY KEY NOT NULL,
        "name" varchar(255),
        "description" text,
        "list_type" varchar(50),
        "filter_criteria" jsonb,
        "member_count" integer DEFAULT 0,
        "created_by" varchar(255),
        "created_date" timestamp DEFAULT now(),
        "updated_date" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lead_scores" (
        "id" serial PRIMARY KEY NOT NULL,
        "npi" varchar(20),
        "score" double precision,
        "outreach_potential" double precision,
        "referral_likelihood" double precision,
        "data_completeness" double precision,
        "scoring_rule_id" integer,
        "last_calculated" timestamp,
        "details" jsonb,
        "created_date" timestamp DEFAULT now(),
        "updated_date" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "medicare_facilities" (
        "id" serial PRIMARY KEY NOT NULL,
        "facility_type" varchar(100),
        "provider_id" varchar(50),
        "facility_name" text,
        "address" text,
        "city" varchar(255),
        "state" varchar(10),
        "zip" varchar(20),
        "total_discharges" integer,
        "total_days_of_care" integer,
        "avg_length_of_stay" double precision,
        "total_charges" double precision,
        "total_payments" double precision,
        "quality_rating" integer,
        "data_year" varchar(10),
        "raw_data" jsonb,
        "import_batch_id" text,
        "created_date" timestamp DEFAULT now(),
        "updated_date" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "medicare_hha_stats" (
        "id" serial PRIMARY KEY NOT NULL,
        "npi" varchar(20),
        "facility_name" text,
        "state" varchar(10),
        "quality_score" double precision,
        "star_rating" double precision,
        "data" jsonb,
        "data_year" varchar(10),
        "raw_data" jsonb,
        "created_date" timestamp DEFAULT now(),
        "updated_date" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "medicare_snf_stats" (
        "id" serial PRIMARY KEY NOT NULL,
        "npi" varchar(20),
        "facility_name" text,
        "state" varchar(10),
        "overall_rating" double precision,
        "health_inspection_rating" double precision,
        "staffing_rating" double precision,
        "quality_rating" double precision,
        "data" jsonb,
        "data_year" varchar(10),
        "raw_data" jsonb,
        "created_date" timestamp DEFAULT now(),
        "updated_date" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "metrics_snapshots" (
        "id" serial PRIMARY KEY NOT NULL,
        "metric_type" varchar(100),
        "value" double precision,
        "metadata" jsonb,
        "captured_at" timestamp DEFAULT now(),
        "created_date" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "nppes_crawler_configs" (
        "id" serial PRIMARY KEY NOT NULL,
        "config_key" varchar(100),
        "api_batch_size" integer DEFAULT 200,
        "api_delay_ms" integer DEFAULT 200,
        "max_retries" integer DEFAULT 3,
        "concurrency" integer DEFAULT 4,
        "max_workers" integer DEFAULT 3,
        "crawler_stopped" boolean DEFAULT false,
        "excluded_credentials" jsonb,
        "import_chunk_size" integer DEFAULT 50,
        "retry_backoff_ms" integer DEFAULT 2000,
        "request_timeout_ms" integer DEFAULT 15000,
        "crawl_entity_types" jsonb DEFAULT '["NPI-1","NPI-2"]'::jsonb,
        "max_crawl_duration_sec" integer DEFAULT 160,
        "auto_retry_enabled" boolean DEFAULT false,
        "retry_delay_minutes" integer DEFAULT 60,
        "retry_escalation_threshold" integer DEFAULT 3,
        "escalation_tags" jsonb DEFAULT '["manual_review_required"]'::jsonb,
        "max_pages_per_query" integer DEFAULT 6,
        "max_skip" integer DEFAULT 1000,
        "crawl_all_states" boolean DEFAULT true,
        "selected_states" jsonb DEFAULT '[]'::jsonb,
        "created_date" timestamp DEFAULT now(),
        "updated_date" timestamp DEFAULT now(),
        CONSTRAINT "nppes_crawler_configs_config_key_unique" UNIQUE("config_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "nppes_queue_items" (
        "id" serial PRIMARY KEY NOT NULL,
        "batch_id" integer,
        "state" varchar(5),
        "zip_prefix" varchar(10),
        "status" varchar(50) DEFAULT 'pending',
        "retry_count" integer DEFAULT 0,
        "error_message" text,
        "results_count" integer,
        "created_date" timestamp DEFAULT now(),
        "updated_date" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "outreach_campaigns" (
        "id" serial PRIMARY KEY NOT NULL,
        "name" varchar(255),
        "description" text,
        "status" varchar(50) DEFAULT 'draft',
        "campaign_type" varchar(50),
        "subject" text,
        "body" text,
        "sender_email" varchar(255),
        "sender_name" varchar(255),
        "target_list_id" integer,
        "target_npis" jsonb,
        "template_id" integer,
        "schedule" jsonb,
        "metrics" jsonb,
        "automation_steps" jsonb,
        "tone" varchar(50),
        "goal" varchar(100),
        "start_date" timestamp,
        "end_date" timestamp,
        "created_by" varchar(255),
        "created_date" timestamp DEFAULT now(),
        "updated_date" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "outreach_messages" (
        "id" serial PRIMARY KEY NOT NULL,
        "campaign_id" integer,
        "npi" varchar(20),
        "recipient_email" varchar(255),
        "subject" text,
        "body" text,
        "status" varchar(50) DEFAULT 'pending',
        "sent_at" timestamp,
        "opened_at" timestamp,
        "clicked_at" timestamp,
        "bounced_at" timestamp,
        "error_message" text,
        "metadata" jsonb,
        "created_date" timestamp DEFAULT now(),
        "updated_date" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "preferred_agencies" (
        "id" serial PRIMARY KEY NOT NULL,
        "provider_npi" varchar(20),
        "agency_name" text,
        "agency_npi" varchar(20),
        "referral_count" integer,
        "preference_score" double precision,
        "active" boolean DEFAULT true,
        "created_date" timestamp DEFAULT now(),
        "updated_date" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "provider_affiliations" (
        "id" serial PRIMARY KEY NOT NULL,
        "npi" varchar(20),
        "organization_npi" varchar(20),
        "organization_name" text,
        "affiliation_type" varchar(100),
        "start_date" varchar(20),
        "end_date" varchar(20),
        "source" varchar(100),
        "created_date" timestamp DEFAULT now(),
        "updated_date" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "provider_dea_schedules" (
        "id" serial PRIMARY KEY NOT NULL,
        "npi" varchar(20),
        "dea_number" varchar(20),
        "schedules" jsonb,
        "status" varchar(50),
        "expiration_date" timestamp,
        "created_date" timestamp DEFAULT now(),
        "updated_date" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "provider_location_matches" (
        "id" serial PRIMARY KEY NOT NULL,
        "npi" varchar(20),
        "location_id" integer,
        "confidence_score" double precision,
        "match_type" varchar(50),
        "status" varchar(50) DEFAULT 'pending',
        "matched_at" timestamp,
        "created_date" timestamp DEFAULT now(),
        "updated_date" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "provider_locations" (
        "id" serial PRIMARY KEY NOT NULL,
        "npi" varchar(20),
        "address_1" text,
        "address_2" text,
        "city" varchar(255),
        "state" varchar(10),
        "zip" varchar(20),
        "country" varchar(10),
        "phone" varchar(50),
        "fax" varchar(50),
        "email" varchar(255),
        "location_type" varchar(50),
        "source" varchar(100),
        "raw_data" jsonb,
        "created_date" timestamp DEFAULT now(),
        "updated_date" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "provider_medicare_compare" (
        "id" serial PRIMARY KEY NOT NULL,
        "npi" varchar(20),
        "facility_id" varchar(20),
        "quality_score" double precision,
        "patient_experience" double precision,
        "timely_care" double precision,
        "data" jsonb,
        "data_year" varchar(10),
        "created_date" timestamp DEFAULT now(),
        "updated_date" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "provider_npi_validations" (
        "id" serial PRIMARY KEY NOT NULL,
        "npi" varchar(20),
        "validation_status" varchar(50),
        "validation_details" jsonb,
        "validated_at" timestamp,
        "created_date" timestamp DEFAULT now(),
        "updated_date" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "provider_reconciliations" (
        "id" serial PRIMARY KEY NOT NULL,
        "npi" varchar(20),
        "source_a" varchar(100),
        "source_b" varchar(100),
        "field_name" varchar(255),
        "value_a" text,
        "value_b" text,
        "resolution" varchar(50),
        "status" varchar(50) DEFAULT 'pending',
        "resolution_status" varchar(50) DEFAULT 'pending',
        "discrepancies" jsonb,
        "ai_suggestions" jsonb,
        "job_id" integer,
        "created_date" timestamp DEFAULT now(),
        "updated_date" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "provider_service_utilization" (
        "id" serial PRIMARY KEY NOT NULL,
        "npi" varchar(20),
        "service_type" varchar(100),
        "total_services" varchar(50),
        "total_unique_benes" varchar(50),
        "average_submitted_chrg_amt" varchar(50),
        "total_medicare_payment_amt" varchar(50),
        "data_year" varchar(10),
        "raw_data" jsonb,
        "created_date" timestamp DEFAULT now(),
        "updated_date" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "provider_taxonomies" (
        "id" serial PRIMARY KEY NOT NULL,
        "npi" varchar(20),
        "taxonomy_code" varchar(50),
        "taxonomy_description" text,
        "taxonomy_group" text,
        "is_primary" boolean DEFAULT false,
        "license_number" varchar(100),
        "license_state" varchar(10),
        "source" varchar(100),
        "created_date" timestamp DEFAULT now(),
        "updated_date" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "providers" (
        "id" serial PRIMARY KEY NOT NULL,
        "npi" varchar(20),
        "entity_type" varchar(50),
        "first_name" varchar(255),
        "last_name" varchar(255),
        "organization_name" text,
        "credential" varchar(100),
        "gender" varchar(10),
        "sole_proprietor" varchar(5),
        "enumeration_date" varchar(20),
        "last_updated_date" varchar(20),
        "npi_deactivation_date" varchar(20),
        "npi_reactivation_date" varchar(20),
        "status" varchar(50) DEFAULT 'active',
        "email" varchar(255),
        "phone" varchar(50),
        "fax" varchar(50),
        "website" text,
        "source" varchar(100),
        "import_batch_id" text,
        "email_confidence" varchar(20),
        "email_source" varchar(255),
        "email_validation_status" varchar(20),
        "email_validation_reason" text,
        "email_searched_at" timestamp,
        "additional_emails" jsonb,
        "ai_enrichment_status" varchar(50),
        "ai_summary" text,
        "ai_outreach_score" double precision,
        "ai_category" varchar(100),
        "ai_tags" jsonb,
        "raw_data" jsonb,
        "created_date" timestamp DEFAULT now(),
        "updated_date" timestamp DEFAULT now(),
        CONSTRAINT "providers_npi_unique" UNIQUE("npi")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reconciliation_jobs" (
        "id" serial PRIMARY KEY NOT NULL,
        "settings_id" integer,
        "status" varchar(50) DEFAULT 'pending',
        "total_records" integer,
        "total_providers" integer,
        "matched" integer,
        "unmatched" integer,
        "conflicts" integer,
        "discrepancies_found" integer,
        "ai_suggestions_generated" integer,
        "sources" jsonb,
        "job_type" varchar(50),
        "results" jsonb,
        "started_at" timestamp,
        "completed_at" timestamp,
        "created_date" timestamp DEFAULT now(),
        "updated_date" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reconciliation_settings" (
        "id" serial PRIMARY KEY NOT NULL,
        "name" varchar(255),
        "config_key" varchar(100),
        "nppes_endpoint" text,
        "pecos_endpoint" text,
        "pecos_api_key" text,
        "cms_endpoint" text,
        "cms_api_key" text,
        "enable_ai_fallback" boolean DEFAULT true,
        "enable_ai_suggestions" boolean DEFAULT true,
        "auto_accept_threshold" integer DEFAULT 90,
        "auto_accept_low_severity" boolean DEFAULT false,
        "source_config" jsonb,
        "rules" jsonb,
        "auto_resolve" boolean DEFAULT false,
        "created_date" timestamp DEFAULT now(),
        "updated_date" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "referral_pathways" (
        "id" serial PRIMARY KEY NOT NULL,
        "provider_npi" varchar(20),
        "analysis_data" jsonb,
        "score" double precision,
        "status" varchar(50) DEFAULT 'active',
        "created_date" timestamp DEFAULT now(),
        "updated_date" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "saved_filters" (
        "id" serial PRIMARY KEY NOT NULL,
        "name" varchar(255),
        "page" varchar(100),
        "filters" jsonb,
        "user_id" integer,
        "created_date" timestamp DEFAULT now(),
        "updated_date" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scheduled_exports" (
        "id" serial PRIMARY KEY NOT NULL,
        "name" varchar(255),
        "export_type" varchar(100),
        "schedule" varchar(50),
        "filters" jsonb,
        "format" varchar(20),
        "recipients" jsonb,
        "last_run" timestamp,
        "status" varchar(50) DEFAULT 'active',
        "created_date" timestamp DEFAULT now(),
        "updated_date" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scheduled_reports" (
        "id" serial PRIMARY KEY NOT NULL,
        "name" varchar(255),
        "report_type" varchar(100),
        "schedule" varchar(50),
        "recipients" jsonb,
        "config" jsonb,
        "last_run" timestamp,
        "status" varchar(50) DEFAULT 'active',
        "created_date" timestamp DEFAULT now(),
        "updated_date" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scoring_rules" (
        "id" serial PRIMARY KEY NOT NULL,
        "name" varchar(255),
        "description" text,
        "rule_type" varchar(50),
        "conditions" jsonb,
        "weight" double precision DEFAULT 1,
        "enabled" boolean DEFAULT true,
        "created_date" timestamp DEFAULT now(),
        "updated_date" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
        "id" serial PRIMARY KEY NOT NULL,
        "email" varchar(255) NOT NULL,
        "password_hash" text NOT NULL,
        "full_name" varchar(255),
        "role" varchar(50) DEFAULT 'user',
        "avatar_url" text,
        "created_date" timestamp DEFAULT now(),
        "updated_date" timestamp DEFAULT now(),
        CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cms_ref_npi_idx" ON "cms_referrals" USING btree ("npi");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cms_util_npi_idx" ON "cms_utilization" USING btree ("npi");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dq_alerts_status_idx" ON "data_quality_alerts" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "enrichment_npi_idx" ON "enrichment_records" USING btree ("npi");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "import_batches_status_idx" ON "import_batches" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "import_batches_type_idx" ON "import_batches" USING btree ("import_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lead_list_members_list_idx" ON "lead_list_members" USING btree ("list_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lead_list_members_npi_idx" ON "lead_list_members" USING btree ("npi");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lead_scores_npi_idx" ON "lead_scores" USING btree ("npi");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "nppes_queue_status_idx" ON "nppes_queue_items" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "nppes_queue_batch_idx" ON "nppes_queue_items" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campaigns_status_idx" ON "outreach_campaigns" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_campaign_idx" ON "outreach_messages" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_npi_idx" ON "outreach_messages" USING btree ("npi");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_status_idx" ON "outreach_messages" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "provider_locations_npi_idx" ON "provider_locations" USING btree ("npi");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "provider_locations_state_idx" ON "provider_locations" USING btree ("state");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "psu_npi_idx" ON "provider_service_utilization" USING btree ("npi");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "provider_taxonomies_npi_idx" ON "provider_taxonomies" USING btree ("npi");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "providers_npi_idx" ON "providers" USING btree ("npi");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "providers_last_name_idx" ON "providers" USING btree ("last_name");