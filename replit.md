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
