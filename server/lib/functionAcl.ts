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
 * Functions that operate the platform's shared data (imports, the crawler,
 * maintenance, rollups, scoring, token-spending enrichment of shared provider
 * records). Only platform admins may call them; an organization's owner
 * administers their own organization, not the data every customer shares.
 */
export const PLATFORM_FUNCTIONS: ReadonlySet<string> = new Set<string>([
  "triggerImport", "importNPPESFlatFile", "importAgentChat", "predictImportFormat", "analyzeImportedDataset",
  "testCMSApiConnector", "testCMSUrl", "nppesCrawler", "manageCrawlerRetries",
  "runScheduledImports", "runScheduledImportsFanout", "runMaintenanceFanout", "autoResumePausedImports", "autoRetryFailedImports",
  "cancelStalledImports", "cleanupAllImports", "runDueScheduledReports",
  "cleanProviderData", "reconcileProviderData", "matchProvidersToLocations", "runDataQualityScan",
  "loadCensusGeography", "refreshRollups", "getLeadScoringStatus", "recalculateLeadScores",
  "enrichBulkServerSide", "proactiveScanServerSide", "enrichmentJobStart", "enrichmentJobStop", "intelJobStart", "intelJobStop",
  "startDMEEmailSearch", "stopDMEEmailSearch", "bulkVerifyEmails", "emailSearchBot",
  "enrichProviderWithAI", "enrichProviderDEAData", "enrichProviderMedicareData", "enrichProviderThirdParty",
]);

/** The dispatcher's gate: public functions for any signed-in user, everything else admin-only. */
export function isFunctionAuthorized(functionName: string, role: string | undefined): boolean {
  return PUBLIC_FUNCTIONS.has(functionName) || role === "admin";
}

export interface FunctionCaller {
  role?: string;
  orgRole?: string | null;
  isPlatformAdmin?: boolean;
}

/**
 * With organizations: public functions for everyone, platform functions for
 * platform admins only, and the rest for organization owners (and the
 * legacy admin role).
 */
export function isFunctionAllowedFor(functionName: string, user: FunctionCaller | null | undefined): boolean {
  if (PUBLIC_FUNCTIONS.has(functionName)) return true;
  if (!user) return false;
  if (user.isPlatformAdmin) return true;
  if (PLATFORM_FUNCTIONS.has(functionName)) return false;
  return user.role === "admin" || user.orgRole === "owner";
}
