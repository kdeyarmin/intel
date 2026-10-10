/** handleSaveCampaignOutcomes input validation (no database needed: it rejects first). */
import { describe, it, expect, vi } from "vitest";

const query = vi.hoisted(() => vi.fn(async () => ({ rows: [{ metrics: { conversions: 2, revenue: 10.5 } }] })));
vi.mock("../server/db", () => ({ db: {}, pool: { query } }));

import { handleSaveCampaignOutcomes } from "../server/functions/outreach";

describe("handleSaveCampaignOutcomes", () => {
  it("rejects fractional conversion counts", async () => {
    await expect(handleSaveCampaignOutcomes({ campaign_id: 1, conversions: 1.5, revenue: 10 }))
      .rejects.toMatchObject({ status: 400 });
    expect(query).not.toHaveBeenCalled();
  });

  it("accepts whole conversions with decimal revenue", async () => {
    await expect(handleSaveCampaignOutcomes({ campaign_id: 1, conversions: 2, revenue: 10.5 }))
      .resolves.toMatchObject({ success: true });
  });
});
