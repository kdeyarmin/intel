import { Router, Response } from "express";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { isPlatformAdmin } from "../lib/roles";
import { rateLimit } from "../middleware/rateLimit";
import { CLAUDE_MODELS } from "../lib/aiModels";
import { isFunctionAllowedFor } from "../lib/functionAcl";
import { assertBillableOrg, orgAccessTier, SubscriptionError } from "../lib/entitlements";
import { publicErrorMessage } from "../lib/publicError";
import { consumeQuota } from "../lib/orgQuota";

const router = Router();

router.post("/:functionName", authMiddleware, rateLimit("functions", 240, 60_000), async (req: AuthRequest, res: Response) => {
  const { functionName } = req.params;

  if (!isFunctionAllowedFor(functionName, req.user)) {
    return res.status(403).json({
      message: "Forbidden",
      detail: "Admin access is required to invoke this function.",
    });
  }

  // Cost-incurring calls are gated on the organization's billing status: a
  // past_due or canceled organization keeps read-only access, but it may not
  // send paid email or burn AI tokens until it pays. The platform's own
  // operation (admin-only functions) is not a customer's spend.
  const requireBillableOrg = () => {
    if (isPlatformAdmin(req.user)) return;
    assertBillableOrg({ status: req.user?.orgStatus });
  };

  try {
    // The dunning ladder's last rung (orgAccessTier): an organization that is
    // canceled, or past_due for 14+ days, is billing-only — it can sign in and
    // use the Billing page, but function calls are closed until it pays.
    // getGeoCounties stays open: the Billing page's territory picker calls it,
    // and it serves public census reference data only.
    if (
      functionName !== "getGeoCounties"
      && !isPlatformAdmin(req.user)
      && req.user?.orgStatus
      && orgAccessTier({ status: req.user.orgStatus, billingStatusSince: req.user.orgBillingStatusSince }) === "billing_only"
    ) {
      throw new SubscriptionError("Your organization's subscription has lapsed. An owner can update payment on the Billing page to restore access.");
    }

    // Export-sized data fetches are metered server-side (A5.2): when the
    // caller asks for the export payload (for_export: true), one export is
    // consumed from the organization's daily quota before the handler runs.
    // The 429 carries its quota_exceeded code through the catch below, so the
    // count cannot be skipped by dropping the client's separate countExport()
    // call. Handlers that serve export-sized payloads (e.g. getDMEProviders)
    // lift their view caps only when this flag is set.
    if (req.body?.for_export === true) {
      await consumeQuota(req.user, "exports");
    }

    switch (functionName) {
      case "getDashboardStats": {
        const { getDashboardStats } = await import("../lib/dashboardStats");
        return res.json(await getDashboardStats());
      }

      case "getDataHealthAlerts": {
        const { db } = await import("../db");
        const { leadScores, providers, providerLocations, providerTaxonomies } = await import("../db/schema");
        const { sql, eq, inArray, isNotNull, desc } = await import("drizzle-orm");

        const highScores = await db.select().from(leadScores)
          .where(sql`score >= 80`)
          .orderBy(desc(leadScores.score))
          .limit(100);

        if (highScores.length === 0) {
          return res.json({ alerts: [] });
        }

        const scoreNpis = highScores.map((s: any) => s.npi).filter(Boolean);
        const matchedProviders = scoreNpis.length > 0
          ? await db.select().from(providers).where(inArray(providers.npi, scoreNpis))
          : [];
        const matchedLocations = scoreNpis.length > 0
          ? await db.select().from(providerLocations).where(inArray(providerLocations.npi, scoreNpis))
          : [];
        const matchedTaxonomies = scoreNpis.length > 0
          ? await db.select().from(providerTaxonomies).where(inArray(providerTaxonomies.npi, scoreNpis))
          : [];

        const alerts: any[] = [];
        for (const scoreItem of highScores) {
          const npi = (scoreItem as any).npi;
          const prov = matchedProviders.find((p: any) => p.npi === npi);
          if (!prov) continue;

          const locs = matchedLocations.filter((l: any) => l.npi === npi);
          const taxs = matchedTaxonomies.filter((t: any) => t.npi === npi);

          const hasEmail = !!(prov as any).email;
          const hasPhone = locs.some((l: any) => !!l.phone) || !!(prov as any).cell_phone;
          const hasSpecialty = taxs.some((t: any) => !!t.taxonomy_description);

          const missing: string[] = [];
          if (!hasEmail) missing.push('Email');
          if (!hasPhone) missing.push('Phone');
          if (!hasSpecialty) missing.push('Specialty');

          if (missing.length > 0) {
            alerts.push({
              npi,
              name: (prov as any).entity_type === 'Individual'
                ? `${(prov as any).first_name || ''} ${(prov as any).last_name || ''}`.trim()
                : (prov as any).organization_name || npi,
              score: (scoreItem as any).score,
              missing,
            });
          }
        }

        return res.json({ alerts: alerts.sort((a, b) => b.score - a.score).slice(0, 50) });
      }

      case "getCMSAnalytics": {
        // Reads the background rollups (server/lib/rollups); never aggregates the big tables here.
        const { pool: dbPool } = await import("../db");
        const { handleGetCMSAnalytics } = await import("../functions/cmsAnalytics");
        return res.json(await handleGetCMSAnalytics(dbPool));
      }

      case "getReferralNetworkData": {
        const { handleGetReferralNetworkData } = await import("../functions/referralNetwork");
        return res.json(await handleGetReferralNetworkData(req.body, req.user));
      }

      case "getTerritoryData": {
        const { handleGetTerritoryData } = await import("../functions/territory");
        return res.json(await handleGetTerritoryData(req.body, req.user));
      }

      case "getDataHealthMetrics": {
        const { db } = await import("../db");
        const { dataQualityAlerts, dataQualityScans } = await import("../db/schema");
        const { sql } = await import("drizzle-orm");

        // This function is public (any authenticated user). Estimate the
        // 6M-row providers count from pg_class instead of a full count(*)
        // scan — same approach as getDashboardStats. The alert/scan tables
        // are small operational tables, so count(*) there is fine.
        const provEst = await db.execute(sql`SELECT reltuples::bigint AS est FROM pg_class WHERE relname = 'providers'`);
        // reltuples is -1 for a never-ANALYZEd table (PG14+); clamp to 0.
        const providerCount = Math.max(0, Number((((provEst as any).rows || provEst) || [])[0]?.est) || 0);
        const [alertCount] = await db.select({ count: sql<number>`count(*)` }).from(dataQualityAlerts).where(sql`status = 'new'`);
        const [scanCount] = await db.select({ count: sql<number>`count(*)` }).from(dataQualityScans);
        // Completeness and accuracy come from the latest completed quality
        // scan (a sampled scan; see runDataQualityScan), not from a constant.
        const [latestScan] = await db.select({ results_summary: dataQualityScans.results_summary, completed_at: dataQualityScans.completed_at })
          .from(dataQualityScans)
          .where(sql`status = 'completed'`)
          .orderBy(sql`completed_at DESC NULLS LAST`)
          .limit(1);
        const { qualityScoresFrom } = await import("../lib/dataQualityScores");
        const scores = qualityScoresFrom(latestScan?.results_summary);

        return res.json({
          total_providers: providerCount,
          total_alerts: alertCount.count,
          total_scans: scanCount.count,
          data_completeness: scores.completeness,
          data_accuracy: scores.accuracy,
          scored_at: latestScan?.completed_at ?? null,
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
        const { handleEmailSearchBot } = await import("../functions/emailSearchBot");
        return res.json(await handleEmailSearchBot(req.body));
      }
      case "analyzeReferralPathways": {
        const { handleAnalyzeReferralPathways } = await import("../functions/stubs");
        return res.json(await handleAnalyzeReferralPathways(req.body));
      }
      case "matchProvidersToLocations": {
        const { consumeToken } = await import("../middleware/rateLimit");
        if (!consumeToken(`providerMatching:${req.user?.id ?? "anon"}`, 3, 60_000)) {
          return res.status(429).json({ message: "Matching is already running often. Try again in a minute." });
        }
        const { handleMatchProvidersToLocations } = await import("../functions/providerMatching");
        return res.json(await handleMatchProvidersToLocations(req.body));
      }
      case "generateScheduledReport": {
        // Sends email with the report; gate on billing before the rate limit.
        requireBillableOrg();
        const { consumeToken } = await import("../middleware/rateLimit");
        if (!consumeToken(`scheduledReport:${req.user?.id ?? "anon"}`, 6, 60_000)) {
          return res.status(429).json({ message: "Too many report runs. Try again in a minute." });
        }
        const { handleGenerateScheduledReport } = await import("../functions/scheduledReports");
        return res.json(await handleGenerateScheduledReport(req.body, req.user));
      }
      case "runDueScheduledReports": {
        const { consumeToken } = await import("../middleware/rateLimit");
        if (!consumeToken(`maint:runDueScheduledReports:${req.user?.id ?? "anon"}`, 6, 60_000)) {
          return res.status(429).json({ message: "Maintenance task rate limit exceeded. Try again in a minute." });
        }
        const { runDueScheduledReportsWorker, writeMaintenanceHeartbeat } = await import("../lib/maintenance");
        const result = await runDueScheduledReportsWorker();
        await writeMaintenanceHeartbeat([result], "admin_ui", { userEmail: req.user?.email });
        return res.json({ success: result.ok, worker: result });
      }
      case "testCMSUrl": {
        const { consumeToken } = await import("../middleware/rateLimit");
        if (!consumeToken(`urlCheck:${req.user?.id ?? "anon"}`, 20, 60_000)) {
          return res.status(429).json({ message: "Too many URL checks. Try again in a minute." });
        }
        const { handleTestCMSUrl } = await import("../functions/verification");
        return res.json(await handleTestCMSUrl(req.body));
      }
      case "predictImportFormat": {
        const { handlePredictImportFormat } = await import("../functions/stubs");
        return res.json(await handlePredictImportFormat(req.body));
      }
      case "testCMSApiConnector": {
        const { consumeToken } = await import("../middleware/rateLimit");
        if (!consumeToken(`urlCheck:${req.user?.id ?? "anon"}`, 20, 60_000)) {
          return res.status(429).json({ message: "Too many connection tests. Try again in a minute." });
        }
        const { handleTestCMSApiConnector } = await import("../functions/verification");
        return res.json(await handleTestCMSApiConnector(req.body));
      }
      case "enrichProviderThirdParty": {
        const { handleEnrichProviderThirdParty } = await import("../functions/stubs");
        return res.json(await handleEnrichProviderThirdParty(req.body));
      }
      case "enrichBulkServerSide": {
        const { handleEnrichBulkServerSide } = await import("../functions/stubs");
        return res.json(await handleEnrichBulkServerSide(req.body));
      }
      case "getEnrichmentCandidateCount": {
        const { handleGetIntelCandidateCount } = await import("../functions/providerIntelligenceBot");
        return res.json(await handleGetIntelCandidateCount());
      }
      case "proactiveScanServerSide": {
        const { handleProactiveScanServerSide } = await import("../functions/stubs");
        return res.json(await handleProactiveScanServerSide(req.body));
      }
      case "enrichmentJobStart":
      case "intelJobStart": {
        const { handleIntelJobStart } = await import("../functions/providerIntelligenceBot");
        return res.json(await handleIntelJobStart(req.body, { id: req.user!.id, orgId: req.user!.orgId ?? null }));
      }
      case "enrichmentJobStop":
      case "intelJobStop": {
        const { handleIntelJobStop } = await import("../functions/providerIntelligenceBot");
        return res.json(await handleIntelJobStop());
      }
      case "enrichmentJobStatus":
      case "intelJobStatus": {
        const { handleIntelJobStatus } = await import("../functions/providerIntelligenceBot");
        return res.json(await handleIntelJobStatus());
      }
      case "getIntelCandidateCount": {
        const { handleGetIntelCandidateCount } = await import("../functions/providerIntelligenceBot");
        return res.json(await handleGetIntelCandidateCount());
      }
      case "verifyProviderEmail": {
        const { consumeToken } = await import("../middleware/rateLimit");
        if (!consumeToken(`emailVerify:${req.user?.id ?? "anon"}`, 30, 60_000)) {
          return res.status(429).json({ message: "Too many email checks. Try again in a minute." });
        }
        const { handleVerifyProviderEmail } = await import("../functions/verification");
        return res.json(await handleVerifyProviderEmail(req.body));
      }
      case "bulkVerifyEmails": {
        const { consumeToken } = await import("../middleware/rateLimit");
        if (!consumeToken(`bulkEmailVerify:${req.user?.id ?? "anon"}`, 10, 60_000)) {
          return res.status(429).json({ message: "Too many bulk verifications. Try again in a minute." });
        }
        const { handleBulkVerifyEmails } = await import("../functions/verification");
        return res.json(await handleBulkVerifyEmails(req.body));
      }
      case "enrichProviderMedicareData": {
        const { handleEnrichProviderMedicareData } = await import("../functions/stubs");
        return res.json(await handleEnrichProviderMedicareData(req.body));
      }
      case "validateProviderNPI": {
        const { consumeToken } = await import("../middleware/rateLimit");
        if (!consumeToken(`npiValidate:${req.user?.id ?? "anon"}`, 30, 60_000)) {
          return res.status(429).json({ message: "Too many NPI checks. Try again in a minute." });
        }
        const { handleValidateProviderNPI } = await import("../functions/verification");
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
        // The "full" analysis calls the AI; the rules analysis is read-only.
        if (req.body?.analysis_type === "full") requireBillableOrg();
        const { consumeToken } = await import("../middleware/rateLimit");
        if (!consumeToken(`networkAnalysis:${req.user?.id ?? "anon"}`, 10, 60_000)) {
          return res.status(429).json({ message: "Too many network analyses. Try again in a minute." });
        }
        const { handleAnalyzeProviderNetwork } = await import("../functions/networkAnalysis");
        return res.json(await handleAnalyzeProviderNetwork(req.body, req.user));
      }
      case "reconcileProviderData": {
        const { handleReconcileProviderData } = await import("../functions/reconciliation");
        return res.json(await handleReconcileProviderData(req.body));
      }
      case "cleanupAllImports": {
        const { consumeToken } = await import("../middleware/rateLimit");
        if (!consumeToken(`maint:cleanupAllImports:${req.user?.id ?? "anon"}`, 2, 60_000)) {
          return res.status(429).json({ message: "Maintenance task rate limit exceeded. Try again in a minute." });
        }
        const { runCleanupAllImports, writeMaintenanceHeartbeat } = await import("../lib/maintenance");
        const result = await runCleanupAllImports();
        await writeMaintenanceHeartbeat([result], "admin_ui", { userEmail: req.user?.email });
        return res.json({
          success: result.ok,
          message: result.ok ? "All non-completed imports and queue items deleted" : `Cleanup failed: ${result.error}`,
          remaining: (result.details as { remaining?: unknown })?.remaining ?? [],
          worker: result,
        });
      }
      case "autoResumePausedImports": {
        const { consumeToken } = await import("../middleware/rateLimit");
        if (!consumeToken(`maint:autoResumePausedImports:${req.user?.id ?? "anon"}`, 6, 60_000)) {
          return res.status(429).json({ message: "Maintenance task rate limit exceeded. Try again in a minute." });
        }
        const { runAutoResumePausedImports, writeMaintenanceHeartbeat } = await import("../lib/maintenance");
        const result = await runAutoResumePausedImports();
        await writeMaintenanceHeartbeat([result], "admin_ui", { userEmail: req.user?.email });
        return res.json({ success: result.ok, worker: result });
      }
      case "autoRetryFailedImports": {
        const { consumeToken } = await import("../middleware/rateLimit");
        if (!consumeToken(`maint:autoRetryFailedImports:${req.user?.id ?? "anon"}`, 6, 60_000)) {
          return res.status(429).json({ message: "Maintenance task rate limit exceeded. Try again in a minute." });
        }
        const { runAutoRetryFailedImports, writeMaintenanceHeartbeat } = await import("../lib/maintenance");
        const result = await runAutoRetryFailedImports();
        await writeMaintenanceHeartbeat([result], "admin_ui", { userEmail: req.user?.email });
        return res.json({ success: result.ok, worker: result });
      }
      case "manageCrawlerRetries": {
        const { consumeToken } = await import("../middleware/rateLimit");
        if (!consumeToken(`maint:manageCrawlerRetries:${req.user?.id ?? "anon"}`, 6, 60_000)) {
          return res.status(429).json({ message: "Maintenance task rate limit exceeded. Try again in a minute." });
        }
        const { runManageCrawlerRetries, writeMaintenanceHeartbeat } = await import("../lib/maintenance");
        const result = await runManageCrawlerRetries();
        await writeMaintenanceHeartbeat([result], "admin_ui", { userEmail: req.user?.email });
        return res.json({ success: result.ok, worker: result });
      }
      case "cancelStalledImports": {
        const { consumeToken } = await import("../middleware/rateLimit");
        if (!consumeToken(`maint:cancelStalledImports:${req.user?.id ?? "anon"}`, 6, 60_000)) {
          return res.status(429).json({ message: "Maintenance task rate limit exceeded. Try again in a minute." });
        }
        const { runCancelStalledImports, writeMaintenanceHeartbeat } = await import("../lib/maintenance");
        const result = await runCancelStalledImports();
        await writeMaintenanceHeartbeat([result], "admin_ui", { userEmail: req.user?.email });
        return res.json({ success: result.ok, worker: result });
      }
      case "runScheduledImports": {
        // Same task the external cron hits at /api/maintenance/runScheduledImports:
        // start every due schedule, then fan out to the maintenance workers.
        // Admin-only (not in PUBLIC_FUNCTIONS).
        const { consumeToken } = await import("../middleware/rateLimit");
        if (!consumeToken(`maint:runScheduledImports:${req.user?.id ?? "anon"}`, 2, 60_000)) {
          return res.status(429).json({ message: "Scheduled imports were just run. Try again in a minute." });
        }
        const { handleRunScheduledImports } = await import("../functions/scheduledImports");
        return res.json(await handleRunScheduledImports(req.body, req.user));
      }
      case "runScheduledImportsFanout":
      case "runMaintenanceFanout": {
        const { consumeToken } = await import("../middleware/rateLimit");
        // Fanout runs every worker, so cap it more aggressively than the
        // per-worker buttons. Two manual invocations a minute is plenty.
        if (!consumeToken(`maint:fanout:${req.user?.id ?? "anon"}`, 2, 60_000)) {
          return res.status(429).json({ message: "Maintenance fanout rate limit exceeded. Try again in a minute." });
        }
        const { runMaintenanceFanout } = await import("../lib/maintenance");
        const { workers } = await runMaintenanceFanout("admin_ui", { userEmail: req.user?.email });
        return res.json({
          success: workers.every(w => w.ok),
          workers,
          succeeded: workers.filter(w => w.ok).length,
          failed: workers.filter(w => !w.ok).length,
        });
      }
      case "generateHyperPersonalizedMessages": {
        const { handleGenerateHyperPersonalizedMessages } = await import("../functions/stubs");
        return res.json(await handleGenerateHyperPersonalizedMessages(req.body));
      }
      case "trackCampaignMetrics": {
        // Admin-only (not in PUBLIC_FUNCTIONS): writes the rollup to the campaign row.
        const { handleTrackCampaignMetrics } = await import("../functions/outreach");
        return res.json(await handleTrackCampaignMetrics(req.body, req.user));
      }
      case "saveCampaignOutcomes": {
        // Admin-only (not in PUBLIC_FUNCTIONS), like the rest of campaigns.
        const { handleSaveCampaignOutcomes } = await import("../functions/outreach");
        return res.json(await handleSaveCampaignOutcomes(req.body, req.user));
      }
      case "prepareCampaignMessages": {
        // Admin-only (not in PUBLIC_FUNCTIONS): builds the recipient list.
        const { handlePrepareCampaignMessages } = await import("../functions/outreach");
        return res.json(await handlePrepareCampaignMessages(req.body, req.user));
      }
      case "sendCampaignMessages": {
        // Admin-only (not in PUBLIC_FUNCTIONS): sends real email.
        requireBillableOrg();
        const { handleSendCampaignMessages } = await import("../functions/outreach");
        return res.json(await handleSendCampaignMessages(req.body, req.user));
      }
      case "calculateOutreachScore": {
        // The AI strategy costs tokens; the rules-only score is free.
        if (req.body?.with_ai) requireBillableOrg();
        const { consumeToken } = await import("../middleware/rateLimit");
        if (!consumeToken(`outreachScore:${req.user?.id ?? "anon"}`, 30, 60_000)) {
          return res.status(429).json({ message: "Too many score calculations. Try again in a minute." });
        }
        const { handleCalculateOutreachScore } = await import("../functions/outreach");
        return res.json(await handleCalculateOutreachScore(req.body, req.user));
      }
      case "analyzeImportedDataset": {
        const { handleAnalyzeImportedDataset } = await import("../functions/analyzeImportedDataset");
        return res.json(await handleAnalyzeImportedDataset(req.body, req.user));
      }
      case "checkCMSDataApiUrls": {
        const { handleCheckCmsDataApiUrls } = await import("../functions/checkCMSDataApiUrls");
        return res.json(await handleCheckCmsDataApiUrls(req.body, req.user));
      }
      case "testCMSOffset": {
        const { handleTestCmsOffset } = await import("../functions/testCMSOffset");
        return res.json(await handleTestCmsOffset(req.body, req.user));
      }
      case "findEmail": {
        const { handleFindEmail } = await import("../functions/findEmail");
        return res.json(await handleFindEmail(req.body, req.user));
      }
      case "aiProjectAnalysis": {
        const { handleAiProjectAnalysis } = await import("../functions/aiProjectAnalysis");
        return res.json(await handleAiProjectAnalysis(req.body, req.user));
      }
      case "autoFixImports": {
        const { consumeToken } = await import("../middleware/rateLimit");
        if (!consumeToken(`maint:autoFixImports:${req.user?.id ?? "anon"}`, 6, 60_000)) {
          return res.status(429).json({ message: "Maintenance task rate limit exceeded. Try again in a minute." });
        }
        const { runAutoFixImports } = await import("../functions/autoFixImports");
        return res.json({ success: true, worker: await runAutoFixImports() });
      }
      case "onImportBatchCompleted": {
        const { onImportBatchCompleted } = await import("../functions/onImportBatchCompleted");
        const { db } = await import("../db");
        const { importBatches } = await import("../db/schema");
        const { eq } = await import("drizzle-orm");
        const batchId = Number(req.body?.batch_id);
        if (!batchId) return res.status(400).json({ message: "batch_id is required" });
        const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, batchId)).limit(1);
        if (!batch) return res.status(404).json({ message: `Batch #${batchId} not found` });
        await onImportBatchCompleted(batch); // never throws; no-ops unless completed
        return res.json({ ok: true, message: `Dependency evaluation ran for batch #${batchId}` });
      }
      case "onImportBatchFailed": {
        const { db } = await import("../db");
        const { importBatches } = await import("../db/schema");
        const { eq } = await import("drizzle-orm");
        const batchId = Number(req.body?.batchId);
        if (!batchId) return res.status(400).json({ message: "batchId is required" });
        const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, batchId)).limit(1);
        if (!batch) return res.status(404).json({ message: "Batch not found" });
        const { onImportBatchFailed } = await import("../functions/onImportBatchFailed");
        await onImportBatchFailed(batch);
        return res.json({ success: true, batchId });
      }
      case "onRuleCreated": {
        const { onRuleCreated } = await import("../functions/onRuleCreated");
        const rule = req.body?.rule ?? { id: 0 };
        const ruleType = req.body?.ruleType === "dataCleaning" ? "dataCleaning" : "columnMapping";
        await onRuleCreated(rule, ruleType as "columnMapping" | "dataCleaning");
        return res.json({ success: true });
      }
      case "autoCategorizeProvider": {
        // Manual backfill path: when AI_FEATURES_ENABLED is eventually flipped, everything
        // created while paused still lacks ai_category.
        const { autoCategorizeProvider } = await import("../functions/autoCategorizeProvider");
        const npi = String(req.body?.npi || "").trim();
        if (!/^\d{10}$/.test(npi)) return res.status(400).json({ message: "A 10-digit npi is required" });
        const { db } = await import("../db");
        const { providers } = await import("../db/schema");
        const { eq } = await import("drizzle-orm");
        const rows = await db.select().from(providers).where(eq(providers.npi, npi)).limit(1);
        if (!rows[0]) return res.status(404).json({ message: "Provider not found" });
        await autoCategorizeProvider(rows[0]);
        return res.json({ success: true });
      }
      case "getFacilityDetail": {
        const { handleGetFacilityDetail } = await import("../functions/facilityDetail");
        return res.json(await handleGetFacilityDetail(req.body));
      }
      case "listFacilities": {
        const { handleListFacilities } = await import("../functions/facilityDetail");
        return res.json(await handleListFacilities(req.body));
      }
      case "getProviderCMSData": {
        const { handleGetProviderCMSData } = await import("../functions/facilityDetail");
        return res.json(await handleGetProviderCMSData(req.body));
      }
      case "getLeadListMemberDetails": {
        const { handleGetLeadListMemberDetails } = await import("../functions/leadListDetails");
        return res.json(await handleGetLeadListMemberDetails(req.body));
      }

      case "importAgentChat": {
        const { message, history } = req.body;
        const { db } = await import("../db");
        const { importBatches } = await import("../db/schema");
        const { sql, eq, inArray, desc } = await import("drizzle-orm");

        const batchRows = await db.select({
          id: importBatches.id,
          import_type: importBatches.import_type,
          status: importBatches.status,
          imported_rows: importBatches.imported_rows,
          total_rows: importBatches.total_rows,
          error_count: importBatches.error_count,
          created_date: importBatches.created_date,
        }).from(importBatches)
          .orderBy(desc(importBatches.created_date))
          .limit(20);

        const systemPrompt = `You are the CareMetric AI Import Manager. You help monitor and troubleshoot data import jobs.

Current import batches (most recent 20):
${JSON.stringify(batchRows, null, 2)}

You can answer questions about:
- Import job status (active, completed, failed, paused)
- Error counts and failure reasons
- Import progress and row counts
- General data import troubleshooting

Be concise and helpful. Use markdown formatting for readability.`;

        const Anthropic = (await import("@anthropic-ai/sdk")).default;
        const anthropic = new Anthropic();

        const chatMessages = (history || [])
          .filter((m: any) => m.role === 'user' || m.role === 'assistant')
          .map((m: any) => ({ role: m.role, content: m.content }));

        if (!chatMessages.length || chatMessages[chatMessages.length - 1]?.content !== message) {
          chatMessages.push({ role: 'user' as const, content: message });
        }

        const response = await anthropic.messages.create({
          model: CLAUDE_MODELS.SONNET,
          max_tokens: 1024,
          system: systemPrompt,
          messages: chatMessages,
        });

        const reply = response.content
          .filter((b: any) => b.type === 'text')
          .map((b: any) => b.text)
          .join('\n');

        return res.json({ reply });
      }

      case "getCountyIntelligence": {
        const { handleGetCountyIntelligence } = await import("../functions/countyIntelligence");
        return res.json(await handleGetCountyIntelligence(req.body, req.user));
      }

      case "getCountyMarket": {
        const { handleGetCountyMarket } = await import("../functions/market");
        return res.json(await handleGetCountyMarket(req.body, req.user));
      }

      case "getHospitalCatchment": {
        const { handleGetHospitalCatchment } = await import("../functions/market");
        return res.json(await handleGetHospitalCatchment(req.body, req.user));
      }

      case "getFacilityMarket": {
        const { handleGetFacilityMarket } = await import("../functions/market");
        return res.json(await handleGetFacilityMarket(req.body, req.user));
      }

      case "getCountyMarketLayer": {
        const { handleGetCountyMarketLayer } = await import("../functions/market");
        return res.json(await handleGetCountyMarketLayer(req.body, req.user));
      }

      case "getReferralSources": {
        const { handleGetReferralSources } = await import("../functions/market");
        return res.json(await handleGetReferralSources(req.body, req.user));
      }

      case "getServiceAreaOverlap": {
        const { handleGetServiceAreaOverlap } = await import("../functions/market");
        return res.json(await handleGetServiceAreaOverlap(req.body, req.user));
      }

      case "getStateMarketLeaders": {
        const { handleGetStateMarketLeaders } = await import("../functions/market");
        return res.json(await handleGetStateMarketLeaders(req.body, req.user));
      }

      case "getMarketRoster": {
        const { handleGetMarketRoster } = await import("../functions/callSheets");
        return res.json(await handleGetMarketRoster(req.body, req.user));
      }

      case "getAvailableStatesCounties": {
        const { handleGetAvailableStatesCounties } = await import("../functions/countyIntelligence");
        return res.json(await handleGetAvailableStatesCounties(req.body));
      }

      case "getComprehensiveReport": {
        const { handleGetComprehensiveReport } = await import("../functions/comprehensiveReport");
        return res.json(await handleGetComprehensiveReport(req.body, req.user));
      }

      case "getDMEProviders": {
        const { handleGetDMEProviders } = await import("../functions/dmeReport");
        return res.json(await handleGetDMEProviders(req.body));
      }
      case "dmeEmailSearchStatus": {
        const { handleDMEEmailSearchStatus } = await import("../functions/dmeReport");
        return res.json(await handleDMEEmailSearchStatus());
      }
      case "startDMEEmailSearch": {
        const { handleStartDMEEmailSearch } = await import("../functions/dmeReport");
        return res.json(await handleStartDMEEmailSearch(req.body));
      }
      case "stopDMEEmailSearch": {
        const { handleStopDMEEmailSearch } = await import("../functions/dmeReport");
        return res.json(await handleStopDMEEmailSearch());
      }

      case "searchProviders": {
        // Server-side provider search (see server/lib/providerSearch.ts).
        const { handleSearchProviders } = await import("../functions/search");
        return res.json(await handleSearchProviders(req.body, req.user));
      }

      case "getOperationsAlerts": {
        const { pool } = await import("../db");
        const { evaluateOperationsAlerts, loadOperationsSnapshot } = await import("../lib/operationsAlerts");
        const snapshot = await loadOperationsSnapshot(pool);
        return res.json({ alerts: evaluateOperationsAlerts(snapshot), checked_at: new Date().toISOString() });
      }

      case "getRollupStatus": {
        const { handleGetRollupStatus } = await import("../functions/rollups");
        return res.json(await handleGetRollupStatus());
      }

      case "getDataFreshness": {
        const { handleGetDataFreshness } = await import("../functions/dataFreshness");
        return res.json(await handleGetDataFreshness({ includeNotes: isPlatformAdmin(req.user) }));
      }

      case "refreshRollups": {
        const { handleRefreshRollups } = await import("../functions/rollups");
        return res.json(await handleRefreshRollups(req.body, req.user));
      }

      case "getLeadScoringStatus": {
        const { handleGetLeadScoringStatus } = await import("../functions/leadScoring");
        return res.json(await handleGetLeadScoringStatus());
      }

      case "recalculateLeadScores": {
        const { handleRecalculateLeadScores } = await import("../functions/leadScoring");
        return res.json(await handleRecalculateLeadScores(req.body, req.user));
      }

      case "getGeoStatus": {
        const { handleGetGeoStatus } = await import("../functions/geography");
        return res.json(await handleGetGeoStatus());
      }

      case "getGeoCounties": {
        const { handleGetGeoCounties } = await import("../functions/geography");
        return res.json(await handleGetGeoCounties(req.body));
      }

      case "getZipCoordinates": {
        const { handleGetZipCoordinates } = await import("../functions/geography");
        return res.json(await handleGetZipCoordinates(req.body));
      }

      case "getGeoContext": {
        const { handleGetGeoContext } = await import("../functions/geography");
        return res.json(await handleGetGeoContext(req.body));
      }

      case "loadCensusGeography": {
        const { handleLoadCensusGeography } = await import("../functions/geography");
        return res.json(await handleLoadCensusGeography(req.body));
      }

      case "searchLocations": {
        const { handleSearchLocations } = await import("../functions/search");
        return res.json(await handleSearchLocations(req.body, req.user));
      }

      default:
        return res.status(404).json({
          message: `Function '${functionName}' not found.`,
        });
    }
  } catch (e: any) {
    const statusCode = e.status || 500;
    console.error(`[Function ${functionName} Error]`, e.message);
    // Deliberate HTTP errors carry a machine-readable code (quota_exceeded,
    // outside_territory, subscription_inactive, …); internal failures stay
    // message-only so nothing about the stack leaks.
    const body: Record<string, unknown> = { message: publicErrorMessage(e) };
    if (e.status && typeof e.code === "string") body.code = e.code;
    res.status(statusCode).json(body);
  }
});

export default router;
