# Pilot Operational Setup Checklist

This checklist covers the must-have operational setup for releasing CareMetric Intel to employees for a pilot. Complete these before inviting pilot users so data stays fresh, auth works, and core features (AI, email, imports) are available.

Recommended deployment target for the pilot: **Railway** (Postgres plugin + volume + optional cron). Replit is also supported. The previous Vercel URL is not configured for this app (no `vercel.json`; designed for same-origin Express + SPA).

## 1. PostgreSQL + Migrations

- Provision a PostgreSQL database (Railway Postgres plugin recommended; it injects `DATABASE_URL`).
- Set `DATABASE_URL` (required in all environments).
- Set `DB_MIGRATE_ON_BOOT=true` so migrations from `./drizzle/` apply automatically at startup (uses an advisory lock; safe for multiple instances). Alternatively run `npm run db:migrate` manually.
- Optional for local/controlled testing only: `npm run db:seed-demo` (refuses non-local databases).
- Verify with `npm run db:status` or by hitting `/api/health` after boot.

**Warning**: Do not use `npm run db:push` on shared or production databases — it drops the indexes the server builds at boot.

## 2. JWT_SECRET and Admin Seed

- Generate a long random `JWT_SECRET` (required in production; the server refuses to start without it).
- Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` to seed the first platform admin on first boot (or restore if the account still matches the password and no other admins exist).
- In production the admin is only seeded when `ADMIN_PASSWORD` is set. Change the password after first login.
- Recovery if needed: `RECOVER_EMAIL=... npx tsx scripts/admin-recover.ts`.

## 3. Maintenance Ticks (required for data freshness)

Nothing imports, retries, rolls up, or checks freshness without a maintenance tick.

**Simplest for pilot** (recommended):
```
MAINTENANCE_INPROCESS_INTERVAL_MS=600000
```
The server runs the same work every 10 minutes (shared across instances via advisory lock). Leave unset if you use an external scheduler.

**External cron** (Railway cron service, Replit Scheduled Deployment, or system cron):
```
MAINTENANCE_TOKEN=<long random secret>
```
Then run every 10 minutes:
```bash
MAINTENANCE_URL=https://your-app.railway.app MAINTENANCE_TOKEN=... sh scripts/maintenance-tick.sh
```

After the first ticks:
- Open the Import Monitor → Health tab. Confirm the last tick and review the “Needs attention” list.
- Dataset catalog shows data year and import date.
- Platform admins (plus `OPERATIONS_ALERT_EMAILS`) receive a daily digest while issues are open.

## 4. Secrets and Volumes

Copy from `.env.example` and set at least:

| Variable | Purpose | Required for pilot? |
|----------|---------|---------------------|
| `ANTHROPIC_API_KEY` | AI Assistant, enrichment bots, insights | Yes (AI features) |
| `SENDGRID_API_KEY` + `SENDGRID_FROM_EMAIL` | Email (password reset, invites, campaigns, alerts) | Yes (email) |
| `PUBLIC_APP_URL` | Absolute links in emails (reset, unsubscribe, etc.) | Yes in production |
| `OUTREACH_PHYSICAL_ADDRESS` | CAN-SPAM for outreach campaigns | Yes if sending outreach |
| `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` + price IDs | Billing / Checkout / portal | Optional (Billing page works without; contact-us fallback) |
| `NPPES_DOWNLOAD_DIR` | NPPES zip downloads (outside `uploads/`) | Recommended (use a volume) |

**Volumes (Railway)**:
- Mount a volume at `/app/uploads` (served to signed-in users behind auth).
- Optionally mount another (or use disk) for `NPPES_DOWNLOAD_DIR` (monthly full file is ~1.1 GB zipped). Must not be under `uploads/`.

## 5. Deployment

### Railway (recommended)
1. New service from this repo (uses `railpack.json` + `railway.toml`).
2. Add Postgres plugin → `DATABASE_URL` is set automatically.
3. Add volume mounted at `/app/uploads`.
4. Set environment variables from `.env.example` (at minimum: `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `DB_MIGRATE_ON_BOOT=true`, `MAINTENANCE_INPROCESS_INTERVAL_MS=600000` or cron token, Anthropic, SendGrid, `PUBLIC_APP_URL`, `NODE_ENV=production`).
5. Health check is already configured at `/api/health`.
6. Optional: second cron service with command `sh scripts/maintenance-tick.sh` and the two `MAINTENANCE_*` vars (if not using in-process).

### Replit
`.replit` is already configured for autoscale: builds then runs `NODE_ENV=production node --import tsx server/index.ts`. Set the same secrets in Replit Secrets. Use a Scheduled Deployment for the maintenance tick if not using in-process.

### Post-deploy verification
- `GET /api/health` returns ok.
- Log in as the seeded admin.
- Import Monitor Health shows a recent tick (or “overdue heartbeat” if ticks are missing).
- Dataset catalog and a sample provider/facility page load.
- AI Assistant and a test email (password reset or alert) work if keys are set.

## Notes
- Large CMS/NPPES tables rely on the indexes built at boot and the precomputed rollups. Monitor query performance under pilot load.
- Geography uses 2020 Census data loaded at boot when tables are empty.
- See `.env.example`, `README.md`, and `replit.md` for full architecture, security model, and all variables.
