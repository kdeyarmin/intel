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
  "getCountyIntelligence",
  "getAvailableStatesCounties",
  "getComprehensiveReport",
  "getDMEProviders",
  "dmeEmailSearchStatus",
  "searchProviders",
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
  "trackCampaignMetrics",
]);

/** The dispatcher's gate: public functions for any signed-in user, everything else admin-only. */
export function isFunctionAuthorized(functionName: string, role: string | undefined): boolean {
  return PUBLIC_FUNCTIONS.has(functionName) || role === "admin";
}
