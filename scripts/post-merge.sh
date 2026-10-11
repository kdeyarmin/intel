#!/bin/bash
set -e

npm install --prefer-offline --no-audit --no-fund 2>/dev/null || true

# Apply hand-written migrations. Don't use `drizzle-kit push --force` here: it
# drops every index the server builds at boot (they aren't in schema.ts), and
# rebuilding those on the large tables takes hours. A failed migration fails
# the hook (set -e), as it stops the server when DB_MIGRATE_ON_BOOT=true.
npm run db:migrate
