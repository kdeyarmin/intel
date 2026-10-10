-- Deleting a user cascades to their assistant actions; this keeps that an
-- index lookup instead of a scan of every retained action.
CREATE INDEX IF NOT EXISTS "assistant_actions_user_idx" ON "assistant_actions" ("user_id");
