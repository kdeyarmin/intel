# Intel administration connection

**Current status.** CareMetric Intel runs on Railway (Express + Postgres).
The Base44 Deno entrypoint for `centralAdminRead` has been removed. The
protocol handler remains in `server/lib/centralAdminRead.ts` and is covered
by `tests/intelHubAdmin.test.ts`, but it is not mounted on Express and it
still speaks the old 24-character Base44 user ids. The Support Hub at
`support-hub-web-production.up.railway.app` will not be able to list Intel
users through that bridge after the Base44 app is shut off. Repointing the
Hub is a separate change. The public Help launcher does not use this bridge.

The notes below record the 2026-09-11 investigation. They are not the
current deployment.

The repository contains an Express migration, but the verified public Intel
runtime on 2026-09-11 is Base44 app `6993c62145573ca8a97ad4a9`.
`/api/health` returned HTML and `/api/auth/me` returned Base44's authentication
envelope. The Base44 connector identified a protected administrator, while the
verified live schema did not provide Organization or Subscription entities.

The narrow `centralAdminRead` hosted bridge is the documented exception to the
legacy-folder policy. It supports capabilities, overview and registered users.
Unverified organization and active-account totals are null; billing is omitted.
It does not infer subscription state, report database profiles as active accounts,
or access provider, clinical, import, or billing records.

Server configuration is `CAREMETRIC_ADMIN_ENABLED=true`, an explicitly reviewed
`CAREMETRIC_ADMIN_IDENTITY_MAP_JSON` mapping Hub UUIDs to existing native IDs, and
`CAREMETRIC_ADMIN_SOURCE_REVISION` with the exact deployed 40-character commit.
Missing configuration disables the bridge. Matching email addresses do not
establish an identity mapping. No Supabase verification API is used.

Each request consumes a one-use capability from the fixed Hub Intel audience,
matches its full operation, and rechecks the current platform-protected native
User role. The SDK request pins the app and production data environment; only
hosted service authorization reaches the SDK. Browser origins are rejected,
injected cookies ignored, and authorization redirects rejected without following
them. Errors never disclose raw vendor messages or credentials.

Directory reads scan sorted, projected pages up to 10,000 users with a shared
12-second deadline. Duplicate, unordered, oversized, incomplete or malformed
responses fail instead of returning a plausible partial total. Profiles are
labeled registered because the live schema does not prove current login activity.

Release only this named function after exact-source CI, then verify anonymous
rejection and native runtime ownership. Configure the identity mapping and enable
only after the native owner is independently confirmed. Deploy the matching Hub
Intel audience and protocol before actual owner reads. No whole-site or legacy
function deployment is part of this bridge. An Express migration needs its own
verified production target and data migration review.
