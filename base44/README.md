# base44/ — legacy Base44 platform functions

This directory holds the original Base44 (Deno) serverless functions. The
application now runs on the self-hosted Express backend in `server/`, which is
the source of truth.

These files are kept for reference only. They are **not** executed by the
Express server and may have diverged from `server/`. In particular, the import
orchestration here (`runScheduledImports`, `autoRetryFailedImports`,
`autoResumePausedImports`, `onImportBatchCompleted`, `superviseNPPESCrawler`)
has been ported to the Express side:

- Scheduling/retry/resume/stall logic → `server/lib/scheduling.ts`
- Maintenance handlers → `server/functions/scheduledImports.ts`
- Cron entrypoints → `POST /api/maintenance/:task` (`server/routes/maintenance.ts`)

Do not add new functionality here. New work belongs in `server/`. This
directory can be removed once Express parity has been confirmed in production.
