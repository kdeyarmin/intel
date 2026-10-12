-- Drop the dead campaign scaffolding tables. Nothing in the codebase reads
-- or writes campaign_tasks or campaign_sequence_steps (the entity router
-- already answered 404 for both); the real campaign data lives in
-- outreach_campaigns, outreach_messages and campaign_templates.
DROP TABLE IF EXISTS "campaign_sequence_steps";
--> statement-breakpoint
DROP TABLE IF EXISTS "campaign_tasks";
