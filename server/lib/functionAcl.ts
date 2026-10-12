// Default-deny authorization for the function dispatcher. Only the read-only /
// analytics / status functions below are callable by any authenticated user.
// Everything else (imports, crawler control, AI enrichment that spends tokens or
// writes provider data, email sending, and destructive maintenance) requires the
// admin role. Adding a new function therefore requires an explicit decision: if
// it is safe and read-only, list it here; otherwise it is admin-only by default.
export const PUBLIC_FUNCTIONS: ReadonlySet<string> = new Set<string>([
  "getDashboardStats",
  "getDataHealthAlerts",
  "getCMSAnalytics",
  "getReferralNetworkData",
  "getTerritoryData",
  "getDataHealthMetrics",
  "getCMSDatasetCatalog",
  "validateDataQuality",
  "getEnrichmentCandidateCount",
  "getIntelCandidateCount",
  "enrichmentJobStatus",
  "intelJobStatus",
  "getFacilityDetail",
  "listFacilities",
  "getProviderCMSData",
  // Read-only: the rows any user can already read through the entity API.
  "getLeadListMemberDetails",
  "getCountyIntelligence",
  "getAvailableStatesCounties",
  "getComprehensiveReport",
  "getDMEProviders",
  "dmeEmailSearchStatus",
  "searchProviders",
  "searchLocations",
  // Census geography lookups (read-only). loadCensusGeography stays admin-only.
  "getGeoCounties",
  "getGeoStatus",
  "getZipCoordinates",
  "getGeoContext",
  // When each analytics rollup last refreshed (read-only). refreshRollups is admin-only.
  "getRollupStatus",
  // Which version of each dataset is loaded and how old it is (read-only).
  "getDataFreshness",
  // Market and patient-flow views from the rollups (read-only; server/functions/market.ts).
  "getCountyMarket",
  "getHospitalCatchment",
  "getFacilityMarket",
  "getCountyMarketLayer",
  "getReferralSources",
  "getServiceAreaOverlap",
  "getStateMarketLeaders",
  "getMarketRoster",
  // Read-only for non-admins: no AI call and nothing saved (see the handler).
  "calculateOutreachScore",
  // Runs or previews a saved report schedule (any user can create schedules);
  // the "run_all_due" action is admin-only inside the handler. Recipients are
  // limited to app users and REPORT_RECIPIENT_DOMAINS.
  "generateScheduledReport",
  // Rate-limited checks; they only write derived verification fields.
  "validateProviderNPI",
  "verifyProviderEmail",
  "analyzeReferralPathways",
  "analyzeProviderNetwork",
]);

/**
 * What an organization's owner may call beyond the public functions: the
 * campaign work their Campaigns page does (it sends mail and spends their
 * quota). A positive list, so a function added later is denied to owners until
 * someone lists it here on purpose.
 */
export const OWNER_FUNCTIONS: ReadonlySet<string> = new Set<string>([
  "generateHyperPersonalizedMessages", "trackCampaignMetrics", "saveCampaignOutcomes", "prepareCampaignMessages", "sendCampaignMessages",
]);

/**
 * Functions that operate the platform's shared data (imports, the crawler,
 * maintenance, rollups, scoring, token-spending enrichment of shared provider
 * records). Only platform admins may call them; an organization's owner
 * administers their own organization, not the data every customer shares.
 * Every function the dispatcher serves is public, an owner's or listed here
 * (tests/functionsDispatch.test.ts), so adding one is an explicit decision.
 */
export const PLATFORM_FUNCTIONS: ReadonlySet<string> = new Set<string>([
  "triggerImport", "importNPPESFlatFile", "importAgentChat", "predictImportFormat", "analyzeImportedDataset",
  "testCMSApiConnector", "testCMSUrl", "nppesCrawler", "manageCrawlerRetries",
  "runScheduledImports", "runScheduledImportsFanout", "runMaintenanceFanout", "autoResumePausedImports", "autoRetryFailedImports",
  "cancelStalledImports", "cleanupAllImports", "runDueScheduledReports",
  "cleanProviderData", "reconcileProviderData", "matchProvidersToLocations", "runDataQualityScan",
  "loadCensusGeography", "refreshRollups", "getLeadScoringStatus", "recalculateLeadScores", "getOperationsAlerts",
  "enrichBulkServerSide", "proactiveScanServerSide", "enrichmentJobStart", "enrichmentJobStop", "intelJobStart", "intelJobStop",
  "startDMEEmailSearch", "stopDMEEmailSearch", "bulkVerifyEmails", "emailSearchBot",
  "enrichProviderWithAI", "enrichProviderDEAData", "enrichProviderMedicareData", "enrichProviderThirdParty",
]);

/** The dispatcher's gate: public functions for any signed-in user, everything else admin-only. */
export interface FunctionCaller {
  role?: string;
  orgRole?: string | null;
  isPlatformAdmin?: boolean;
}

/**
 * With organizations: public functions for everyone, the campaign functions
 * for an organization's owners, and everything else (listed or not) for
 * platform admins only.
 */
export function isFunctionAllowedFor(functionName: string, user: FunctionCaller | null | undefined): boolean {
  if (PUBLIC_FUNCTIONS.has(functionName)) return true;
  if (!user) return false;
  // The admin role and the platform-admin flag are one thing (see isPlatformAdmin in middleware/auth.ts).
  if (user.isPlatformAdmin || user.role === "admin") return true;
  return user.orgRole === "owner" && OWNER_FUNCTIONS.has(functionName);
}
