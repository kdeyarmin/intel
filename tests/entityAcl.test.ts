import { describe, it, expect, vi } from "vitest";

vi.mock("../server/db", () => ({ db: {}, pool: {} }));

import { USER_WRITABLE_ENTITIES } from "../server/routes/entities";

describe("entity ACL", () => {
  it("keeps campaigns admin-only to change, like the Campaigns page and sending", () => {
    for (const entity of ["OutreachCampaign", "OutreachMessage", "CampaignSequenceStep", "CampaignTask"]) {
      expect(USER_WRITABLE_ENTITIES.has(entity), entity).toBe(false);
    }
  });

  it("still lets everyone build lead lists and reports", () => {
    for (const entity of ["LeadList", "LeadListMember", "CustomReport", "ScheduledReport"]) {
      expect(USER_WRITABLE_ENTITIES.has(entity), entity).toBe(true);
    }
  });
});
