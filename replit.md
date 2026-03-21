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
- Sales & Outreach (Project Management, Lead Lists, Email Bot, Campaigns, Outreach)
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

## Migration Status
- Fully migrated from Base44 SDK to self-hosted PostgreSQL + Express.js + Drizzle ORM
- Frontend API client is a drop-in replacement for Base44 SDK
- Auth system uses JWT with bcrypt password hashing
- AI integration uses Anthropic Claude
- Email integration uses SendGrid
- File upload implemented with Multer
- Admin account: kdeyarmin@comcast.net (role: admin)

### Backend Functions (29 total)
- **Fully migrated**: getDashboardStats (optimized: pg_class estimated totals + consolidated FILTER queries + 5-min server cache; full dashboard shape: counts, emailStats with real searched/valid/risky/invalid counts, topStates, imports, dataQuality, proactiveInsights, samples), getDataHealthMetrics, getDataHealthAlerts, nppesCrawler (all 7 actions), triggerImport (with CMS data insertion and resume support), importNPPESFlatFile, emailSearchBot (single/batch/background modes with Claude AI email discovery, validation, and auto-save to provider records), getCMSDatasetCatalog
- **Stub handlers** (return placeholder responses): validateDataQuality, runDataQualityScan, enrichProviderWithAI, analyzeReferralPathways, matchProvidersToLocations, generateScheduledReport, testCMSUrl, predictImportFormat, testCMSApiConnector, enrichProviderThirdParty, verifyProviderEmail, bulkVerifyEmails, enrichProviderMedicareData, validateProviderNPI, enrichProviderDEAData, cleanProviderData, analyzeProviderNetwork, reconcileProviderData, generateHyperPersonalizedMessages, trackCampaignMetrics, sendCampaignMessages, calculateOutreachScore, analyzeImportedDataset, aiProjectAnalysis
- **Security**: triggerImport requires admin role; file_url restricted to CMS government domains; crawler uses atomic task claiming to prevent duplicate processing
- **Email Bot improvements**: Best email selection ranks by validation quality (valid>risky>unknown>invalid) then confidence (high>medium>low); background task metadata preserves total_items through completion; stale isRunning state auto-clears via task status polling
- **Crawler improvements**: Worker execution window 55s (was 25s) to reduce re-invocation overhead; API cache has periodic expiry pruning; activeWorkerCount guard caps concurrent workers at 3 to prevent unbounded setTimeout chains

### Import System
- **CMS API imports**: Fetches data from CMS government APIs and inserts into PostgreSQL tables (cmsReferrals, providerServiceUtilization, medicareFacilities)
- **Data mapping**: CMS order/referring → cmsReferrals; provider utilization → providerServiceUtilization; hospice/SNF/nursing → medicareFacilities
- **Supported datasets**: hospital_cost_report, inpatient, outpatient, Part D drugs, market_saturation_county, market_saturation_cbsa, provider_taxonomy_crosswalk, hospital_price_transparency, medicare_part_d_prescribers, medicare_fee_for_service_enrollment, hospice/home_health state measures, and more
- **Field mapping**: `mapMedicareFacilityRow` handles provider_id extraction from CCN, NPI, Prscrbr_NPI, Case_ID, etc.; `deriveStatisticalId` generates synthetic IDs for aggregate datasets (CBSA, taxonomy crosswalk); all IDs truncated to varchar(50)
- **Resume support**: Failed/stalled imports can be resumed from their last offset via batch_id parameter; frontend ResumeImportButton supported
- **Stall detection**: Server startup checks for batches stuck in "processing" >15 min and marks them failed
- **Error handling**: 3 consecutive fetch failures → auto-fail; rate limit (429) → 10s backoff; chunk insert failures → row-by-row fallback
