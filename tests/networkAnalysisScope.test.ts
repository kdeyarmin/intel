/** analyzeProviderNetwork: a lead list is one organization's, so another organization can't read it by id. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const queries: Array<{ sql: string; params: any[] }> = [];
const leadLists = [{ id: 17, org_id: 7, name: "Riverbend priority referrers" }];

vi.mock("../server/db", () => {
  const client = {
    async query(sql: string, params: any[] = []) {
      queries.push({ sql, params });
      if (/^SET |^RESET /.test(sql)) return { rows: [] };
      // Like the real table: a lookup that names the organization finds only its lists, one that doesn't finds any.
      if (sql.includes("FROM lead_lists WHERE id = $1")) {
        return { rows: leadLists.filter((l) => l.id === params[0] && (!sql.includes("org_id = $2") || l.org_id === params[1])) };
      }
      if (sql.includes("FROM lead_list_members WHERE list_id = $1")) return { rows: [{ npi: "1000000001" }, { npi: "1000000002" }] };
      return { rows: [] };
    },
    release() {},
  };
  return { pool: { connect: async () => client, query: client.query }, db: {} };
});

import { handleAnalyzeProviderNetwork } from "../server/functions/networkAnalysis";

beforeEach(() => {
  queries.length = 0;
});

describe("handleAnalyzeProviderNetwork with a lead list", () => {
  it("analyzes a list in the caller's own organization", async () => {
    // No referral rows exist, so it reports a network with no relationships, but it got past the ownership check.
    const r: any = await handleAnalyzeProviderNetwork({ lead_list_id: 17, force_refresh: true }, { orgId: 7 });
    expect(r.success).toBe(true);
    expect(r.analysis.scope).toMatchObject({ type: "lead_list", label: 'Lead list "Riverbend priority referrers"' });
    expect(queries.find((q) => q.sql.includes("FROM lead_lists WHERE id = $1"))!.params).toEqual([17, 7]);
  });

  it("answers 404 for another organization's list and for a caller in none, reading none of its members", async () => {
    await expect(handleAnalyzeProviderNetwork({ lead_list_id: 17, force_refresh: true }, { orgId: 8 })).rejects.toMatchObject({ status: 404 });
    await expect(handleAnalyzeProviderNetwork({ lead_list_id: 17, force_refresh: true }, { orgId: null })).rejects.toMatchObject({ status: 404 });
    await expect(handleAnalyzeProviderNetwork({ lead_list_id: 17, force_refresh: true })).rejects.toMatchObject({ status: 404 });
    expect(queries.some((q) => q.sql.includes("FROM lead_list_members"))).toBe(false);
  });

  it("keeps one organization's cached analysis from answering another's request", async () => {
    await handleAnalyzeProviderNetwork({ lead_list_id: 17 }, { orgId: 7 });
    await expect(handleAnalyzeProviderNetwork({ lead_list_id: 17 }, { orgId: 8 })).rejects.toMatchObject({ status: 404 });
  });
});
