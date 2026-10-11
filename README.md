# CareMetric AI Intelligence

A healthcare provider intelligence, CRM, and analytics platform. CareMetric
ingests Medicare/CMS datasets and the NPPES registry, then surfaces provider
and facility intelligence, referral networks, lead lists, multi-channel
outreach, and AI-driven insights.

## Tech stack

- **Frontend:** React 18 + Vite 6, TailwindCSS, Radix UI / `shadcn/ui`,
  TanStack React Query, React Router v7, Recharts, Leaflet.
- **Backend API:** Express 5 (TypeScript via `tsx`) on port `3001` — generic
  entity CRUD, a function dispatcher, and integration endpoints.
- **Database:** PostgreSQL with Drizzle ORM (52 tables). Migrations in
  `./drizzle/`.
- **Edge functions:** Base44 Deno functions in `base44/functions/` for
  scheduled imports, maintenance fan-out, and import lifecycle hooks.
- **AI:** Anthropic Claude (`@anthropic-ai/sdk`). **Email:** SendGrid.
  **Uploads:** Multer.

## Architecture at a glance

```
src/                 React SPA (pages auto-registered via pages.config.js)
  api/client.js      Base44-SDK-compatible client → talks to /api (same origin)
server/              Express API (port 3001)
  routes/            auth, entities (generic CRUD), integrations, functions
  functions/         backend function handlers (dispatched by routes/functions.ts)
  db/                Drizzle schema + pool
  middleware/        JWT auth, rate limiting
base44/functions/    Deno edge functions (cron driver, import hooks, workers)
drizzle/             generated SQL migrations
tests/               Vitest suite (node + jsdom)
```

In development, Vite (port `5000`) proxies `/api` to the Express server
(`localhost:3001`); the frontend always talks to the same-origin `/api`.

## Prerequisites

- Node.js 20+ (CI runs on Node 22)
- A PostgreSQL database

## Setup

1. Clone the repository and install dependencies:

   ```bash
   npm install
   ```

2. Create a `.env` file from the template and fill in values:

   ```bash
   cp .env.example .env
   ```

   Only `DATABASE_URL` is required to boot in development. Production
   additionally requires `JWT_SECRET` (the server refuses to start without it).
   See `.env.example` for the full, documented list (admin seed, CORS,
   Anthropic, SendGrid, model overrides).

3. Apply the migrations, and optionally load demo data (local databases only):

   ```bash
   npm run db:migrate
   npm run db:seed-demo
   ```

4. Start the app (runs the API and Vite together):

   ```bash
   npm run dev:full
   ```

   Open http://localhost:5000.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev:full` | Run the Express API (`tsx watch`) and Vite dev server together |
| `npm run dev:api` | API only |
| `npm run dev` / `dev:frontend` | Vite only |
| `npm run build` | Production build of the SPA |
| `npm run preview` | Preview the production build |
| `npm run lint` / `lint:fix` | ESLint |
| `npm run typecheck` | TypeScript check (`tsc -p ./jsconfig.json`) |
| `npm test` | Run the Vitest suite |
| `npm run db:migrate` | Apply `drizzle/` migrations; a database built with `db:push` is baselined first |
| `npm run db:status` | List applied and pending migrations |
| `npm run db:seed-demo` | Load deterministic demo data (refuses non-local databases) |
| `npm run db:push` | Push `schema.ts` directly. Scratch databases only: it drops the indexes the server builds at boot |
| `npm run db:generate` | Not usable for new migrations (snapshots stop at 0002); write them by hand |

## Testing & CI

Tests use [Vitest](https://vitest.dev/). Most run in the default `node`
environment; component tests opt into jsdom with a
`// @vitest-environment jsdom` docblock and use React Testing Library. Shared
setup lives in `tests/setup.js`.

GitHub Actions (`.github/workflows/ci.yml`) runs **lint → typecheck → test →
build** on every pull request (any base branch) and on pushes to `main`.

## Deployment

Configured for Replit autoscale (`.replit`): `npm run build` then
`NODE_ENV=production node --import tsx server/index.ts` (also `npm start`).
In production the Express server serves the built SPA from `dist/`
same-origin, so set `JWT_SECRET` and (if serving a separate frontend origin)
`ALLOWED_ORIGINS`.

### Railway

The repo carries `railpack.json`; a Railway service builds with `npm ci &&
npm run build` and starts with `npm start`. Add a Postgres plugin
(`DATABASE_URL`), a volume mounted at `/app/uploads` for file uploads,
`DB_MIGRATE_ON_BOOT=true`, and the secrets from `.env.example`.

### Selling subscriptions

Every account belongs to an organization (migration 0020): signing up creates
one in a 14-day trial with the signer as its owner, and the account is
activated by a platform admin's approval or by checkout. Owners manage their
organization's people (within the plan's seat limit), campaigns and billing;
platform admins (`users.is_platform_admin`) operate the shared data and see
every organization. Plans live in the `plans` table (county pack, state,
national) and set the territory the County, Market, Territory and
referral-source views answer for, the seat limit and the daily quotas (AI
requests, exports, outreach emails) counted in `org_usage`. Billing is Stripe
Checkout plus the customer portal (`/api/billing`), with subscription events
on `/api/webhooks/stripe`; set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
and a price id per plan (`STRIPE_PRICE_<CODE>` or `plans.stripe_price_id`).
The public Terms, Privacy and Data Use pages are at `/terms`, `/privacy` and
`/data-use`; signup records the accepted terms version.

### Keeping the data fresh

Nothing imports or refreshes without a maintenance tick. Either point a cron
(a Railway cron service, a Replit Scheduled Deployment, system cron) at
`sh scripts/maintenance-tick.sh` every 10 minutes with `MAINTENANCE_URL` and
`MAINTENANCE_TOKEN` set, or set `MAINTENANCE_INPROCESS_INTERVAL_MS=600000` on
the server. Each tick starts the import schedules that are due, settles the
ones whose batches finished, checks the CMS catalogs once a day for newer
dataset releases (schedules with frequency *on release* import them
automatically), retries and resumes imports, sends due reports and refreshes
the analytics rollups. The Import Monitor's Health tab shows the last tick;
the Dataset catalog page shows each dataset's data year and import date.

Provider records come from the NPPES dissemination files (import types
`nppes_weekly_incremental` and `nppes_monthly_full`). A weekly schedule keeps
them current: the importer downloads the current zip from CMS into
`uploads/nppes/`, streams the CSV out of it, updates every provider in the
file, replaces its locations and taxonomies, and marks deactivated NPIs. The
monthly full file is about 1.1 GB zipped and needs the uploads volume.

### Central CareMetric support

The local `/Help` guide remains the fallback in every environment. On the
verified production app only (Base44 app `6993c62145573ca8a97ad4a9` at
`caremetricintel.com`), the page also offers a launcher to CareMetric's
first-party Support Hub at
`https://support-hub-web-production.up.railway.app/help` for product
`caremetric-intel`. The launcher accepts no runtime arguments and sends only
the static product, route, locale, and environment labels; it never forwards a
user, tenant, provider, patient, record, current URL query/hash, token, or free
text. An explicit `VITE_CENTRAL_SUPPORT_HUB_ENABLED` value other than `true`
disables only the external launcher; the central phone and email remain visible
on the verified production Help page during a Hub outage.

Central software support is `(877) 521-2890` (`+18775212890`) and
`support@caremetric.ai`. Support requests must not include patient information
or other protected health information.

Regenerate the static guide inventory only from a committed guide revision:

```bash
SOURCE_COMMIT=$(git rev-parse HEAD) node scripts/generate-help-inventory.mjs
```

The generator deliberately refuses to run without the full source commit so a
future guide change cannot silently retain stale provenance.

## Further reading

- **`replit.md`** — the deep architecture reference: feature-by-feature
  breakdown, security model, database performance notes, and changelog.
- **`CLAUDE.md`** — a practical guide for working in this repo (commands,
  conventions, and gotchas).
