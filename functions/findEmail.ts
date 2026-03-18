import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    const files = [
        'functions/importMedicareHHA.js',
        'functions/importMedicarePartD.js',
        'functions/autoResumePausedImports.js',
        'functions/onImportBatchFailed.js',
        'functions/importMedicareMAInpatient.js',
        'functions/importNPPESFlatFile.js',
        'functions/runScheduledImports.js',
        'functions/generateScheduledReport.js',
        'functions/checkDataQualityAlerts.js',
        'functions/retryFailedNPPESStates.js',
        'functions/runDataQualityScan.js',
        'functions/sendCampaignMessages.js',
        'functions/sendErrorNotification.js',
        'functions/getDashboardStats.js',
        'functions/getDataHealthMetrics.js',
        'functions/autoResumeBatchProcess.js',
        'functions/verifyProviderEmail.js',
        'functions/emailSearchBot.js',
        'functions/bulkEmailLookup.js',
        'functions/validateNPPESBatch.js',
        'functions/matchProvidersToLocations.js',
        'functions/reconcileProviderData.js',
        'functions/analyzeProviderNetwork.js',
        'functions/analyzeReferralPathways.js',
        'functions/batchEnrichExternalData.js',
        'functions/captureMetricsSnapshot.js',
        'functions/checkPartDUrl.js',
        'functions/checkSNFUrls.js',
        'functions/enrichProviderDEAData.js',
        'functions/enrichProviderData.js',
        'functions/enrichProviderMedicareData.js',
        'functions/findEmail.js',
        'functions/generateDataQualityReport.js',
        'functions/generateHyperPersonalizedMessages.js',
        'functions/generatePersonalizedOutreach.js',
        'functions/trackCampaignMetrics.js',
        'functions/validateProviderNPI.js',
        'functions/manageCrawlerRetries.js',
        'functions/autoImportCMSData.js',
        'functions/cancelStalledImports.js',
        'functions/autoFixImports.js',
        'functions/triggerImport.js',
        'functions/nppesCrawler.js',
        'functions/importMedicareSNF.js',
        'functions/checkCMSUrls.js',
        'functions/testCMSUrl.js',
        'functions/testCMSAPI.js',
        'functions/bulkVerifyEmails.js',
        'functions/cleanProviderData.js',
        'functions/autoEnrichProvider.js',
        'functions/autoEnrichmentAgent.js',
        'functions/providerEnrichmentApi.js',
        'functions/analyzeEmailQuality.js',
        'functions/deduplicateProviderEmails.js',
        'functions/onRuleCreated.js',
        'functions/validateDataQuality.js'
    ];
    
    let results = [];
    
    for (const f of files) {
        try {
            const content = await Deno.readTextFile(`./${f}`);
            if (content.includes('SendEmail')) {
                results.push(f);
            }
        } catch (e) {
            // ignore
        }
    }
    
    return Response.json({ filesWithEmail: results });
});