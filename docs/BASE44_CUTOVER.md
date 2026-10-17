# Base44 cutover

CareMetric Intel on Railway (Express, Postgres, its own auth and `uploads/`)
does not call Base44. The public DNS for caremetricintel.com is still the
old Base44 app on Render until that record is changed. This repository does
not change DNS.

The name `base44` in `src/api/client.js` is the same-origin `/api` client.
Pages already talk to Express. The Base44 npm packages, the `base44/` Deno
tree, and the logo/favicon hotlinks to the `base44-prod` bucket are removed.

## What is still in Base44

Railway's `crm_accounts`, `crm_contacts`, `crm_activities`, and
`crm_referrals` tables were empty at the time of this cutover. The marketing
book, users, lead lists, saved filters, campaigns, call sheets, and uploaded
files may still be in Base44 app `6993c62145573ca8a97ad4a9`.

The entity catalog that used to live in `base44/entities/` has no
`CrmAccount` (or contact, activity, or referral) entity. Those tables exist
only in Postgres. If the hosted Base44 app gained them later, the importer
reads those names. Any other name is counted under `unmapped` and is not
written.

Provider, facility, and CMS tables are counted and then skipped. Railway
loads those from CMS and NPPES. Copying them out of Base44 would duplicate
that pipeline.

## Export

Dry-run, nothing written:

```bash
BASE44_API_KEY="<key>" npm run base44:import
```

Or, with a dashboard JSON export (one file per entity: `User.json`,
`CrmAccount.json`, …):

```bash
npm run base44:import -- --export-dir ./base44-export
```

Save the API export locally without touching Postgres:

```bash
BASE44_API_KEY="<key>" npm run base44:import -- --save-export ./base44-export
```

The API is `GET https://base44.app/api/apps/<app id>/entities/<Name>/v2/list`
with `Authorization: Bearer <key>` and `X-App-Id`. A 401 or 403 means the
key cannot read that app.

## Apply

Review the dry-run counts first. Then, against the database you mean to
update:

```bash
DATABASE_URL="postgresql://..." npm run base44:import -- \
  --export-dir ./base44-export --org-id <railway org id> --apply
```

A non-local host is refused unless `BASE44_IMPORT_ALLOW_REMOTE=1`. The
script never sends email. An explicit `--export-dir` is what gets imported,
even when `BASE44_API_KEY` is still set. `--download-files` copies http(s)
file URLs found in the exported rows (and in `files.json`) into
`uploads/base44-import/`. After a file saves, stored references to that URL
are rewritten to `/api/storage/base44-import/<file>`, which signed-in users
can open. A later run rewrites rows that were already mapped. Private Base44
files that are not reachable with the URL in the export stay unmigrated; the
dry-run lists the URLs it saw.

A second run inserts nothing that `base44_import_map` already names
(migration `0038_base44_import_map`). Existing Railway users are matched on
email and left unchanged, including their password.

## How people log in after cutover

Base44 passwords are not readable and are not copied. Each new user is
inserted as `invited` with a random password hash, and as a member of
`--org-id`. Base44 `admin` users are also marked platform admins. Someone
who already has a Railway account (the seeded admin) keeps that account.

An invited user cannot sign in with the old Base44 password. Forgot-password
only works for `active` and `pending` accounts, so it will not email them.

A platform admin opens Admin Settings → Users and creates a reset link for
each invited person. For an invited account that button is an invite link:
the person opens it, sets a password, and the account becomes `active`.
The link is shown in the admin UI. If SendGrid is configured, the same
button also emails the invite. Do not click it until those emails should
go out. `PUBLIC_APP_URL` must be the URL people will use (the Railway host
until DNS moves, then `https://caremetricintel.com`) or the link will point
at the wrong site.

Accounts that were disabled in Base44 are not imported as disabled; the
dry-run does not read a disabled flag from the User entity schema in this
repo (role only). Review the user list before sending links.

## Support Hub

The Help page on `caremetricintel.com` can still open the Support Hub when
the SPA is built with `VITE_DEPLOY_ENV=production`. That launcher does not
use a Base44 app id.

The Hub's server-side read of Intel users (`centralAdminRead`) ran as a
Base44 function and spoke 24-character Base44 user ids. That function is
gone. `server/lib/centralAdminRead.ts` remains so the protocol tests still
run; Express does not mount it. After Base44 is off, the Hub cannot list
Intel users until it is pointed at Railway with the new integer user ids.
