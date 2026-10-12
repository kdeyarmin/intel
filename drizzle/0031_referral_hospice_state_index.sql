-- A statewide hospice ranking filters on state and orders by hospice_index.
-- The county index cannot serve that query.
CREATE INDEX IF NOT EXISTS "idx_rollup_ref_src_state_hospice" ON "rollup_referral_sources" ("state", "hospice_index");
