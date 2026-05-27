import { Router, Response, NextFunction } from "express";
import crypto from "crypto";
import { AuthRequest, authMiddleware, adminOnly } from "../middleware/auth";
import { rateLimit } from "../middleware/rateLimit";
import {
  handleRunScheduledImports,
  handleAutoRetryFailedImports,
  handleAutoResumePausedImports,
  handleCancelStalledImports,
} from "../functions/scheduledImports";

const router = Router();

// Maintenance tasks for an external scheduler (e.g. a Replit Scheduled
// Deployment or system cron) to drive import automation that the autoscale
// runtime can't do reliably with an in-process timer. Point the scheduler at:
//   POST /api/maintenance/runScheduledImports
// with header `x-maintenance-token: $MAINTENANCE_TOKEN` on a cadence (e.g.
// every 10 minutes). runScheduledImports also fans out to the other workers,
// so that single call is enough; the others are exposed for manual use.
const TASKS: Record<string, (payload: any, user: any) => Promise<any>> = {
  runScheduledImports: handleRunScheduledImports,
  autoRetryFailedImports: () => handleAutoRetryFailedImports(),
  autoResumePausedImports: () => handleAutoResumePausedImports(),
  cancelStalledImports: () => handleCancelStalledImports(),
};

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
  return authMiddleware(req, res, () => adminOnly(req, res, next));
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
