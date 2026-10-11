/**
 * Generic entity API access. Members write collaborative work product, an
 * organization's owner also changes its campaigns, and everything else (the
 * shared data every customer reads, the platform's own import and crawler rows,
 * scoring rules and the audit trail) is a platform administrator's.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("../server/db", () => ({ db: {}, pool: {} }));

import { canReadEntity, canWriteEntity, ORG_ADMIN_ENTITIES, ORG_SCOPED_ENTITIES, PLATFORM_ONLY_ENTITIES, readsAcrossOrganizations, USER_WRITABLE_ENTITIES } from "../server/routes/entities";

const member = { role: "user", orgRole: "member" };
const owner = { role: "user", orgRole: "owner" };
const platform = { role: "user", orgRole: "member", isPlatformAdmin: true };
const adminRole = { role: "admin", orgRole: "member" };

describe("canWriteEntity", () => {
  it("lets an organization's owner, not a member, write its campaigns and what sending them uses", () => {
    for (const entity of ["OutreachCampaign", "OutreachMessage", "CampaignSequenceStep", "CampaignTask", "CampaignTemplate"]) {
      expect(canWriteEntity(entity, member), entity).toBe(false);
      expect(canWriteEntity(entity, undefined), entity).toBe(false);
      expect(canWriteEntity(entity, owner), entity).toBe(true);
      expect(canWriteEntity(entity, platform), entity).toBe(true);
    }
  });

  it("still lets any member write collaborative work product", () => {
    for (const entity of ["LeadList", "LeadListMember", "SavedFilter", "CustomReport", "ScheduledReport", "AnalyticsDashboard"]) {
      expect(canWriteEntity(entity, member), entity).toBe(true);
    }
  });

  it("keeps the shared data, the platform's own rows, scoring rules and the audit trail to platform administrators, owners included", () => {
    const platformOnly = [
      "Provider", "ProviderLocation", "MedicareFacility", "CMSReferral", "ProviderServiceUtilization",
      "ImportBatch", "ImportScheduleConfig", "CMSApiConnector", "NPPESCrawlerConfig", "BackgroundTask", "ReconciliationSettings",
      "ScoringRule", "AuditEvent",
    ];
    for (const entity of platformOnly) {
      expect(canWriteEntity(entity, member), entity).toBe(false);
      expect(canWriteEntity(entity, owner), entity).toBe(false);
      expect(canWriteEntity(entity, platform), entity).toBe(true);
      expect(canWriteEntity(entity, adminRole), entity).toBe(true);
    }
  });

  it("takes a bare role string too: admin is a platform admin, user a member", () => {
    expect(canWriteEntity("Provider", "admin")).toBe(true);
    expect(canWriteEntity("Provider", "user")).toBe(false);
    expect(canWriteEntity("LeadList", "user")).toBe(true);
    expect(canWriteEntity("OutreachCampaign", "user")).toBe(false);
  });
});

describe("canReadEntity", () => {
  it("keeps the platform's own rows (credentials, payloads, schedules) to platform administrators", () => {
    for (const entity of PLATFORM_ONLY_ENTITIES) {
      expect(canReadEntity(entity, member), entity).toBe(false);
      expect(canReadEntity(entity, owner), entity).toBe(false);
      expect(canReadEntity(entity, platform), entity).toBe(true);
    }
  });

  it("lets an owner read their organization's audit events (the entity route scopes them), not a member", () => {
    expect(canReadEntity("AuditEvent", member)).toBe(false);
    expect(canReadEntity("AuditEvent", owner)).toBe(true);
    expect(canReadEntity("AuditEvent", platform)).toBe(true);
  });

  it("leaves the shared reference data readable by everyone signed in", () => {
    for (const entity of ["Provider", "MedicareFacility", "CMSReferral", "ScoringRule"]) expect(canReadEntity(entity, member), entity).toBe(true);
  });
});

describe("readsAcrossOrganizations", () => {
  it("lets platform administrators, and only them, read the audit trail and data-quality alerts of every organization (and the platform's own)", () => {
    for (const entity of ["AuditEvent", "DataQualityAlert"]) {
      expect(readsAcrossOrganizations(entity, platform), entity).toBe(true);
      expect(readsAcrossOrganizations(entity, adminRole), entity).toBe(true);
      expect(readsAcrossOrganizations(entity, owner), entity).toBe(false);
      expect(readsAcrossOrganizations(entity, member), entity).toBe(false);
      expect(readsAcrossOrganizations(entity, undefined), entity).toBe(false);
    }
  });

  it("keeps every other customer-owned entity inside the caller's organization, platform administrators included", () => {
    for (const entity of ORG_SCOPED_ENTITIES) {
      if (entity === "AuditEvent" || entity === "DataQualityAlert") continue;
      expect(readsAcrossOrganizations(entity, platform), entity).toBe(false);
    }
  });
});

describe("how the entity sets fit together", () => {
  it("never lists an entity as both platform-only and something a member or owner writes", () => {
    for (const entity of PLATFORM_ONLY_ENTITIES) {
      expect(USER_WRITABLE_ENTITIES.has(entity), entity).toBe(false);
      expect(ORG_ADMIN_ENTITIES.has(entity), entity).toBe(false);
    }
  });

  it("scopes every entity members or owners write to their organization (directly or through a parent)", () => {
    const throughParent = new Set(["LeadListMember", "CampaignSequenceStep"]);
    for (const entity of [...USER_WRITABLE_ENTITIES, ...ORG_ADMIN_ENTITIES]) {
      expect(ORG_SCOPED_ENTITIES.has(entity) || throughParent.has(entity), entity).toBe(true);
    }
  });

  it("treats scoring rules as platform configuration, not a customer's", () => {
    expect(ORG_SCOPED_ENTITIES.has("ScoringRule")).toBe(false);
    expect(USER_WRITABLE_ENTITIES.has("ScoringRule")).toBe(false);
  });
});
