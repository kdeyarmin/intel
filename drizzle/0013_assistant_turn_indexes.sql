-- Deleting a conversation cascades through its turns to their messages and
-- actions; these keep each turn's cascade an index lookup instead of a scan.
CREATE INDEX IF NOT EXISTS "assistant_messages_turn_idx" ON "assistant_messages" ("turn_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assistant_actions_turn_idx" ON "assistant_actions" ("turn_id");
