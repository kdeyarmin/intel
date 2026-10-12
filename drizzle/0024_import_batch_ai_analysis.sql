-- The AI quality analysis of an import, shown in the Imports panel (analyzeImportedDataset).
ALTER TABLE "import_batches" ADD COLUMN IF NOT EXISTS "ai_analysis" jsonb;
