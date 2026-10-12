import { Router, Response, NextFunction } from "express";
import crypto from "crypto";
import { AuthRequest, authMiddleware, platformAdminOnly } from "../middleware/auth";
import { rateLimit } from "../middleware/rateLimit";
import { handleRunScheduledImports } from "../functions/scheduledImports";
import {
  runAutoRetryFailedImports,
  runAutoResumePausedImports,
  runCancelStalledImports,
} from "../lib/maintenance";

const router = Router();

// Maintenance tasks for an external scheduler (e.g. a Railway cron job)
// to drive import automation. Point the scheduler at:
//   POST /api/maintenance/runScheduledImports
// with header `x-maintenance-token: $MAINTENANCE_TOKEN` on a cadence (e.g.
// every 10 minutes). runScheduledImports also fans out to the other workers,
// so that single call is enough; the others are exposed for manual use.
// Use Object.create(null) so the object has no prototype — inherited keys like
// "toString" or "constructor" can't accidentally match a caller's task name.
const TASKS = Object.assign(Object.create(null) as Record<string, (payload: any, user: any) => Promise<any>>, {
  runScheduledImports: handleRunScheduledImports,
  autoRetryFailedImports: () => runAutoRetryFailedImports(),
  autoResumePausedImports: () => runAutoResumePausedImports(),
  cancelStalledImports: () => runCancelStalledImports(),
  runDueScheduledReports: async () => (await import("../functions/scheduledReports")).handleRunDueScheduledReports(),
  refreshRollups: async (payload: any) => {
    const { pool } = await import("../db");
    const { startDueRollups } = await import("../lib/rollups/runner");
    return startDueRollups(pool, { jobs: Array.isArray(payload?.jobs) ? payload.jobs : undefined, force: !!payload?.force });
  },
});

function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

// Authorize via a service token (x-maintenance-token === MAINTENANCE_TOKEN) for
// unattended cron, OR fall back to an authenticated admin for manual triggers.
function maintenanceAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const token = process.env.MAINTENANCE_TOKEN;
  const provided = req.header("x-maintenance-token");
  if (token && provided && timingSafeEqualStr(provided, token)) {
    return next();
  }
  // Maintenance runs the platform's own workers: a platform administrator, not an organization's owner.
  return authMiddleware(req, res, () => platformAdminOnly(req, res, next));
}

router.post("/:task", rateLimit("maintenance", 60, 60_000), maintenanceAuth, async (req: AuthRequest, res: Response) => {
  const fn = TASKS[req.params.task];
  if (!fn) {
    return res.status(404).json({ message: `Unknown maintenance task: ${req.params.task}` });
  }
  try {
    const result = await fn(req.body || {}, req.user);
    return res.json(result);
  } catch (e: any) {
    return res.status(e?.status || 500).json({ message: e?.message || "Maintenance task failed" });
  }
});

export default router;
