# AGENTS.md

Instructions for Codex cloud and other AI coding agents working in this repository.

## Codex cloud environment

- Configure this repository in Codex cloud settings and use the default universal image with Node 22.13.0 or newer.
- Setup script:

  ```bash
  npm ci || npm install
  ```

- Store database URLs, Base44 credentials, API keys, and other secrets in Codex environment variables or secrets. Do not commit `.env` files.
- Database migration commands require explicit approval and a configured cloud database target.

## Project shape

- This is a Vite/React app with an Express API server and Drizzle database tooling.
- Run commands from the repository root.
- Use npm. Do not introduce yarn or pnpm unless the package manager is intentionally changed.
- Keep frontend, server, and shared schema changes aligned.

## Commands

| Task | Command |
| --- | --- |
| Install | `npm ci` when a lockfile exists, otherwise `npm install` |
| Full dev | `npm run dev` |
| API dev | `npm run dev:api` |
| Frontend dev | `npm run dev:frontend` |
| Build | `npm run build` |
| Lint | `npm run lint` |
| Lint fix | `npm run lint:fix` |
| Typecheck | `npm run typecheck` |
| Tests | `npm run test` |
| Generate migrations | `npm run db:generate` only when schema changes require it |
| Apply migrations | `npm run db:migrate` only when requested and credentials are configured |
| Push schema | `npm run db:push` only when requested and credentials are configured |

Before finishing a code change, run the smallest relevant checks first. For typical app or API changes, prefer `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run build`.

## Working rules

- Do not invent database credentials or run migrations against production without explicit instruction.
- Keep generated migration files when they are part of an intentional schema change.
- If a check cannot run because a Codex secret or database endpoint is missing, state that clearly in the final response.
