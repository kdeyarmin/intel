# CareMetric Intel — Pilot Operational Setup Checklist

This checklist covers the **must-have operational setup** before releasing the app to employees for pilot. Follow it for Railway or local.

**Goal:** A running instance with migrations applied, an admin account, maintenance ticks for data freshness, and the secrets needed for AI / email / optional billing.

## 1. PostgreSQL + Migrations

- Provision a PostgreSQL database (Railway Postgres plugin is the simplest).
- Set `DATABASE_URL`.
- **Recommended:** set `DB_MIGRATE_ON_BOOT=true` so the server applies pending migrations before listening (safe with multiple instances via advisory lock). The server exits if migration fails.
- Alternatively run `npm run db:migrate` once after deploy.
- Optional for local/controlled testing only: `npm run db:seed-demo` (refuses non-local databases).

Verify: server starts without migration errors; `/api/health` returns ok.

## 2. JWT_SECRET & First Admin

- Generate a long random secret (e.g. `openssl rand -hex 48`) and set `JWT_SECRET`.
  - **Required in production.** The server throws on startup if missing (see `server/middleware/auth.ts`).
  - In development an ephemeral secret is generated (sessions drop on restart).
- Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` (and optionally `ADMIN_FULL_NAME`).
  - In production the first admin is seeded only if `ADMIN_PASSWORD` is set.
  - If locked out later: `RECOVER_EMAIL=... npx tsx scripts/admin-recover.ts`.

After first boot, log in with the admin credentials and change the password.

## 3. Maintenance Ticks (Critical for Data Freshness)

Nothing imports, retries, settles schedules, checks CMS catalogs, refreshes rollups, or sends ops alerts without a maintenance tick.

**Simplest for pilot (recommended):**

```bash
MAINTENANCE_INPROCESS_INTERVAL_MS=600000   # every 10 minutes, min 60s
```

The server starts an in-process ticker (shared across instances with an advisory lock). See `server/lib/maintenanceTicker.ts`.

**External cron alternative:**

- Set a strong `MAINTENANCE_TOKEN`.
- Point a cron (Railway cron job, system cron) every 10 minutes at:
  ```bash
  MAINTENANCE_URL=https://your-app.example.com \
  MAINTENANCE_TOKEN=your-token \
  sh scripts/maintenance-tick.sh
  ```

**After deploy:** open the Import Monitor → Health tab. Confirm the last tick is recent and the “Needs attention” list is empty (or expected items only). Dataset catalog shows data years / import dates.

## 4. Secrets & Volumes

| Variable | Purpose | Required for pilot? |
|----------|---------|---------------------|
| `ANTHROPIC_API_KEY` | AI Assistant, enrichment bots, quality analysis | Yes (for AI features) |
| `SENDGRID_API_KEY` + `SENDGRID_FROM_EMAIL` + `PUBLIC_APP_URL` | Email (password reset, invites, campaigns, alerts) | Yes (for email features) |
| `OUTREACH_PHYSICAL_ADDRESS` | CAN-SPAM for outreach | Yes if sending campaigns |
| `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` + price IDs | Billing / Checkout / Portal | Only if testing paid plans |
| `MAINTENANCE_TOKEN` | External cron | Only if not using in-process ticker |

**Volumes (Railway):**

- Mount a volume at `/app/uploads` for user file uploads (served only to signed-in users).
- NPPES downloads go to `downloads/nppes/` (or `NPPES_DOWNLOAD_DIR`). Must be **outside** `uploads/` (served to users). Use a separate volume or ensure enough disk. Monthly full file is ~1.1 GB zipped.

See `.env.example` for the complete commented list (CORS, model overrides, quotas, etc.).

## 5. Deployment

### Railway (recommended for pilot)

1. Create a new service from this repo.
2. Add a PostgreSQL plugin → `DATABASE_URL` is injected.
3. Add a volume mounted at `/app/uploads`.
4. Set environment variables from `.env.example` (at minimum: `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `DB_MIGRATE_ON_BOOT=true`, `MAINTENANCE_INPROCESS_INTERVAL_MS=600000`, `ANTHROPIC_API_KEY`, `SENDGRID_*`, `PUBLIC_APP_URL`, `NODE_ENV=production`).
5. Build command is handled by `railpack.json` (`npm ci && npm run build`); start is `npm start`.
6. Health check is already in `railway.toml` (`/api/health`).
7. (Optional) Add a Cron Service that runs `sh scripts/maintenance-tick.sh` if you prefer external ticks instead of in-process.

### Note on Vercel

The app is designed for same-origin serving (Express serves the SPA in production). The previously mentioned Vercel URL returns 404; use Railway for the pilot.

## Post-Deploy Verification

- [ ] `GET /api/health` → `{ "status": "ok" }`
- [ ] Admin can log in
- [ ] Import Monitor Health tab shows a recent tick
- [ ] No unexpected items in “Needs attention”
- [ ] (If AI enabled) AI Assistant responds
- [ ] (If email enabled) password reset / invite works
- [ ] Dataset catalog shows freshness info

## Further Reading

- `.env.example` — full documented environment
- `README.md` — Deployment and Keeping the data fresh
- `CLAUDE.md` — architecture and conventions
