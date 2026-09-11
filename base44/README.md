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

Production verification on 2026-09-11 found `caremetricintel.com` still responding
with Base44's authentication envelope; `/api/health` returned the frontend HTML,
not the Express health handler. The protected Base44 app is
`6993c62145573ca8a97ad4a9`. No current Express production database was verified.

`centralAdminRead` is a narrow exception for connecting that verified live
runtime to the shared CareMetric Support Hub. It is disabled by default and
provides registered-user reads only after current Hub SMS and native protected
administrator checks. It creates no identities, imports, billing records, or
organization assumptions. See `docs/INTEL_HUB_CONNECTION.md` for release evidence
and the required runtime/identity review.

Other new functionality belongs in `server/`. This
directory can be removed once Express parity has been confirmed in production.
