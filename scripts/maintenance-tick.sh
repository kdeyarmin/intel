#!/usr/bin/env sh
# One maintenance tick: run due import schedules, then the maintenance
# workers (auto-resume/retry, stall sweep, schedule settlement, CMS catalog
# check, reports, rollups). Point a cron at this every ~10 minutes, e.g. a
# Railway cron service with the command `sh scripts/maintenance-tick.sh`.
#
#   MAINTENANCE_URL    base URL of the app, e.g. https://app.example.com
#   MAINTENANCE_TOKEN  the server's MAINTENANCE_TOKEN
set -eu
: "${MAINTENANCE_URL:?set MAINTENANCE_URL to the app's base URL}"
: "${MAINTENANCE_TOKEN:?set MAINTENANCE_TOKEN}"
curl --silent --show-error --fail --max-time 300 \
  -X POST "${MAINTENANCE_URL%/}/api/maintenance/runScheduledImports" \
  -H "x-maintenance-token: ${MAINTENANCE_TOKEN}" \
  -H "content-type: application/json" \
  --data '{}'
echo
