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
  `p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto`. For contrast, text is slate-400
  or lighter (never slate-500) and accent text is -400; white text needs a
  -700 fill on cyan/teal/emerald/green (-600 is fine for blue/violet/red), and
  a coloured `Button` fill needs `text-white` (the default text is dark).
- **Accessibility:** every control has a name: `aria-label`, or a `<Label
  htmlFor>` plus `aria-labelledby` on the control (jsx-a11y doesn't count
  `htmlFor`). Icon-only buttons get `aria-label` and `aria-hidden` icons.
  Clickable things are `<button>`s or `<Link>`s (`Button asChild` around a
  Link, never a Link around a Button). jsx-a11y runs in lint, and
  `tests/a11yStatic.test.ts` covers what it can't see (Select triggers, native
  selects, `Progress`, `size="icon"` buttons); `tests/a11y.test.jsx` runs axe.
- **Help:** `GUIDE_SECTIONS` in `src/pages/Help.jsx` is the user guide; keep it
  true when a feature changes. Each topic names its `page` (Help links there
  for people who may open it). After editing, commit, run
  `SOURCE_COMMIT=$(git rev-parse HEAD) node scripts/generate-help-inventory.mjs`,
  commit the regenerated `artifacts/help/` file and update the counts in
  `tests/helpInventory.test.ts`.
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
- **Organizations:** every account belongs to one (`organization_members`,
  `org_role` owner|member); signup creates it in trial (`server/lib/orgs.ts`).
  Customer-owned tables carry `org_id`, and `server/routes/entities.ts` scopes
  `ORG_SCOPED_ENTITIES` by the session's `orgId` (stamped on create, never
  trusted from the body; `LeadListMember` and `CampaignSequenceStep` are scoped
  through their parent). Handlers that take a row id (campaigns, scheduled
  reports, assistant lead lists) look it up `AND org_id = …`: another
  organization's id answers 404. Three roles, defined once in
  `server/lib/roles.ts`: platform admin (the `admin` role **or**
  `users.is_platform_admin`, kept together by the Users screen, invites and the
  seed: shared data, every organization, `platformAdminOnly`, `ScoringRule`,
  imports), owner (`isOrgAdmin`/`adminOnly`: their organization's people,
  billing, campaigns, its audit events) and member. An owner is never a
  platform admin: `PLATFORM_ONLY_ENTITIES` are closed to them, and
  `OWNER_FUNCTIONS` (`server/lib/functionAcl.ts`) is a positive list; every
  dispatched function is public, an owner's or `PLATFORM_FUNCTIONS`
  (`tests/functionsDispatch.test.ts`). The frontend mirrors this with
  `effectiveRole(user)` in `navConfig.js` (`admin` | `owner` | `user`; an owner
  opens every page a member does, a tab can name its own `roles`); pass the
  session user, not `user.role`, to `canAccessPage`. Plans set the territory
  (`server/lib/entitlements.ts`, `assertTerritory` in the county, market and
  territory handlers and the assistant tools that call them; a County Pack or
  State plan with no places chosen covers nothing, never everything), seats and
  daily quotas (`server/lib/orgQuota.ts`, `consumeQuota`; exports are counted
  by `countExport()` before a file is built, and every export carries the
  source line from `exportAttribution()`). Provider search, the referral
  network and exports of provider data are not territory-limited.
  Billing is Stripe (`server/lib/billing.ts`, `/api/billing`, `/api/webhooks/stripe`;
  one subscription per organization, events apply only to the current one and
  in time order via `stripe_event_at`).
  Public legal pages: `/terms`, `/privacy`, `/data-use`.
- **Audit:** server code writes `recordAudit()` (`server/lib/audit.ts`), passing
  the `org_id` the event belongs to (an owner reads their organization's events;
  platform events such as the maintenance heartbeat have none and only platform
  admins see them). The browser records its own actions with
  `base44.audit.record(type, details)` (`POST /api/audit`, allowlisted types);
  it can't write `AuditEvent` directly.
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
  Query-kind jobs (`server/lib/rollups/market.ts`) fill a result table with one
  SELECT over the typed CMS tables and `geo_zctas`; they never read the big
  provider or facility tables.
- **Market views** (County Intel tabs, Market Intelligence, facility and
  provider cards under `src/components/market/`) read only the market rollups
  through `server/functions/market.ts`. Vocabulary matters: hospital
  *sources* are where a county's residents are hospitalized (Hospital Service
  Area), the discharge *mix* is post-discharge Medicare spend by setting (a
  proxy, not transfers), and market *share* is the share of Medicare FFS
  beneficiaries served by providers located in the county. Every market view
  renders `ComplianceDisclaimer variant="market"` and `MarketFreshness`.
  Units: shares in the rollups are fractions (0.31; format with `fmtShare`),
  while CMS "percent" columns that are passed through (`*_users_pct`) stay in
  percent units (`fmtPct`); the county profile counts each post-acute setting
  at that setting's own latest year, because CMS releases them separately.
- **Geography:** counties and ZIP areas come from the bundled 2020 Census
  files in `server/data/census` (built by `scripts/census/build-census-geo.ts`,
  checked against `manifest.json`), loaded into `geo_*` tables and read through
  `server/lib/geo.ts` (`resolveCounty`, `countyZctas`, `zipToCounty`,
  `coordsFor`). Don't hardcode coordinates or county lists. Demand data comes
  the same way: `scripts/census/build-acs.ts --year YYYY` builds the ACS
  5-year bundle (`census_acs_county.csv.gz`, `census_acs_zcta.csv.gz`,
  `acs.manifest.json`; no API key, ~300 MB download once a year) that
  `server/lib/census/acs.ts` loads at boot into `census_acs_*`; the county
  profile rollup joins it. State-licensed homes (personal care, assisted
  living) live in `licensed_facilities`, imported from CSV uploads through
  the typed route `licensed_facilities` (`mapLicensedFacility`); there `state_filter`
  names the file's own state (rows without a state column take it) and a complete
  import replaces the (state, licence type) slices it wrote. Browser code gets
  map positions from `getZipCoordinates` (`useProviderCoords`) and a
  provider's county from `getGeoContext`.
- **Scores are never invented.** Territory and County Intel show a provider's
  `lead_scores` score, else `ai_outreach_score`, else "Unscored" (`null`,
  never 0); see `pickScore()` in `server/lib/territory.ts`. `lead_scores` is
  written only by the scoring job (`server/lib/leadScoringJob.ts`; rules in
  `server/lib/leadScoring.ts`, mirrored by `src/lib/scoringRules.js`): every
  individual provider located in the states named by the Geographic Priority
  rule's conditions (read from that row even when the rule is switched off,
  and never defaulted to a state), started from Scoring Rules
  (`recalculateLeadScores`) or weekly by the `refreshLeadScores` maintenance
  worker. A run a restart killed is marked failed once its advisory lock is
  free, so the next one starts. Don't compute scores in the browser.
- **Specialty groups:** match specialties by NUCC code with
  `specialtyGroupFor()` (`server/lib/specialtyGroups.ts`, mirrored in
  `src/lib/specialtyGroups.js`; a parity test keeps them identical), not by
  free text: NPPES says "Internal Medicine, Cardiovascular Disease", never
  "Cardiology". The NUCC code set itself is bundled in `server/data/nucc`
  (built by `scripts/nucc/build-nucc-taxonomy.ts --version NNN` from
  nucc.org, checksummed by `manifest.json`), loaded into `nucc_taxonomies` at
  boot by `server/lib/nucc/load.ts` and read through `server/lib/taxonomy.ts`
  (`getTaxonomyIndex(pool).describe(code)`), which is how file-imported
  NPPES taxonomies get their descriptions. Rebuild it each January and July.

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
  `server/routes/maintenance.ts`; `scripts/maintenance-tick.sh` is the curl).
  Each tick `handleRunScheduledImports` (`server/functions/scheduledImports.ts`)
  starts the due import schedules and then runs the one fan-out,
  `runMaintenanceFanout` → `FANOUT_WORKERS` (`server/lib/maintenance.ts`:
  `settleScheduledImports`, `checkCmsCatalog`, `autoResumePausedImports`,
  `autoRetryFailedImports`, `manageCrawlerRetries`, `cancelStalledImports`,
  `runDueScheduledReports`, `refreshRollups`, `refreshLeadScores`), which writes the
  `maintenance_fanout` `AuditEvent` heartbeat that `MaintenanceHealthPanel`
  surfaces. There is no second copy of the workers: the admin buttons call the
  same functions. Hosts without a cron can set
  `MAINTENANCE_INPROCESS_INTERVAL_MS` (`server/lib/maintenanceTicker.ts`).
  If neither is wired, the workers don't run (and rollups never refresh). The
  legacy Deno `base44/functions/runScheduledImports` is not the entrypoint.
- **A schedule is "running" until its batch finishes.** `runOneSchedule`
  records `last_batch_id`; `server/lib/importCompletion.ts` settles the
  schedule (success/failure, backoff, `last_successful_run_at`) from the
  batch's terminal state, called by the importer and by the
  `settleScheduledImports` sweep. `dependencyBlocked` waits for the parent's
  completion, not its start. The 6 h run lease only gives up on a run that has
  gone quiet (`PROGRESS_GRACE_MS`), the due loop skips a schedule whose batch is
  still validating/processing, and a failed `on_release` schedule retries on the
  normal backoff instead of waiting for the next release.
- **Dataset versions are tracked.** `dataset_versions` (registry in
  `server/lib/datasetRegistry.ts`) records, per import type, the newest
  version the CMS catalogs list (`server/lib/cmsCatalog.ts` parses
  `data.json` and the Care Compare catalog; each yearly release is its own
  dataset id, so the pinned URLs in `IMPORT_TYPE_URLS` are only fallbacks) and
  what was imported (`markImportStarted`/`markImportFinished`). The daily
  `checkCmsCatalog` worker flags newer releases and wakes schedules whose
  frequency is `on_release`. `getDataFreshness` (public) feeds
  `DataSourcesFooter`, `DataFreshnessPanel` and the Help topic. Facility rows
  get `data_year` from the row's own year column, else the resolved version
  (`importDataYear`: the release period's year, never the year of the first
  import). A new release refreshes the stored facility rows in place
  (`partitionRefresh`/`refreshFacilityRows`) rather than skipping them, and
  every way an import can end, including a fetch failure, pause or cancel,
  closes its registry row (`endedWithoutFinishing`). Snapshot datasets (ZIP
  service areas, clinician affiliations: `snapshot` on their typed route) are
  keyed without a period, so after a complete, unfiltered import the rows the
  release no longer lists are retired (`server/lib/snapshotRetire.ts`).
- **Import progress is merged, never replaced.** `import_batches.retry_params`
  is shared by the importers, auto-retry and auto-resume, so write it with
  `mergeRetryParams` (`triggerImport.ts`) or the attempt counters are lost and
  the retry cap never applies. A resume inherits the batch's `headers` and
  `as_of`. After a restart `planRecovery` (`server/lib/importRecovery.ts`)
  decides, from the batch's own `retry_params`, whether to resume it (with its
  original year and filters) or fail it; NPPES file batches resume through
  their own importer, never the CMS CSV one.
- **Files as import sources.** Uploads (`/api/storage/<name>`, under
  `uploads/`) and https CSV links are accepted only for `UPLOAD_CAPABLE_TYPES`
  (`server/functions/triggerImport.ts`: datasets CMS doesn't serve through its
  APIs) and must state their data year; `server/lib/importSources.ts` and
  `server/lib/csv.ts` stream them through the same insert path. Everything
  else is imported from the CMS endpoints.
- **Order & Referring lives in `cms_order_referring`** (one row per NPI,
  boolean flags, upserted per release), never in `cms_referrals`, which holds
  only provider-pair shared-patient rows. Pages summarise those through
  `src/lib/referralSummary.js`; there are no `home_health_referrals`-style
  columns.
- **NPPES refresh is file-based.** `nppes_weekly_incremental` / `nppes_monthly_full`
  (`server/functions/importNPPESFile.ts`) download the CMS zip, stream the
  `npidata_pfile_*.csv` entry and upsert through `server/lib/nppesWrite.ts`,
  which replaces a provider's locations and taxonomies per NPI and never lets
  a blank cell overwrite a value. A record older than the stored one is skipped
  (a late monthly file can't revert a weekly one), a deactivation-only row
  updates a provider we hold and never creates a stub, and the import refuses
  to start until the `uq_prov_loc_natural` / `uq_prov_tax_natural` boot
  indexes exist. Every NPPES importer rejects NPIs that fail the Luhn check
  (`server/lib/npiValidation.ts`). The crawler and the flat-file importer are
  for backfills, not for keeping data fresh.
- **Component tests need jsdom.** Add `// @vitest-environment jsdom` at the top
  of the test file; the default environment is `node`.
