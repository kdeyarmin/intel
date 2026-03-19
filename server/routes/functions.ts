import { Router, Response } from "express";
import { authMiddleware, AuthRequest } from "../middleware/auth";

const router = Router();

router.post("/:functionName", authMiddleware, async (req: AuthRequest, res: Response) => {
  const { functionName } = req.params;

  try {
    switch (functionName) {
      case "getDashboardStats": {
        const { db } = await import("../db");
        const { providers, importBatches, outreachCampaigns, dataQualityAlerts, auditEvents } = await import("../db/schema");
        const { sql, desc } = await import("drizzle-orm");

        const [providerCount] = await db.select({ count: sql<number>`count(*)` }).from(providers);
        const [batchCount] = await db.select({ count: sql<number>`count(*)` }).from(importBatches);
        const [campaignCount] = await db.select({ count: sql<number>`count(*)` }).from(outreachCampaigns);
        const [alertCount] = await db.select({ count: sql<number>`count(*)` }).from(dataQualityAlerts);
        const recentActivity = await db.select().from(auditEvents).orderBy(desc(auditEvents.created_date)).limit(10);

        return res.json({
          total_providers: providerCount.count,
          total_imports: batchCount.count,
          total_campaigns: campaignCount.count,
          open_alerts: alertCount.count,
          recent_activity: recentActivity,
        });
      }

      case "getDataHealthMetrics": {
        const { db } = await import("../db");
        const { providers, dataQualityAlerts, dataQualityScans } = await import("../db/schema");
        const { sql } = await import("drizzle-orm");

        const [providerCount] = await db.select({ count: sql<number>`count(*)` }).from(providers);
        const [alertCount] = await db.select({ count: sql<number>`count(*)` }).from(dataQualityAlerts);
        const [scanCount] = await db.select({ count: sql<number>`count(*)` }).from(dataQualityScans);

        return res.json({
          total_providers: providerCount.count,
          total_alerts: alertCount.count,
          total_scans: scanCount.count,
          data_completeness: 0,
          data_accuracy: 0,
        });
      }

      default:
        return res.status(404).json({
          message: `Function '${functionName}' not yet migrated. Legacy functions are being converted to Express routes.`,
        });
    }
  } catch (e: any) {
    console.error(`[Function ${functionName} Error]`, e.message);
    res.status(500).json({ message: e.message });
  }
});

export default router;
