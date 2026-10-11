/** Generic entity API write access: campaigns and their message queue are admin-only. */
import { describe, it, expect, vi } from "vitest";

vi.mock("../server/db", () => ({ db: {}, pool: {} }));

import { canWriteEntity } from "../server/routes/entities";

describe("canWriteEntity", () => {
  it("lets only admins write outreach campaigns and messages, which sending emails as stored", () => {
    for (const entity of ["OutreachCampaign", "OutreachMessage"]) {
      expect(canWriteEntity(entity, "user"), entity).toBe(false);
      expect(canWriteEntity(entity, undefined), entity).toBe(false);
      expect(canWriteEntity(entity, "admin"), entity).toBe(true);
    }
  });

  it("still lets any user write collaborative work product", () => {
    expect(canWriteEntity("LeadList", "user")).toBe(true);
    expect(canWriteEntity("LeadListMember", "user")).toBe(true);
    expect(canWriteEntity("SavedFilter", "user")).toBe(true);
  });

  it("keeps everything else admin-only", () => {
    expect(canWriteEntity("Provider", "user")).toBe(false);
    expect(canWriteEntity("AuditEvent", "user")).toBe(false);
  });
});
