// Port of base44/functions/findEmail/entry.ts
// Dev diagnostic: scan a hard-coded list of legacy function files for the
// `npm:@base44/sdk@<version>` string and report which files reference it.
//
// NOTE: the `files` list refers to the old Base44 layout (`functions/*.js`),
// which no longer matches the repo. Ported faithfully — behavior identical —
// but it operates on a stale list, so in practice every entry will miss and
// the result will be `{ filesWithSDK: [] }` unless those legacy paths happen
// to exist relative to the server's working directory.
//
// Original used Deno.readTextFile; ported to node:fs/promises. The Base44 SDK
// import in the source was unused and is dropped. No DB access.
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export async function handleFindEmail(payload: any, user?: any): Promise<any> {
  const files = [
    "functions/importMedicareHHA.js",
    "functions/importMedicarePartD.js",
    "functions/autoResumePausedImports.js",
    "functions/onImportBatchFailed.js",
    "functions/importMedicareMAInpatient.js",
    "functions/importNPPESFlatFile.js",
    "functions/runScheduledImports.js",
    "functions/generateScheduledReport.js",
    "functions/checkDataQualityAlerts.js",
    "functions/retryFailedNPPESStates.js",
    "functions/runDataQualityScan.js",
    "functions/sendCampaignMessages.js",
    "functions/sendErrorNotification.js",
    "functions/getDashboardStats.js",
    "functions/getDataHealthMetrics.js",
    "functions/autoResumeBatchProcess.js",
    "functions/verifyProviderEmail.js",
    "functions/emailSearchBot.js",
    "functions/bulkEmailLookup.js",
    "functions/validateNPPESBatch.js",
    "functions/matchProvidersToLocations.js",
    "functions/reconcileProviderData.js",
    "functions/analyzeProviderNetwork.js",
    "functions/analyzeReferralPathways.js",
    "functions/batchEnrichExternalData.js",
    "functions/captureMetricsSnapshot.js",
    "functions/checkPartDUrl.js",
    "functions/checkSNFUrls.js",
    "functions/enrichProviderDEAData.js",
    "functions/enrichProviderData.js",
    "functions/enrichProviderMedicareData.js",
    "functions/findEmail.js",
    "functions/generateDataQualityReport.js",
    "functions/generateHyperPersonalizedMessages.js",
    "functions/generatePersonalizedOutreach.js",
    "functions/trackCampaignMetrics.js",
    "functions/validateProviderNPI.js",
    "functions/manageCrawlerRetries.js",
    "functions/autoImportCMSData.js",
    "functions/cancelStalledImports.js",
    "functions/autoFixImports.js",
    "functions/triggerImport.js",
    "functions/nppesCrawler.js",
    "functions/importMedicareSNF.js",
    "functions/checkCMSUrls.js",
    "functions/testCMSUrl.js",
    "functions/testCMSAPI.js",
    "functions/bulkVerifyEmails.js",
    "functions/cleanProviderData.js",
    "functions/autoEnrichProvider.js",
    "functions/autoEnrichmentAgent.js",
    "functions/providerEnrichmentApi.js",
    "functions/analyzeEmailQuality.js",
    "functions/deduplicateProviderEmails.js",
    "functions/onRuleCreated.js",
    "functions/validateDataQuality.js",
  ];

  const results: { file: string; version: string }[] = [];

  for (const f of files) {
    try {
      // Same semantics as the original Deno.readTextFile(`./${f}`):
      // resolved relative to the server's current working directory.
      const content = await readFile(resolve(f), "utf8");
      const match = content.match(/npm:@base44\/sdk@[0-9.]+/);
      if (match) {
        results.push({ file: f, version: match[0] });
      }
    } catch {
      // ignore — same as the original
    }
  }

  return { filesWithSDK: results };
}
