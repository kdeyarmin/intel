import { Router, Response } from "express";
import { authMiddleware, AuthRequest } from "../middleware/auth";

const router = Router();

router.post("/:functionName", authMiddleware, async (req: AuthRequest, res: Response) => {
  const { functionName } = req.params;

  try {
    switch (functionName) {
      case "getDashboardStats": {
        const { db } = await import("../db");
        const {
          providers, providerLocations, providerTaxonomies,
          cmsReferrals, providerServiceUtilization,
          importBatches, dataQualityAlerts, dataQualityScans,
          auditEvents,
        } = await import("../db/schema");
        const { sql, desc, eq, isNotNull, and } = await import("drizzle-orm");

        const [providerCount] = await db.select({ count: sql<number>`count(*)` }).from(providers);
        const totalProviders = Number(providerCount.count);

        const [locationCount] = await db.select({ count: sql<number>`count(*)` }).from(providerLocations);
        const totalLocations = Number(locationCount.count);

        const [referralCount] = await db.select({ count: sql<number>`count(*)` }).from(cmsReferrals);
        const totalReferrals = Number(referralCount.count);

        const [utilizationCount] = await db.select({ count: sql<number>`count(*)` }).from(providerServiceUtilization);
        const totalUtilization = Number(utilizationCount.count);

        const [taxonomyCount] = await db.select({ count: sql<number>`count(*)` }).from(providerTaxonomies);
        const totalTaxonomies = Number(taxonomyCount.count);

        const [emailCount] = await db.select({ count: sql<number>`count(*)` }).from(providers).where(isNotNull(providers.email));
        const withEmail = Number(emailCount.count);
        const needsEnrichment = totalProviders - withEmail;

        const topStatesRows = await db.select({
          state: providerLocations.state,
          count: sql<number>`count(*)`,
        }).from(providerLocations)
          .where(isNotNull(providerLocations.state))
          .groupBy(providerLocations.state)
          .orderBy(sql`count(*) desc`)
          .limit(5);
        const topStates = topStatesRows.map(r => [r.state, Number(r.count)]);

        const { or, inArray } = await import("drizzle-orm");
        const [activeImports] = await db.select({ count: sql<number>`count(*)` }).from(importBatches).where(inArray(importBatches.status, ["processing", "validating", "pending"]));
        const [completedImports] = await db.select({ count: sql<number>`count(*)` }).from(importBatches).where(eq(importBatches.status, "completed"));
        const [failedImports] = await db.select({ count: sql<number>`count(*)` }).from(importBatches).where(eq(importBatches.status, "failed"));

        const [openAlertCount] = await db.select({ count: sql<number>`count(*)` }).from(dataQualityAlerts).where(eq(dataQualityAlerts.status, "new"));

        const latestScan = await db.select().from(dataQualityScans).orderBy(desc(dataQualityScans.created_date)).limit(1);
        let dataQuality = null;
        if (latestScan.length > 0) {
          const scan = latestScan[0] as any;
          const summary = scan.results_summary as any;
          let score = 0;
          if (summary && typeof summary.score === "number") {
            score = summary.score;
          } else if (scan.total_records > 0) {
            score = Math.round(((scan.total_records - (scan.issues_found || 0)) / scan.total_records) * 100);
          }
          dataQuality = { score };
        }

        const completedBatches = await db.select().from(importBatches)
          .where(eq(importBatches.status, "completed"))
          .orderBy(desc(importBatches.created_date)).limit(1);
        const latestBatch = completedBatches.length > 0
          ? completedBatches
          : await db.select().from(importBatches).orderBy(desc(importBatches.created_date)).limit(1);
        const lastRefresh = latestBatch.length > 0 ? (latestBatch[0] as any).created_date : null;

        const providerSamples = await db.select().from(providers).limit(200);
        const utilizationSamples = await db.select().from(providerServiceUtilization).limit(200);
        const referralSamples = await db.select().from(cmsReferrals).limit(200);
        const locationSamples = await db.select().from(providerLocations).limit(200);

        return res.json({
          totalProviders,
          totalLocations,
          totalReferrals,
          totalUtilization,
          totalTaxonomies,
          emailStats: {
            withEmail,
            needsEnrichment,
            isEstimated: false,
            valid: 0,
            risky: 0,
            invalid: 0,
          },
          topStates,
          imports: {
            active: Number(activeImports.count),
            completed: Number(completedImports.count),
            failed: Number(failedImports.count),
          },
          openAlerts: Number(openAlertCount.count),
          dataQuality,
          lastRefresh,
          samples: {
            providers: providerSamples,
            utilizations: utilizationSamples,
            referrals: referralSamples,
            locations: locationSamples,
          },
          isEstimatedCounts: false,
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

      case "getCMSDatasetCatalog": {
        const { getCMSDatasetCatalog } = await import("../functions/triggerImport");
        return res.json(await getCMSDatasetCatalog());
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
