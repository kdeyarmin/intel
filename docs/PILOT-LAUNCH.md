# CareMetric Intel — Pilot Launch Checklist

Use this after completing the operational setup in [`docs/PILOT-SETUP.md`](PILOT-SETUP.md).

**Goal:** Confirm the instance is healthy, onboard employees, exercise the core workflows, collect feedback, and decide whether to expand beyond the pilot.

## Pre-Launch Verification (Admin)

Complete these before inviting employees.

- [ ] Follow every step in `docs/PILOT-SETUP.md` (Postgres, `JWT_SECRET`, admin seed, maintenance ticks, secrets, volumes).
- [ ] `GET /api/health` returns `{ "status": "ok" }`.
- [ ] Admin can log in and change the initial password.
- [ ] Import Monitor → Health tab shows a recent maintenance tick.
- [ ] “Needs attention” list is empty or contains only expected items.
- [ ] Dataset catalog shows data years and import dates for key datasets (NPPES + relevant CMS).
- [ ] AI Assistant responds (if `ANTHROPIC_API_KEY` is set).
- [ ] Password reset / invite email works (if SendGrid is configured).
- [ ] At least one organization exists (or create one via signup + approval).
- [ ] Optional: run `npm run db:seed-demo` on a local/non-production database for controlled testing.

## Employee Onboarding

- [ ] Create or approve accounts for pilot users (Admin Settings → Users).
- [ ] Assign roles (platform admin / owner / member) as appropriate.
- [ ] Share the app URL and a short orientation:
  - How to search providers and open detail pages.
  - How to build a lead list and start outreach.
  - Where to find Import Monitor Health and the Help page.
- [ ] Point them to the in-app Help guide (`/Help`).
- [ ] Set expectations: this is a pilot; feedback on usefulness, accuracy, and friction is the primary goal.

## Core Workflows to Exercise (End-to-End)

Have at least 2–3 employees walk through each flow with real or seeded data and note anything confusing, incomplete, or incorrect.

1. **Provider / Facility Search → Detail**
   - [ ] Search by name, NPI, specialty, or location.
   - [ ] Open a provider detail: overview KPIs, CMS clinical data, locations, network, outreach tab.
   - [ ] Open a facility detail: KPIs, raw data table, linked provider intelligence.
   - [ ] Question: Does the CMS data feel accurate and useful for targeting?

2. **Lead Lists, Scoring & Outreach**
   - [ ] Build a lead list from search results.
   - [ ] Review scores and score breakdown.
   - [ ] Create and (if email is enabled) send or preview a campaign / outreach message.
   - [ ] Confirm CAN-SPAM elements and that cross-org data is not visible.

3. **Data Center + Import Monitor**
   - [ ] Trigger or observe an import (or review a completed one).
   - [ ] Check Health tab, pause/resume if testing, and review alerts.
   - [ ] Confirm freshness information is visible and understandable.

4. **AI Assistant + Enrichment Bots**
   - [ ] Ask the AI Assistant questions about providers, markets, or referrals.
   - [ ] Trigger an enrichment or email search bot on a small set of providers.
   - [ ] Note quality of responses and any rate-limit behavior.

5. **Territory / Market / County Views**
   - [ ] Open Territory, County, and Market pages under the organization’s plan.
   - [ ] Confirm results respect territory limits (or show clear upgrade messaging).
   - [ ] Review referral networks and market share data.

6. **Multi-User Roles, Isolation & Billing (if applicable)**
   - [ ] Log in as different roles (member vs owner vs platform admin).
   - [ ] Confirm data isolation (another org’s lists/campaigns return 404).
   - [ ] If Stripe is configured, walk through plan selection / Checkout / portal (test mode).

## Monitoring During Pilot

- [ ] Check Import Monitor Health tab daily.
- [ ] Watch for operations alert emails (dataset lag, failed schedules, stale rollups).
- [ ] Review server logs for unexpected errors or high latency.
- [ ] Track AI usage against daily quotas if applicable.
- [ ] Confirm maintenance ticks continue (last tick timestamp advances).

## Feedback Collection

- [ ] Provide a simple feedback channel (Slack channel, shared doc, or email).
- [ ] Ask specifically about:
  - Usefulness of provider/facility intelligence and scores.
  - Completeness / accuracy of CMS data.
  - Ease of building lists and running outreach.
  - Clarity of territory and market views.
  - Any confusing UI, missing features, or performance issues.
- [ ] Capture edge cases (missing data, unexpected empty states, permission errors).

## Go / No-Go Criteria for Expanding Beyond Pilot

- [ ] Core workflows above completed successfully by multiple users.
- [ ] No critical data isolation or permission bugs reported.
- [ ] Data freshness maintained (Health tab healthy for several days).
- [ ] Feedback indicates the product is useful enough to continue.
- [ ] Operational issues (imports, AI, email) are understood and manageable.
- [ ] Decision recorded: expand to more employees / external users, or address specific gaps first.

## Related Docs

- [`docs/PILOT-SETUP.md`](PILOT-SETUP.md) — operational setup (required first).
- `README.md` — architecture, deployment, and data freshness.
- `.env.example` — full environment variable reference.
- In-app Help page — user-facing guide.
