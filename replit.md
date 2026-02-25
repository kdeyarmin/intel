# CareMetric AI Intelligence

## Overview
A React/Vite frontend application built on the Base44 SDK for provider intelligence, CRM, and analytics. The app is a healthcare provider data platform with features for provider management, lead lists, email campaigns, CMS analytics, and AI-powered insights.

## Architecture
- **Frontend**: React 18 + Vite 6, using TailwindCSS and Radix UI components
- **Backend/Data**: Base44 SDK (cloud-hosted backend via `@base44/sdk`)
- **State Management**: TanStack React Query
- **Routing**: React Router v6
- **UI Components**: shadcn/ui component library with Radix UI primitives

## Key Sections
- Dashboard with provider database stats
- Provider management (All Providers, Locations, Territory Map)
- Sales & Outreach (Lead Lists, Email Bot, Campaigns, Outreach)
- Analytics (CMS Data, Network, Advanced)
- AI Assistant and AI enrichment tools
- Data imports from Medicare/CMS datasets

## Configuration
- Vite dev server: `0.0.0.0:5000`, `allowedHosts: true` (required for Replit proxy)
- Base44 App ID configured via `VITE_BASE44_APP_ID` environment variable (set as env var, not just a secret)
- Base44 API proxy: `VITE_BASE44_APP_BASE_URL` must be set to `https://base44.app` for the Vite dev proxy to route `/api` calls to the Base44 backend (handled by `@base44/vite-plugin`)
- Deployment: Static site (build: `npm run build`, publicDir: `dist`)

## Running the App
```bash
npm run dev
```
App runs on port 5000.

## Build
```bash
npm run build
```
Output goes to `dist/` directory.

## Import Functions (functions/ directory)
These are Base44 serverless functions (Deno-based) that handle data imports:

### Medicare ZIP-Based Imports (download ZIP/XLSX from CMS)
- `importMedicareHHA.ts` - Home Health Agency stats (entity: MedicareHHAStats)
- `importMedicareMAInpatient.ts` - Medicare Advantage Inpatient (entity: MedicareMAInpatient)
- `importMedicarePartD.ts` - Part D aggregate stats (entity: MedicarePartDStats)
- `importMedicareSNF.ts` - Skilled Nursing Facility stats (entity: MedicareSNFStats)

### CMS API-Based Imports (JSON API pagination)
- `autoImportCMSData.ts` - Handles: cms_order_referring, opt_out_physicians, hospice_enrollments, home_health_enrollments, provider_service_utilization, cms_part_d, hospital_general_info, nursing_home_compare, home_health_compare, provider_ownership, dmepos_suppliers, medicare_inpatient_charges, medicare_outpatient_charges

### NPPES/Special Imports
- `triggerImport.ts` routes `nppes_monthly` → `importNPPESFlatFile`, `nppes_registry` → `nppesCrawler`

### Orchestration
- `triggerImport.ts` - Central dispatcher routing to ZIP handlers, special handlers (NPPES), or autoImportCMSData
- `runScheduledImports.ts` - Runs scheduled imports from ImportScheduleConfig
- `cancelStalledImports.ts` - Auto-retries or fails stalled imports
- `importNPPESFlatFile.ts` - Streaming CSV processor for NPPES flat files

### NPPES Crawler (nppesCrawler.ts)
- `MAX_EXEC_MS = 45000` (45s) per worker invocation; workers self-re-invoke with `await` (not setTimeout) for reliable chaining
- `batch_start` caps concurrency at 3, staggers worker launches by 2s to prevent rate-limit storms
- Queue items with transient errors (429/timeout/network) auto-retry up to 5 times by being set back to `pending`
- 500ms delay between NPPES API page fetches to reduce rate limiting
- Frontend `BatchProcessPanel` polls every 15s for live batch status instead of treating initial response as final
- Per-state results show Processing/Success/Failed badges with live updates

### Import Resilience
- All import functions save records incrementally in chunks (25-50 records)
- On failure, the current offset and imported row count are saved in `retry_params` and `cancel_reason`
- Failed/paused batches can be resumed from where they left off via the Resume button (uses `resume_offset`/`row_offset`)
- Records committed before a failure remain in the database; resume skips already-processed rows

### Numeric Field Clamping (Out of Range Protection)
- All 4 Medicare ZIP importers (`importMedicareHHA`, `importMedicareMAInpatient`, `importMedicarePartD`, `importMedicareSNF`) and `autoImportCMSData` have `clampNumericFields()` applied before database writes
- Numeric values are clamped to Int32 range (−2,147,483,647 to 2,147,483,647) to prevent "Out of Range" database errors
- String values are truncated to 500 chars max
- In `importMedicareHHA.ts`, there is also a separate `FIELD_LIMITS` + `clampRecord()` system with per-field limits

### Dashboard Stats
- `getDashboardStats.ts` paginates through all entity records for exact counts (no more 500-record caps)
- `DatabaseOverview.jsx` displays exact numbers without the "+" estimated indicator

### Email Search Bot
- `emailSearchBot.ts` - AI-powered email discovery: paginates through ALL providers (no page cap), searches using LLM with internet context, validates results; 25s scan timeout prevents Deno timeouts on large datasets
- `bulkVerifyEmails.ts` - Bulk email verification: paginates through ALL providers (no page cap), runs DNS/AI validation in batches; same 25s scan timeout
- Both frontend search and verification auto-loop through all batches without user intervention (with Stop button and progress tracking)
- `has_more` logic: based on actual `totalEligibleRemaining` count + `reachedEndOfProviders` flag — no false-negative stops

### URL Monitoring
- `checkCMSUrls.ts` - Scans CMS data.json for updated dataset URLs
- `checkPartDUrl.ts` - Probes Part D URL variants
- `checkSNFUrls.ts` - Probes SNF URL variants
