import { describe, it, expect, vi } from "vitest";

vi.mock("../server/db", () => ({ db: {}, pool: {} }));

import { ORG_ADMIN_ENTITIES, PLATFORM_ONLY_ENTITIES, USER_WRITABLE_ENTITIES } from "../server/routes/entities";

describe("entity ACL", () => {
  it("keeps campaigns an owner's to change, like the Campaigns page and sending", () => {
    for (const entity of ["OutreachCampaign", "OutreachMessage", "CampaignTemplate"]) {
      expect(USER_WRITABLE_ENTITIES.has(entity), entity).toBe(false);
      expect(ORG_ADMIN_ENTITIES.has(entity), entity).toBe(true);
    }
  });

  it("still lets everyone build lead lists and reports", () => {
    for (const entity of ["LeadList", "LeadListMember", "CustomReport", "ScheduledReport"]) {
      expect(USER_WRITABLE_ENTITIES.has(entity), entity).toBe(true);
    }
  });

  it("holds the import, crawler and maintenance rows (the cron workers act on them with platform authority) platform-only", () => {
    for (const entity of ["ImportBatch", "ImportScheduleConfig", "CMSApiConnector", "NPPESCrawlerConfig", "NPPESQueueItem", "BackgroundTask", "ApiInteractionLog"]) {
      expect(PLATFORM_ONLY_ENTITIES.has(entity), entity).toBe(true);
    }
  });
});
