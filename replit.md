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

### CMS Import Reliability Features (applied to all importers)
- **clampNumericFields**: Financial fields clamped to MAX_FLOAT (999999999999.99), count fields to MAX_INT (2147483647) — prevents "Out of Range" errors
- **raw_data stored as strings**: All raw_data JSON values converted to strings before storage — prevents integer overflow in JSON serialization
- **Rate-limit circuit breaker**: After 3 consecutive rate-limited chunks, import auto-pauses with resume offset saved
- **bulkCreateWithRetry**: 5 attempts with jittered exponential backoff for all bulk operations
- **Inter-chunk delay**: 1200ms minimum between chunks to prevent platform rate limiting
- **Auto-resume**: Timed-out imports automatically invoke themselves with resume_offset to continue where they left off

### Key Function Categories
- **Import orchestration**: triggerImport, autoImportCMSData, runScheduledImports, cancelStalledImports
- **Medicare ZIP importers**: importMedicareHHA, importMedicareMAInpatient, importMedicarePartD, importMedicareSNF
- **NPPES**: nppesCrawler, importNPPESFlatFile, validateNPPESBatch, manageCrawlerRetries, retryFailedNPPESStates
- **Enrichment**: enrichProviderData, enrichProviderWithAI, enrichProviderThirdParty, enrichProviderMedicareData, enrichProviderDEAData, providerEnrichmentApi, autoEnrichProvider
- **Email**: emailSearchBot, bulkEmailLookup, verifyProviderEmail, deduplicateProviderEmails
- **Data quality**: runDataQualityScan, validateDataQuality, cleanProviderData, reconcileProviderData, checkDataQualityAlerts
- **URL monitoring**: checkCMSUrls, checkSNFUrls, testCMSAPI, testCMSUrl, testCMSOffset, testCMSApiConnector
- **Campaigns**: sendCampaignMessages, trackCampaignMetrics, generatePersonalizedOutreach, generateHyperPersonalizedMessages
- **Analytics**: calculateProviderScore, calculateOutreachScore, analyzeProviderNetwork, getDashboardStats, getDataHealthMetrics, captureMetricsSnapshot
- **Event-driven**: onImportBatchCompleted, onImportBatchFailed, onRuleCreated
- **Other**: predictImportFormat, findEmail, matchProvidersToLocations, sendErrorNotification, generateScheduledReport, generateDataQualityReport
