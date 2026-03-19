# CareMetric AI Intelligence

## Overview
A React/Vite frontend application for healthcare provider intelligence, CRM, and analytics. The app is a healthcare provider data platform with features for provider management, lead lists, email campaigns, CMS analytics, and AI-powered insights.

## Architecture
- **Frontend**: React 18 + Vite 6, using TailwindCSS and Radix UI components
- **Backend API**: Express.js (port 3001) with generic entity CRUD routes
- **Database**: PostgreSQL + Drizzle ORM (~30 tables)
- **AI**: Anthropic Claude (via `/api/integrations/ai/invoke`)
- **Email**: SendGrid (via `/api/integrations/email/send`)
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
Schema defined in `server/db/schema.ts` (~30 tables).
Connection in `server/db/index.ts`.

## Project Structure
- `server/` — Express.js backend
  - `server/index.ts` — Main Express app
  - `server/db/schema.ts` — Drizzle ORM schema (~30 tables + tableMap)
  - `server/db/index.ts` — Database connection
  - `server/routes/auth.ts` — Auth endpoints (login, signup, me, logout)
  - `server/routes/entities.ts` — Generic entity CRUD (list, filter, get, create, update, delete)
  - `server/routes/integrations.ts` — AI (Claude) and email (SendGrid) endpoints
  - `server/middleware/auth.ts` — JWT auth middleware
- `src/` — React frontend
  - `src/api/client.js` — Drop-in API client replacing Base44 SDK
  - `src/api/base44Client.js` — Re-exports from client.js for backward compat
  - `src/lib/AuthContext.jsx` — Auth context (JWT-based)
- `functions/` — Legacy Base44 serverless functions (being migrated to Express routes)
- `drizzle.config.ts` — Drizzle Kit configuration

## API Client Interface
The frontend API client (`src/api/client.js`) mirrors the Base44 SDK interface:
- `base44.entities.EntityName.list(sort, limit)` — List entities
- `base44.entities.EntityName.filter(filters, sort, limit)` — Filter entities
- `base44.entities.EntityName.get(id)` — Get entity by ID
- `base44.entities.EntityName.create(data)` — Create entity
- `base44.entities.EntityName.update(id, data)` — Update entity
- `base44.entities.EntityName.delete(id)` — Delete entity
- `base44.auth.me()` / `.login()` / `.signup()` / `.logout()`
- `base44.integrations.Core.InvokeLLM(params)` — AI inference
- `base44.integrations.Core.SendEmail(params)` — Send email

## Entity Table Map
The `tableMap` in `server/db/schema.ts` maps frontend entity names to Drizzle tables:
Provider, ProviderLocation, ProviderTaxonomy, LeadScore, ProviderAffiliation, ImportBatch, ImportValidationRule, DataQualityScan, DataQualityAlert, DataCleaningRule, OutreachCampaign, OutreachMessage, CampaignTemplate, LeadList, LeadListMember, CMSUtilization, CMSReferral, MedicareFacility, EnrichmentRecord, AuditEvent, AnalyticsDashboard, ScoringRule, CampaignTask, NPPESQueueItem, NPPESCrawlerConfig, and more.

## Migration Status
- Migrated from Base44 SDK to self-hosted PostgreSQL + Express.js + Drizzle ORM
- Frontend API client is a drop-in replacement for Base44 SDK
- Auth system uses JWT with bcrypt password hashing
- AI integration uses Anthropic Claude
- Email integration uses SendGrid
- Legacy serverless functions in `functions/` directory still reference Base44 SDK (T005 pending)
