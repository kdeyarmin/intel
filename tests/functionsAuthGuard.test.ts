/**
 * Tests for the default-deny authorization guard introduced in
 * server/routes/functions.ts and the RECONCILABLE_FIELDS allowlist in
 * server/functions/reconciliation.ts.
 *
 * Both are module-private, so their logic is replicated here verbatim.
 * If the production code changes, update this test accordingly.
 */
import { describe, it, expect } from "vitest";

// ─── PUBLIC_FUNCTIONS (replicated from server/routes/functions.ts) ────────────

const PUBLIC_FUNCTIONS = new Set<string>([
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
  "searchProviders",
  "calculateOutreachScore",
  "analyzeReferralPathways",
  "analyzeProviderNetwork",
  "trackCampaignMetrics",
]);

/**
 * The authorization gate from the route handler:
 *   if (!PUBLIC_FUNCTIONS.has(fn) && role !== "admin") -> 403
 */
function isAuthorized(functionName: string, role: string | undefined): boolean {
  return PUBLIC_FUNCTIONS.has(functionName) || role === "admin";
}

// ─── FIELDS_TO_COMPARE + RECONCILABLE_FIELDS (replicated from reconciliation.ts) ─

const FIELDS_TO_COMPARE = [
  { field: "first_name",         nppes: "basic.first_name",         severity: "high" },
  { field: "last_name",          nppes: "basic.last_name",          severity: "high" },
  { field: "organization_name",  nppes: "basic.organization_name",  severity: "high" },
  { field: "credential",         nppes: "basic.credential",         severity: "low" },
  { field: "gender",             nppes: "basic.gender",             severity: "medium" },
  { field: "status",             nppes: "basic.status",             severity: "high" },
  { field: "entity_type",        nppes: "enumeration_type",         severity: "medium" },
];

const RECONCILABLE_FIELDS = new Set(FIELDS_TO_COMPARE.map((f) => f.field));

// ─── Tests: PUBLIC_FUNCTIONS authorization logic ──────────────────────────────

describe("PUBLIC_FUNCTIONS authorization guard", () => {
  it("allows any authenticated user to call a public read-only function", () => {
    expect(isAuthorized("getDashboardStats", "user")).toBe(true);
    expect(isAuthorized("getCMSAnalytics", "user")).toBe(true);
    expect(isAuthorized("searchProviders", "user")).toBe(true);
  });

  it("allows admin to call any function (including non-public ones)", () => {
    expect(isAuthorized("triggerImport", "admin")).toBe(true);
    expect(isAuthorized("runNPPESCrawler", "admin")).toBe(true);
    expect(isAuthorized("deleteAllData", "admin")).toBe(true);
  });

  it("blocks non-admin users from non-public functions", () => {
    expect(isAuthorized("triggerImport", "user")).toBe(false);
    expect(isAuthorized("runNPPESCrawler", "user")).toBe(false);
    expect(isAuthorized("someNewFunction", "user")).toBe(false);
  });

  it("blocks unauthenticated callers (role=undefined) from non-public functions", () => {
    expect(isAuthorized("triggerImport", undefined)).toBe(false);
    expect(isAuthorized("deleteAllData", undefined)).toBe(false);
  });

  it("allows unauthenticated callers to call public functions (authMiddleware handles auth, not this guard)", () => {
    // The role check is on top of authMiddleware, but the public-function gate
    // itself does not require a role.
    expect(isAuthorized("getDashboardStats", undefined)).toBe(true);
  });

  it("is a default-deny system — unknown function names are NOT public", () => {
    // Any function not explicitly listed is admin-only by default
    expect(PUBLIC_FUNCTIONS.has("newAdminFunction")).toBe(false);
    expect(PUBLIC_FUNCTIONS.has("")).toBe(false);
    expect(PUBLIC_FUNCTIONS.has("admin")).toBe(false);
  });

  it("contains exactly the 22 documented public function names", () => {
    expect(PUBLIC_FUNCTIONS.size).toBe(22);
  });

  it("all listed functions are individually verified", () => {
    const expected = [
      "getDashboardStats", "getDataHealthAlerts", "getCMSAnalytics",
      "getReferralNetworkData", "getTerritoryData", "getDataHealthMetrics",
      "getCMSDatasetCatalog", "validateDataQuality", "getEnrichmentCandidateCount",
      "getIntelCandidateCount", "enrichmentJobStatus", "intelJobStatus",
      "getFacilityDetail", "listFacilities", "getProviderCMSData",
      "getCountyIntelligence", "getAvailableStatesCounties", "getComprehensiveReport",
      "searchProviders", "calculateOutreachScore", "analyzeReferralPathways",
      "analyzeProviderNetwork", "trackCampaignMetrics",
    ];
    for (const fn of expected) {
      expect(PUBLIC_FUNCTIONS.has(fn), `Expected "${fn}" to be in PUBLIC_FUNCTIONS`).toBe(true);
    }
  });

  it("high-impact mutating functions are NOT in the public set", () => {
    const adminOnly = [
      "triggerImport",
      "runNPPESCrawler",
      "runEmailSearchBot",
      "runProviderIntelligenceBot",
      "sendEmail",
      "reconcileProviderData",
    ];
    for (const fn of adminOnly) {
      expect(PUBLIC_FUNCTIONS.has(fn), `Expected "${fn}" to NOT be in PUBLIC_FUNCTIONS`).toBe(false);
    }
  });
});

// ─── Tests: RECONCILABLE_FIELDS allowlist ─────────────────────────────────────

describe("RECONCILABLE_FIELDS", () => {
  it("contains all FIELDS_TO_COMPARE field names", () => {
    for (const { field } of FIELDS_TO_COMPARE) {
      expect(RECONCILABLE_FIELDS.has(field), `Expected "${field}" in RECONCILABLE_FIELDS`).toBe(true);
    }
  });

  it("allows known safe provider columns", () => {
    expect(RECONCILABLE_FIELDS.has("first_name")).toBe(true);
    expect(RECONCILABLE_FIELDS.has("last_name")).toBe(true);
    expect(RECONCILABLE_FIELDS.has("organization_name")).toBe(true);
    expect(RECONCILABLE_FIELDS.has("credential")).toBe(true);
    expect(RECONCILABLE_FIELDS.has("gender")).toBe(true);
    expect(RECONCILABLE_FIELDS.has("status")).toBe(true);
    expect(RECONCILABLE_FIELDS.has("entity_type")).toBe(true);
  });

  it("rejects dangerous/sensitive columns that must never be written via reconciliation", () => {
    // These are the security-critical rejections: allowing them via the dynamic
    // UPDATE query would be a privilege escalation vector.
    expect(RECONCILABLE_FIELDS.has("password_hash")).toBe(false);
    expect(RECONCILABLE_FIELDS.has("role")).toBe(false);
    expect(RECONCILABLE_FIELDS.has("email")).toBe(false);
    expect(RECONCILABLE_FIELDS.has("id")).toBe(false);
    expect(RECONCILABLE_FIELDS.has("npi")).toBe(false);
  });

  it("rejects arbitrary column names not in FIELDS_TO_COMPARE", () => {
    expect(RECONCILABLE_FIELDS.has("arbitrary_col")).toBe(false);
    expect(RECONCILABLE_FIELDS.has("")).toBe(false);
    expect(RECONCILABLE_FIELDS.has("DROP TABLE providers")).toBe(false);
  });

  it("has exactly 7 fields (one per FIELDS_TO_COMPARE entry)", () => {
    expect(RECONCILABLE_FIELDS.size).toBe(FIELDS_TO_COMPARE.length);
  });
});