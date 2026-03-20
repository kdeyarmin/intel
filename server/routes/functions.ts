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

      case "nppesCrawler": {
        const { handleNppesCrawler } = await import("../functions/nppesCrawler");
        const result = await handleNppesCrawler(req.body, req.user);
        if (result.error && !result.success) {
          return res.status(result.error === "Forbidden" ? 403 : 400).json(result);
        }
        return res.json(result);
      }

      case "triggerImport": {
        const { handleTriggerImport } = await import("../functions/triggerImport");
        try {
          const result = await handleTriggerImport(req.body, req.user);
          return res.json(result);
        } catch (e: any) {
          const status = e.status || 500;
          return res.status(status).json({
            error: e.message,
            conflict: e.conflict,
            existing_batch_id: e.existing_batch_id,
            started_at: e.started_at,
          });
        }
      }

      case "importNPPESFlatFile": {
        const { handleImportNPPESFlatFile } = await import("../functions/importNPPESFlatFile");
        try {
          const result = await handleImportNPPESFlatFile(req.body);
          return res.json(result);
        } catch (e: any) {
          return res.status(e.status || 500).json({ error: e.message });
        }
      }

      case "validateDataQuality": {
        const { handleValidateDataQuality } = await import("../functions/stubs");
        return res.json(await handleValidateDataQuality(req.body));
      }
      case "runDataQualityScan": {
        const { handleRunDataQualityScan } = await import("../functions/stubs");
        return res.json(await handleRunDataQualityScan(req.body));
      }
      case "enrichProviderWithAI": {
        const { handleEnrichProviderWithAI } = await import("../functions/stubs");
        return res.json(await handleEnrichProviderWithAI(req.body));
      }
      case "emailSearchBot": {
        const { handleEmailSearchBot } = await import("../functions/stubs");
        return res.json(await handleEmailSearchBot(req.body));
      }
      case "analyzeReferralPathways": {
        const { handleAnalyzeReferralPathways } = await import("../functions/stubs");
        return res.json(await handleAnalyzeReferralPathways(req.body));
      }
      case "matchProvidersToLocations": {
        const { handleMatchProvidersToLocations } = await import("../functions/stubs");
        return res.json(await handleMatchProvidersToLocations(req.body));
      }
      case "generateScheduledReport": {
        const { handleGenerateScheduledReport } = await import("../functions/stubs");
        return res.json(await handleGenerateScheduledReport(req.body));
      }
      case "testCMSUrl": {
        const { handleTestCMSUrl } = await import("../functions/stubs");
        return res.json(await handleTestCMSUrl(req.body));
      }
      case "predictImportFormat": {
        const { handlePredictImportFormat } = await import("../functions/stubs");
        return res.json(await handlePredictImportFormat(req.body));
      }
      case "testCMSApiConnector": {
        const { handleTestCMSApiConnector } = await import("../functions/stubs");
        return res.json(await handleTestCMSApiConnector(req.body));
      }
      case "enrichProviderThirdParty": {
        const { handleEnrichProviderThirdParty } = await import("../functions/stubs");
        return res.json(await handleEnrichProviderThirdParty(req.body));
      }
      case "verifyProviderEmail": {
        const { handleVerifyProviderEmail } = await import("../functions/stubs");
        return res.json(await handleVerifyProviderEmail(req.body));
      }
      case "bulkVerifyEmails": {
        const { handleBulkVerifyEmails } = await import("../functions/stubs");
        return res.json(await handleBulkVerifyEmails(req.body));
      }
      case "enrichProviderMedicareData": {
        const { handleEnrichProviderMedicareData } = await import("../functions/stubs");
        return res.json(await handleEnrichProviderMedicareData(req.body));
      }
      case "validateProviderNPI": {
        const { handleValidateProviderNPI } = await import("../functions/stubs");
        return res.json(await handleValidateProviderNPI(req.body));
      }
      case "enrichProviderDEAData": {
        const { handleEnrichProviderDEAData } = await import("../functions/stubs");
        return res.json(await handleEnrichProviderDEAData(req.body));
      }
      case "cleanProviderData": {
        const { handleCleanProviderData } = await import("../functions/stubs");
        return res.json(await handleCleanProviderData(req.body));
      }
      case "analyzeProviderNetwork": {
        const { handleAnalyzeProviderNetwork } = await import("../functions/stubs");
        return res.json(await handleAnalyzeProviderNetwork(req.body));
      }
      case "reconcileProviderData": {
        const { handleReconcileProviderData } = await import("../functions/stubs");
        return res.json(await handleReconcileProviderData(req.body));
      }
      case "generateHyperPersonalizedMessages": {
        const { handleGenerateHyperPersonalizedMessages } = await import("../functions/stubs");
        return res.json(await handleGenerateHyperPersonalizedMessages(req.body));
      }
      case "trackCampaignMetrics": {
        const { handleTrackCampaignMetrics } = await import("../functions/stubs");
        return res.json(await handleTrackCampaignMetrics(req.body));
      }
      case "sendCampaignMessages": {
        const { handleSendCampaignMessages } = await import("../functions/stubs");
        return res.json(await handleSendCampaignMessages(req.body));
      }
      case "calculateOutreachScore": {
        const { handleCalculateOutreachScore } = await import("../functions/stubs");
        return res.json(await handleCalculateOutreachScore(req.body));
      }
      case "analyzeImportedDataset": {
        const { handleAnalyzeImportedDataset } = await import("../functions/stubs");
        return res.json(await handleAnalyzeImportedDataset(req.body));
      }
      case "aiProjectAnalysis": {
        const { handleAiProjectAnalysis } = await import("../functions/stubs");
        return res.json(await handleAiProjectAnalysis(req.body));
      }

      default:
        return res.status(404).json({
          message: `Function '${functionName}' not found.`,
        });
    }
  } catch (e: any) {
    console.error(`[Function ${functionName} Error]`, e.message);
    res.status(500).json({ message: e.message });
  }
});

export default router;
