# CareMetric AI Intelligence

## Overview
A React/Vite frontend application for healthcare provider intelligence, CRM, and analytics. The app is a healthcare provider data platform with features for provider management, lead lists, email campaigns, CMS analytics, and AI-powered insights.

## Architecture
- **Frontend**: React 18 + Vite 6, using TailwindCSS and Radix UI components
- **Backend API**: Express.js (port 3001) with generic entity CRUD routes
- **Database**: PostgreSQL + Drizzle ORM (49 tables)
- **AI**: Anthropic Claude (via `/api/integrations/ai/invoke`)
- **Email**: SendGrid (via `/api/integrations/email/send`)
- **File Upload**: Multer (via `/api/integrations/file/upload`, stored in `uploads/`)
- **Auth**: JWT-based (bcrypt password hashing, cookie + Bearer token)
- **State Management**: TanStack React Query
- **Routing**: React Router v6
- **UI Components**: shadcn/ui component library with Radix UI primitives

## Key Sections
- Dashboard with provider database stats and proactive alerts
- Provider management (All Providers, Locations, Territory Map)
- Sales & Outreach (Lead Lists, Provider Intelligence, Campaigns, Outreach)
- Analytics (CMS Data, Network, Advanced, Custom Reports)
- AI Assistant and AI enrichment tools
- Data imports from Medicare/CMS datasets
- API Connectors, CMS Data Sources, Reconciliation Dashboard
- Security Audit, Import Overview, Utilization pages

## Configuration
- Vite dev server: `0.0.0.0:5000`, `allowedHosts: true` (required for Replit proxy)
- Express API server: `0.0.0.0:3001`
- Vite proxies `/api` requests to Express backend
- Database: PostgreSQL via `DATABASE_URL` env var
- AI: `ANTHROPIC_API_KEY` env var
- Email: `SENDGRID_API_KEY` and `SENDGRID_FROM_EMAIL` env vars
- Auth: `JWT_SECRET` env var (defaults to dev secret)

## Running the App
```bash
npm run dev
```
Runs both Express API (port 3001) and Vite frontend (port 5000) concurrently via `concurrently`.

## Build
```bash
npm run build
```
Output goes to `dist/` directory.

## Database
```bash
npm run db:push    # Push schema changes to PostgreSQL
```
Schema defined in `server/db/schema.ts` (49 tables).
Connection in `server/db/index.ts`.

## Project Structure
- `server/` — Express.js backend
  - `server/index.ts` — Main Express app (serves uploaded files from `uploads/`)
  - `server/db/schema.ts` — Drizzle ORM schema (49 tables + tableMap)
  - `server/db/index.ts` — Database connection
  - `server/routes/auth.ts` — Auth endpoints (login, signup, me, logout)
  - `server/routes/entities.ts` — Generic entity CRUD (list, filter, get, create, update, delete, bulk)
  - `server/routes/integrations.ts` — AI (Claude), email (SendGrid), file upload (Multer)
  - `server/routes/functions.ts` — Backend function router (29 functions wired)
  - `server/functions/nppesCrawler.ts` — NPPES Registry crawler (status, batch_start/stop/pause/resume, process_queue, retry_errors)
  - `server/functions/triggerImport.ts` — Import trigger (CMS API, NPPES flat files, ZIP imports)
  - `server/functions/importNPPESFlatFile.ts` — Streaming CSV file importer with byte-offset pagination
  - `server/functions/helpers.ts` — Shared DB helpers (entity CRUD, retry, upsert)
  - `server/functions/emailSearchBot.ts` — AI-powered email discovery (single/batch/background, Claude-based search + validation)
  - `server/functions/stubs.ts` — Placeholder handlers for functions pending full migration
  - `server/middleware/auth.ts` — JWT auth middleware (authMiddleware, adminOnly)
- `src/` — React frontend
  - `src/api/client.js` — Drop-in API client replacing Base44 SDK
  - `src/api/base44Client.js` — Re-exports from client.js for backward compat
  - `src/lib/AuthContext.jsx` — Auth context (JWT-based)
  - `src/pages/Login.jsx` — Login/signup page
- `uploads/` — Uploaded file storage
- `functions/` — Legacy Base44 serverless functions (reference only)
- `drizzle.config.ts` — Drizzle Kit configuration

## Security
- User entity is blocked from generic CRUD routes (password_hash/role not exposed)
- All entity/integration/function routes require JWT authentication
- Sensitive fields (password_hash, role) are stripped from write operations
- File uploads limited to 50MB

## API Client Interface
The frontend API client (`src/api/client.js`) mirrors the Base44 SDK interface:
- `base44.entities.EntityName.list(sort, limit)` — List entities
- `base44.entities.EntityName.filter(filters, sort, limit)` — Filter entities
- `base44.entities.EntityName.get(id)` — Get entity by ID
- `base44.entities.EntityName.create(data)` — Create entity
- `base44.entities.EntityName.update(id, data)` — Update entity
- `base44.entities.EntityName.delete(id)` — Delete entity
- `base44.entities.EntityName.bulkCreate(items)` — Bulk create
- `base44.entities.EntityName.subscribe(callback)` — Poll for updates
- `base44.auth.me()` / `.login()` / `.signup()` / `.logout()`
- `base44.integrations.Core.InvokeLLM(params)` — AI inference
- `base44.integrations.Core.SendEmail(params)` — Send email
- `base44.integrations.Core.UploadFile(file)` — Upload file
- `base44.functions.invoke(name, params)` — Invoke backend function (returns `{ data: ... }`)

## Entity Table Map (49 entities)
Provider, ProviderLocation, ProviderTaxonomy, LeadScore, ProviderAffiliation, ProviderLocationMatch, ImportBatch, ImportValidationRule, DataQualityScan, DataQualityAlert, DataCleaningRule, OutreachCampaign, OutreachMessage, CampaignTemplate, LeadList, LeadListMember, CMSUtilization, CMSReferral, MedicareFacility, MedicareMAInpatient, CMSHHAStats, CMSSNFStats, MedicareHHAStats, MedicareSNFStats, EnrichmentRecord, AuditEvent, AnalyticsDashboard, ScoringRule, CampaignTask, NPPESQueueItem, NPPESCrawlerConfig, CMSApiConnector, ErrorReport, ReferralPathwayAnalysis, PreferredAgency, ProviderReconciliation, ProviderServiceUtilization, MetricsSnapshot, Campaign, CampaignSequenceStep, SavedFilter, ScheduledReport, ScheduledExport, CustomReport, BackgroundTask, ReconciliationSettings, ReconciliationJob, ImportScheduleConfig, ProviderNPIValidation, ProviderMedicareCompare, ProviderDEASchedules, InpatientDRG, ColumnMappingRule, ApiInteractionLog

## Entity Data Migration Notes
- **CMSUtilization table is EMPTY** (0 rows) — all frontend queries use `ProviderServiceUtilization` (10.5M rows) with field mapping: `data_year→year`, `total_medicare_payment_amt→total_medicare_payment`, `total_unique_benes→total_medicare_beneficiaries`
- **CMSReferral.total_referrals is always NULL** — each row IS a referral; count rows per NPI for volume; parse raw_data flags (HHA/HOSPICE/DME) for type breakdown
- **MedicareMAInpatient, InpatientDRG, MedicareHHAStats, MedicareSNFStats** tables are EMPTY — use `MedicareFacility` entity instead (14M rows with facility_type field)
- **Empty tables (0 rows)**: lead_lists, lead_scores, campaigns, outreach_campaigns, scoring_rules, cms_utilization, inpatient_drg, medicare_hha_stats, medicare_snf_stats, custom_reports, provider_location_matches
- **Database indexes**: idx_psu_data_year (DESC), psu_npi_idx, idx_medfac_created, idx_medicare_facilities_type — critical for sorting queries on large tables
- **Dark theme**: Always use text-slate-300/400, bg-slate-800/900; NEVER use text-slate-600/700/800, bg-white, bg-slate-50. Badge/accent colors: bg-*-900/30 text-*-400 border-*-500/30 (never bg-*-100, border-*-100/200, text-*-800/900). No double-opacity tokens (e.g. bg-red-900/20/50 is invalid).
- **Responsive**: All page wrappers use `p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto`; grids collapse at sm/md; tables need `overflow-x-auto`; Select triggers use `w-full sm:w-[Xpx]`

## Migration Status
- Fully migrated from Base44 SDK to self-hosted PostgreSQL + Express.js + Drizzle ORM
- Frontend API client is a drop-in replacement for Base44 SDK
- Auth system uses JWT with bcrypt password hashing
- AI integration uses Anthropic Claude
- Email integration uses SendGrid
- File upload implemented with Multer
- Admin account: kdeyarmin@comcast.net (role: admin)

### Backend Functions (29 total)
- **Fully migrated**: getDashboardStats (optimized: pg_class estimated totals including facilities + consolidated FILTER queries + 5-min server cache; 7 stat cards: Providers, Locations, Referrals, Utilization, Facilities, Taxonomies, Emails Found; plus emailStats, topStates, imports, dataQuality, proactiveInsights, samples), getDataHealthMetrics, getDataHealthAlerts, nppesCrawler (all 7 actions), triggerImport (with CMS data insertion and resume support), importNPPESFlatFile, emailSearchBot (single/batch/background modes with Claude AI email discovery, validation, and auto-save to provider records), getCMSDatasetCatalog (84 datasets after dedup), getCMSAnalytics (materialized views: mv_cms_util_by_type, mv_cms_top_referrals, mv_cms_facility_types; 10-min server cache; cold ~1s, cached ~60ms), getReferralNetworkData (server-side aggregation from mv_cms_top_referrals + LATERAL joins to providers/locations/taxonomies; returns enriched nodes with state/city/specialty, edges generated client-side by state proximity), getTerritoryData (server-side join of provider_locations+providers+taxonomies+utilization by state; parameterized state filter with re-fetch; returns up to 500 enriched providers sorted by beneficiary volume + availableStates with counts)
- **Fully migrated: runDataQualityScan** — Uses TABLESAMPLE SYSTEM(1%) sampling on providers/locations for performance with 4M+ records; runs 13 quality rules across completeness/accuracy/timeliness/consistency categories; stores results in data_quality_scans.results_summary JSONB (scores, rule_results, summary); creates data_quality_alerts with severity levels; supports actions: run_scan, apply_fix (allowlisted columns only), dismiss, auto_fix_eligible, assistant_query (Claude AI), analyze_patterns (Claude AI); frontend reads scan data via results_summary object
- **Stub handlers** (return placeholder responses): validateDataQuality, enrichProviderWithAI, analyzeReferralPathways, matchProvidersToLocations, generateScheduledReport, testCMSUrl, predictImportFormat, testCMSApiConnector, enrichProviderThirdParty, verifyProviderEmail, bulkVerifyEmails, enrichProviderMedicareData, validateProviderNPI, enrichProviderDEAData, cleanProviderData, analyzeProviderNetwork, reconcileProviderData, generateHyperPersonalizedMessages, trackCampaignMetrics, sendCampaignMessages, calculateOutreachScore, analyzeImportedDataset, aiProjectAnalysis
- **Security**: triggerImport requires admin role; file_url restricted to CMS government domains; crawler uses atomic task claiming to prevent duplicate processing
- **Email Bot improvements**: Best email selection ranks by validation quality (valid>risky>unknown>invalid) then confidence (high>medium>low); background task metadata preserves total_items through completion; stale isRunning state auto-clears via task status polling
- **Crawler improvements**: Worker execution window 55s (was 25s) to reduce re-invocation overhead; API cache has periodic expiry pruning; activeWorkerCount guard caps concurrent workers at 3 to prevent unbounded setTimeout chains
- **Credential exclusion**: `excluded_credentials` JSONB column on `nppes_crawler_configs`, `excluded_rows` integer column on `import_batches`. Both crawler and flat file importer normalize credentials (strip periods, uppercase, trim) and do exact string match. `ExcludedCredentialsCard` on NPPESCrawlerSettings page provides ~50 pre-populated credentials in 14 categories with badge-based UI. Excluded counts shown in BatchDetailPanel, LiveProgressCard, ImportMonitoring, and ValidationResults.

### Import System
- **CMS API imports**: Fetches data from CMS government APIs and inserts into PostgreSQL tables (cmsReferrals, providerServiceUtilization, medicareFacilities)
- **Data mapping**: CMS order/referring → cmsReferrals; provider utilization → providerServiceUtilization; hospice/SNF/nursing → medicareFacilities
- **Supported datasets (85 total)**: 9 categories — Physicians & Clinicians, Doctors & Clinicians (national file, MIPS, group measures), Hospitals (HCAHPS, timely care, imaging, spending, HAC, psychiatric, ASC, joint replacement), Home Health (HHCAHPS, zip data), Hospice (zip data), Nursing Homes & SNF (ownership, fire safety, health deficiencies, MDS quality, claims quality, SNF quality reporting), Dialysis (ICH CAHPS survey), Other Facilities (IRF general/provider, LTCH general/provider), Medicare Programs
- **Field mapping**: `mapMedicareFacilityRow` handles provider_id extraction from CCN, NPI, Prscrbr_NPI, Case_ID, etc.; `deriveStatisticalId` generates synthetic IDs for aggregate datasets (CBSA, taxonomy crosswalk); all IDs truncated to varchar(50)
- **Pause/Resume support**: All import types (CMS API, NPPES flat file, NPPES crawler) support pause/resume. CMS imports check batch status every 5 pages. Flat file imports check every 5 bulk inserts (5,000 rows). Crawler uses `batch_pause`/`batch_resume` actions. Progress (offsets, headers, byte positions) is saved on pause for seamless resume. Frontend `BatchActionButtons` and `ResumeImportButton` handle all import types including flat file byte-offset resume.
- **Stall detection**: Server startup checks for batches stuck in "processing" >15 min and marks them failed
- **Error handling**: 5 consecutive fetch failures → auto-fail (was 3); fetch timeout 60s (90s for offsets >500K); exponential backoff on retries (3s→6s→12s→24s→30s cap); rate limit (429) → 10s backoff; chunk insert failures → row-by-row fallback
- **DB resilience**: All import systems (CMS, NPPES flat file, NPPES crawler, IntelBot) use retry wrappers (`safeImportQuery`, `safeFlatFileQuery`, `safeCrawlerQuery`, `safeDbQuery`) that retry DB operations 3x with escalating backoff (2s/4s/6s). CMS imports have 50ms inter-page delay (optimized from 200ms) with progress updates every 5 pages. CMS insert chunk size is 500 rows. NPPES flat file bulk insert size is 1,000 rows. Crawler provider bulk size is 250, location/taxonomy bulk size is 300, with 50ms inter-task delay. Startup recovery uses `safeStartupQuery` and staggers CMS imports by 5s each. Crawler workers auto-restart up to 5x on crash via `processQueueWorkerWithRestart`. IntelBot stale threshold is 10 minutes (not 2).
- **DB pool**: max 50 connections, 20s idle timeout, 20s connection timeout (server/db/index.ts)
