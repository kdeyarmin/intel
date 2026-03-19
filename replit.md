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
- Base44 App ID configured via `VITE_BASE44_APP_ID` environment variable
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

## Source: GitHub
Codebase imported from `kdeyarmin/intel` GitHub repository.

## Backend Functions (functions/ directory)
Base44 serverless functions (Deno-based) — 66 functions total, covering imports, enrichment, data quality, email search, campaigns, and more.

### CMS Import Reliability Features (applied consistently to ALL importers)
- **clampNumericFields**: Financial fields clamped to MAX_FLOAT (999999999999.99), count fields to MAX_INT (2147483647) — prevents "Out of Range" errors
- **raw_data stored as strings**: All raw_data JSON values converted to strings before storage — prevents integer overflow in JSON serialization
- **Rate-limit circuit breaker**: After 3 consecutive rate-limited chunks, import auto-pauses with resume offset saved (both ZIP importers and autoImportCMSData)
- **bulkCreateWithRetry**: 5 attempts with jittered exponential backoff for all bulk operations (standardized across all importers)
- **Inter-chunk delay**: 1200ms between data chunks, 1500ms between API pages — prevents platform rate limiting
- **Auto-resume**: Timed-out imports automatically invoke themselves with resume_offset to continue where they left off
- **fetchWithRetry**: All ZIP downloaders (HHA, SNF, MA Inpatient) use 3-attempt fetch with AbortController timeout (30s) and exponential backoff
- **CSV parser**: Proper RFC-compliant quoted-field handling for CSV fallback in autoImportCMSData
- **Cross-page dedup**: Global dedup set persists across API pages in autoImportCMSData (not page-local)
- **safeNum returns null**: Missing/blank/suppressed values return `null` not `0` to avoid inflating data
- **Error sample cap**: 25 samples across all importers for consistent debugging
- **Year-URL maps**: HHA, SNF, and MA Inpatient all have multi-year URL maps with LATEST_AVAILABLE_YEAR fallback
- **Delete-before-import**: Parallelism reduced from 50 to 10 concurrent deletes, with rate-limit circuit breaker (3 strikes) and 300ms inter-batch delay
- **Download heartbeat**: All ZIP importers update `updated_date` before and after download to prevent stalled-import false positives
- **In-loop heartbeat**: All ZIP importers update `updated_date` + `imported_rows` every 5 chunks during import processing
- **Numeric fields parsed**: nursing_home_providers ratings/beds and nursing_home_deficiencies counts use `safeNum()` instead of raw strings
- **home_health_national_measures**: Explicit field mapping (measure_name, measure_id, score, etc.) instead of dynamic catch-all
- **Request body validation**: autoImportCMSData wraps `req.json()` in try/catch returning 400 on malformed body
- **Dynamic year default**: autoImportCMSData defaults to `currentYear - 2` instead of hardcoded 2023
- **ErrorBoundary**: Top-level React ErrorBoundary in App.jsx catches rendering crashes with recovery UI
- **Mapper numeric parsing**: All CMS mappers now use `safeNum()` for numeric fields (score, star_rating, percentage, latitude, longitude) — no more string storage for numbers
- **NPI validation**: hospice_enrollments and home_health_enrollments reject invalid NPIs (consistent with other mappers)
- **Stalled threshold unified**: triggerImport auto-cancel changed from 2h to 1h, matching cancelStalledImports
- **Scheduled year logic**: runScheduledImports uses `currentYear - 2` for CMS data (was using currentYear which returns no data)
- **Import type metadata**: All CMS types in cmsImportTypes.js now have `availableYears` arrays (was missing from 8 types)
- **FileParser unmount safety**: All setTimeout callbacks check mountedRef to prevent state updates on unmounted components
- **LeadListBuilder null safety**: Filter logic guards against null NPI values in provider lookups
- **Dashboard loading skeleton**: RecentActivityCard shows animated skeleton while audit events load
- **cancelStalledImports paused status**: Now checks `paused` batches too — prevents batches stuck forever if auto-resume invoke fails
- **cancelStalledImports retry failure**: If retry invoke fails, batch cancel_reason is updated to reflect the failure
- **getDashboardStats parallel**: All 9 initial data fetches now use Promise.all instead of sequential (major latency improvement)
- **importNPPESFlatFile error recovery**: bulkCreate failures now fall back to individual inserts with logging instead of silently dropping 500 rows
- **onImportBatchFailed audit logging**: Cleaned dead code, now creates AuditEvent records for failed batches
- **Campaigns delete error handling**: handleDelete wrapped in try/catch with toast feedback
- **Dead code cleanup**: Removed unused _isUploading, _fileInputRef (NewImportDialog), _imported (LiveProgressCard)
- **runDataQualityScan import guard**: Auto-delete of providers with no location/taxonomy is now gated on import activity — skips deletion if any import completed within 2h or is currently in progress
- **sendCampaignMessages throttle**: 500ms delay between SendEmail calls to prevent rate limit/spam filter issues
- **verifyProviderEmail auth**: Added admin role check — was previously accessible by any logged-in user
- **enrichProviderMedicareData null scores**: All numeric fields (quality_score, safety_score, etc.) now return null instead of 0 when data is missing — 0 is a valid score
- **InteractiveProviderMap dynamic center**: Map center is now calculated from provider data bounds instead of hardcoded PA coordinates
- **Locations pagination**: Added proper page-based navigation (50 per page) with Previous/Next buttons, replacing the old hidden-100 limit

- **calculateProviderScore null safety**: primaryTaxonomy crash fix — `reasons.push` now guards with `&& primaryTaxonomy` before accessing `.taxonomy_description`; primaryLocation also guarded
- **calculateProviderScore configurable state**: Geographic priority no longer hardcoded to PA — reads `config.target_state` from ScoringRule, falls back to 'PA'
- **onImportBatchCompleted re-trigger guard**: payload_too_large events now check `completed_at` age (>5min = stale, skip) — prevents duplicate triggers on repeated webhook calls
- **onImportBatchCompleted circular dependency guard**: Skips schedules where `import_type === completedImportType` (self-triggering) or `depends_on_import_type === import_type` (self-referencing)
- **BatchActionButtons try/catch**: handlePause, handleCancel, handleSkip all wrapped in try/catch/finally — prevents isActing from staying true on failure (button freeze bug)
- **predictImportFormat SDK version**: Updated from @base44/sdk@0.8.20 to @0.8.21 for consistency with other functions
- **AdvancedAnalytics theme fix**: TabsList changed from bg-slate-100 to bg-slate-800/50 to match app's dark theme
- **LeadListTable variable rename**: `_editingNotes` renamed to `editingNotes` — removing misleading underscore prefix on used state variable

- **AI component error handling**: AIStrategyTab, AISmartTargeting, AISegmentationTab, AIErrorTriage, ProviderAIQualityInsights, AISummary all wrapped in try/catch/finally — loading state now reliably clears on LLM failure
- **analyzeProviderNetwork division-by-zero**: Guarded `specialists.length / npis.length` with length check; network density calculation guarded for `total_providers <= 1`
- **Providers.jsx sort crash**: Name sort now handles undefined `last_name`/`first_name` with `|| ''` fallback and `.trim()`
- **Providers.jsx location search**: Search filter now includes location city/state matching — selecting a Location suggestion from autocomplete now returns results
- **LiveProgressCard NaN guard**: `getElapsedTime` validates parsed date before arithmetic — invalid date strings return '' instead of NaN
- **LeadLists.jsx error handling**: handleUpdateStatus, handleUpdateNotes, handleRemoveProvider wrapped in try/catch with functional state updates (stale closure fix)
- **ProjectManagement.jsx parallel updates**: handleApplyAll refactored from sequential `for...of` + `await` to `Promise.all` for parallel task assignment updates
- **sendCampaignMessages regex fix**: Template merge keys like `{{provider_name}}` now have curly braces escaped before RegExp construction — was silently failing to replace
- **ReferralSummaryCard NaN guard**: YoY calculation now uses `|| 0` fallback for undefined `total_referrals` — prevents NaN display
- **deduplicateProviderEmails null guard**: `primaryData` from `.find()` now falls back to `{}` before spread — prevents crash when LLM returns slightly different email format
- **Global mutation error handling**: QueryClient now has a default `onError` for all mutations — logs errors for unhandled mutation failures
- **nppesCrawler self-re-invocation fix**: Changed from `await` (blocking chain) to fire-and-forget pattern. Previously each worker awaited the next worker's full response, creating an ever-deepening chain that exceeded function timeouts and killed the worker chain before data was imported
- **nppesCrawler state zip prefix mapping**: Added STATE_ZIP_PREFIXES lookup so queue items are only created for zip prefixes known to exist in each state (e.g., PA gets 15-19 instead of 00-99). Reduces queue items from 100 to 2-7 per state, workers now immediately process prefixes with actual data
- **nppesCrawler upsert error handling**: Provider bulkCreate now has explicit try/catch with individual-create fallback and detailed logging for visibility into silent failures
- **nppesCrawler diagnostic logging**: Added console.log for NPPES API result counts, transformation stats, and upsert outcomes per queue item

### Key Function Categories
- **Import orchestration**: triggerImport, autoImportCMSData, runScheduledImports, cancelStalledImports
- **Medicare ZIP importers**: importMedicareHHA, importMedicareMAInpatient, importMedicareSNF
- **NPPES**: nppesCrawler, importNPPESFlatFile, validateNPPESBatch, manageCrawlerRetries, retryFailedNPPESStates
- **Enrichment**: enrichProviderData, enrichProviderWithAI, enrichProviderThirdParty, enrichProviderMedicareData, enrichProviderDEAData, providerEnrichmentApi, autoEnrichProvider
- **Email**: emailSearchBot, bulkEmailLookup, verifyProviderEmail, deduplicateProviderEmails
- **Data quality**: runDataQualityScan, validateDataQuality, cleanProviderData, reconcileProviderData, checkDataQualityAlerts
- **URL monitoring**: checkCMSUrls, checkSNFUrls, testCMSAPI, testCMSUrl, testCMSOffset, testCMSApiConnector
- **Campaigns**: sendCampaignMessages, trackCampaignMetrics, generatePersonalizedOutreach, generateHyperPersonalizedMessages
- **Analytics**: calculateProviderScore, calculateOutreachScore, analyzeProviderNetwork, getDashboardStats, getDataHealthMetrics, captureMetricsSnapshot
- **Event-driven**: onImportBatchCompleted, onImportBatchFailed, onRuleCreated
- **Other**: predictImportFormat, findEmail, matchProvidersToLocations, sendErrorNotification, generateScheduledReport, generateDataQualityReport
