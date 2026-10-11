# CLAUDE.md

Guidance for working in this repository. For the exhaustive feature-by-feature
architecture, security model, and DB performance notes, see `replit.md` — this
file is the practical quick reference.

## What this is

CareMetric AI Intelligence: a healthcare provider intelligence / CRM /
analytics platform. Three layers:

1. **`src/`** — React 18 + Vite SPA. Pages are auto-registered in
   `src/pages.config.js`; the frontend talks to the same-origin `/api`.
2. **`server/`** — Express 5 API (TypeScript via `tsx`, port 3001): generic
   entity CRUD, a function dispatcher, and integration endpoints.
3. **`base44/functions/`** — Base44 **Deno** edge functions (cron driver,
   import lifecycle hooks, maintenance workers). These are NOT Node — they use
   `npm:`-prefixed imports and run on the Base44 platform.

## Commands

```bash
npm run dev:full     # API + Vite together (Vite :5000 proxies /api → :3001)
npm run dev          # Vite only; pair with `npm run dev:api`
npm run typecheck    # tsc -p ./jsconfig.json
npm run lint         # eslint . --quiet
npm test             # vitest run
npm run build        # production SPA build
npm run db:migrate   # apply drizzle/ migrations (baselines a pushed DB first)
npm run db:status    # list applied / pending migrations
npm run db:seed-demo # deterministic demo data (local databases only)
npm run geo:load     # load bundled Census geography (also automatic at boot)
```

Before pushing, run `npm run lint && npm run typecheck && npm test && npm run
build` — that is exactly what CI (`.github/workflows/ci.yml`) gates on.

## Where things live

- **Pages:** `src/pages/*.jsx`. `pages.config.js` is **auto-generated** — only
  `mainPage` is hand-editable; do not add imports or edit the `PAGES` map by hand.
- **Navigation:** `src/components/layout/navConfig.js` is the one source for
  the sidebar, page access and nav highlighting. Pages without a sidebar entry
  must belong to one (`SECONDARY_PAGES` or a `PAGE_GROUPS` tab strip, rendered
  by `PageTabs`); a test fails on orphan pages. When you merge or rename a
  page, add the old name to `LEGACY_REDIRECTS` (query string is kept) rather
  than keeping an alias page.
- **Frontend API client:** `src/api/client.js` (re-exported as `base44` from
  `src/api/base44Client.js`). It mirrors the Base44 SDK shape
  (`base44.entities.X.list/filter/...`, `base44.functions.invoke(...)`).
- **Backend functions:** dispatched in `server/routes/functions.ts`; handlers in
  `server/functions/*.ts`.
- **DB schema:** `server/db/schema.ts` (Drizzle). Migrations in `drizzle/`,
  applied by `server/db/migrate.ts`. Large-table indexes are built at boot by
  `server/lib/bootIndexes.ts`, not by migrations.
- **AI models:** centralized in `server/lib/aiModels.ts` — never hardcode model
  IDs. Overridable via `CLAUDE_MODEL_SONNET` / `_HAIKU` / `_OPUS` /
  `_ASSISTANT` env vars. The assistant's model is kept out of `/ai/invoke`.
- **AI Assistant:** `server/lib/assistant/` (tools, streaming loop, store) and
  `server/routes/assistant.ts` (`/api/assistant`, owner-only, SSE). Its tools
  call the same handlers the pages use; the only write is `propose_lead_list`,
  which the user confirms. Conversation history is append-only and replayed
  verbatim (thinking blocks included), so never edit stored messages, and keep
  `SYSTEM_PROMPT` and the tool list free of per-request values.
- **Import health / auto-retry UI:** `src/components/imports/` (`retryStatus.js`,
  `healthMetrics.js`, `MaintenanceHealthPanel.jsx`).

## Conventions

- **Dark theme only:** `text-slate-300/400`, `bg-slate-800/900`; accents
  `bg-*-900/30 text-*-400 border-*-500/30`. Page wrappers:
  `p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto`.
- **Function authorization is default-deny:** `server/routes/functions.ts` keeps
  a `PUBLIC_FUNCTIONS` allowlist; any function not on it is admin-only. Adding a
  function is an explicit security decision — only list it as public if it is
  safe and read-only.
- **Entity ACL:** sensitive entities are admin-only for read and write; a
  whitelist of collaborative entities allows non-admin writes. The `User` entity
  is excluded from generic CRUD.
- **Accounts:** `users.status` is `pending` (signed up, awaiting approval),
  `invited`, `active` or `disabled`. The JWT carries only `{id, tv}`;
  `authMiddleware` reads role/status/token_version live (30s cache in
  `server/lib/sessionUsers.ts`, invalidated on admin changes), so role changes
  and disabling apply without a new sign-in. Bumping `token_version` ends every
  session. Accounts are managed through `/api/admin/users`
  (`server/routes/adminUsers.ts`), not the entity API. Public auth screens live
  in `src/components/auth/` (anything in `src/pages/` becomes a protected route).
- **Audit:** server code writes `recordAudit()` (`server/lib/audit.ts`). The
  browser records its own actions with `base44.audit.record(type, details)`
  (`POST /api/audit`, allowlisted types); it can't write `AuditEvent` directly.
- **Edge-function helpers are unit-tested from Node:** pure logic lives in
  `base44/functions/<fn>/helpers.ts` so it can be imported by `tests/` without
  booting Deno. The frontend mirrors some of this logic (e.g. `retryStatus.js`
  mirrors `autoRetryFailedImports/helpers.ts`) — keep the two in sync.
- **Analytics over the big tables come from rollups.** `server/lib/rollups`
  scans a source table in primary-key chunks (each its own short query under a
  statement timeout), accumulates small totals in memory and anything that
  grows with the table (distinct providers, every referral target) in session
  temp tables (`Staging`), and swaps a small `rollup_*` table in one transaction; `refreshRollups` (fan-out worker, daily per job) queues
  due jobs one at a time. Add a job there instead of a `GROUP BY` in a request.
- **Geography:** counties and ZIP areas come from the bundled 2020 Census
  files in `server/data/census` (built by `scripts/census/build-census-geo.ts`,
  checked against `manifest.json`), loaded into `geo_*` tables and read through
  `server/lib/geo.ts` (`resolveCounty`, `countyZctas`, `zipToCounty`,
  `coordsFor`). Don't hardcode coordinates or county lists. Browser code gets
  map positions from `getZipCoordinates` (`useProviderCoords`) and a
  provider's county from `getGeoContext`.
- **Scores are never invented.** Territory and County Intel show a provider's
  `lead_scores` score, else `ai_outreach_score`, else "Unscored" (`null`,
  never 0); see `pickScore()` in `server/lib/territory.ts`.
- **Specialty groups:** match specialties by NUCC code with
  `specialtyGroupFor()` (`server/lib/specialtyGroups.ts`, mirrored in
  `src/lib/specialtyGroups.js`; a parity test keeps them identical), not by
  free text: NPPES says "Internal Medicine, Cardiovascular Disease", never
  "Cardiology".

## Gotchas

- **Big tables.** `provider_locations` (~12M rows), `providers` (~6M),
  `medicare_facilities` (~46M). Avoid `DISTINCT`/`GROUP BY`/full scans on these.
  Use raw `pool.connect()` with `SET statement_timeout`, `pg_class` estimates for
  counts, `LIMIT`-based sampling, and IN-clauses with pre-fetched NPI lists
  instead of JOINs/subqueries. See the DB performance notes in `replit.md`.
  Search goes through `server/lib/providerSearch.ts` / `locationSearch.ts`;
  their expression indexes live in `server/lib/searchIndexes.ts`, and a query
  only uses one when it repeats the expression exactly (`lower(last_name)`,
  `left(zip, 5)`, …). `ILIKE` on these tables can't use an index.
- **Migrations are hand-written.** `drizzle/meta` snapshots stop at 0002, so
  `db:generate` doesn't produce usable diffs. Write `drizzle/NNNN_name.sql`
  idempotently (`IF NOT EXISTS`), append a journal entry with a larger `when`
  (the migrator skips anything older than the last applied entry), and keep
  `schema.ts` in step. `tests/drizzleMigrations.test.ts` checks the journal.
  Never run `db:push` against a shared or production database: it drops the
  boot-built indexes because they aren't in `schema.ts`.
  `DB_MIGRATE_ON_BOOT=true` makes the server migrate before listening.
- **Secrets.** `JWT_SECRET` is required in production (server hard-fails without
  it). `ADMIN_EMAIL` + `ADMIN_PASSWORD` seed the first admin.
- **Maintenance is cron-driven.** Point the scheduler at the Express endpoint
  `POST /api/maintenance/runScheduledImports` (header `x-maintenance-token`;
  `server/routes/maintenance.ts`). Each tick it fans out the workers in
  `FANOUT_WORKERS` (`server/lib/maintenance.ts`: `autoResumePausedImports`,
  `autoRetryFailedImports`, `manageCrawlerRetries`, `cancelStalledImports`,
  `runDueScheduledReports`, `refreshRollups`) and writes a
  `maintenance_fanout` `AuditEvent` heartbeat that `MaintenanceHealthPanel`
  surfaces. If the cron isn't wired, those workers don't run (and rollups never
  refresh). The legacy Deno `base44/functions/runScheduledImports` only knows
  the first four; don't use it as the cron entrypoint.
- **Component tests need jsdom.** Add `// @vitest-environment jsdom` at the top
  of the test file; the default environment is `node`.
