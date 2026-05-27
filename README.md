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

3. Push the schema to your database:

   ```bash
   npm run db:push
   ```

4. Start the app (runs the API and Vite together):

   ```bash
   npm run dev
   ```

   Open http://localhost:5000.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Run the Express API (`tsx watch`) and Vite dev server together |
| `npm run dev:api` | API only |
| `npm run dev:frontend` | Vite only |
| `npm run build` | Production build of the SPA |
| `npm run preview` | Preview the production build |
| `npm run lint` / `lint:fix` | ESLint |
| `npm run typecheck` | TypeScript check (`tsc -p ./jsconfig.json`) |
| `npm test` | Run the Vitest suite |
| `npm run db:push` | Push schema directly (development) |
| `npm run db:generate` | Generate a migration from schema changes |
| `npm run db:migrate` | Apply migrations (production deploys) |

## Testing & CI

Tests use [Vitest](https://vitest.dev/). Most run in the default `node`
environment; component tests opt into jsdom with a
`// @vitest-environment jsdom` docblock and use React Testing Library. Shared
setup lives in `tests/setup.js`.

GitHub Actions (`.github/workflows/ci.yml`) runs **lint → typecheck → test →
build** on every pull request (any base branch) and on pushes to `main`.

## Deployment

Configured for Replit autoscale (`.replit`): `npm run build` then
`NODE_ENV=production node --import tsx server/index.ts`. In production the
Express server serves the built SPA from `dist/` same-origin, so set
`JWT_SECRET` and (if serving a separate frontend origin) `ALLOWED_ORIGINS`.

## Further reading

- **`replit.md`** — the deep architecture reference: feature-by-feature
  breakdown, security model, database performance notes, and changelog.
- **`CLAUDE.md`** — a practical guide for working in this repo (commands,
  conventions, and gotchas).
