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
- Base44 App ID configured via `VITE_BASE44_APP_ID` environment variable
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
- `autoImportCMSData.ts` - Handles: cms_order_referring, opt_out_physicians, hospice_enrollments, home_health_enrollments, provider_service_utilization, cms_part_d

### Orchestration
- `triggerImport.ts` - Central dispatcher routing to ZIP handlers or autoImportCMSData
- `runScheduledImports.ts` - Runs scheduled imports from ImportScheduleConfig
- `cancelStalledImports.ts` - Auto-retries or fails stalled imports
- `importNPPESFlatFile.ts` - Streaming CSV processor for NPPES flat files

### URL Monitoring
- `checkCMSUrls.ts` - Scans CMS data.json for updated dataset URLs
- `checkPartDUrl.ts` - Probes Part D URL variants
- `checkSNFUrls.ts` - Probes SNF URL variants
