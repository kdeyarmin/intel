# Hosted development boot

Base44 initializes its sandbox with `npm run dev -- --host 0.0.0.0 --port <port>` before accepting a named backend-function deployment. The previous `concurrently` script interpreted those arguments itself and also started the Express API, whose startup attempts database seeding. This prevented the sandbox from becoming ready.

`dev` now starts only Vite and receives the platform's host and port arguments directly. `dev:full` retains the previous local full-stack command for an explicitly configured Express development environment. No migration, database seed, frontend publication, or function deployment is performed by this change.

The stored Base44 source exported read-only on September 11, 2026 contains the Express frontend, while the published application still serves the older Base44 frontend. This boot fix does not establish that the current stored frontend is compatible with production. Do not publish that frontend as part of recovering the named `centralAdminRead` deployment.

The server-side stored `package.json` must receive this exact change before retrying the named function. Changing a local `base44/config.jsonc` serve command does not change the platform bootstrap. Base44 file-edit tools themselves bootstrap a sandbox, so they cannot repair a cold sandbox that fails before accepting edits. Use an already running code editor or a supported stored-source update path; otherwise retain the disabled bridge and report the hosting blocker.
