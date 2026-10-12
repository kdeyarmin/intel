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
    await expect(handleSaveCampaignOutcomes({ campaign_id: 1, conversions: 2, revenue: 10.5 }, { orgId: 4 }))
      .resolves.toMatchObject({ success: true });
    // The update is limited to the caller's organization's campaign.
    const [sql, params] = query.mock.calls.at(-1) as unknown as [string, unknown[]];
    expect(sql).toMatch(/WHERE id = \$1 AND org_id = \$4/);
    expect(params).toEqual([1, 2, 10.5, 4]);
  });

  it("answers 404 for a campaign in another organization, and 403 without an organization", async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await expect(handleSaveCampaignOutcomes({ campaign_id: 1, conversions: 2, revenue: 1 }, { orgId: 9 })).rejects.toMatchObject({ status: 404 });
    await expect(handleSaveCampaignOutcomes({ campaign_id: 1, conversions: 2, revenue: 1 }, {})).rejects.toMatchObject({ status: 403 });
  });
});
