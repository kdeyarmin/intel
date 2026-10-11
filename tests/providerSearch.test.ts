import { describe, it, expect } from "vitest";
import {
  buildProviderSearchPlan,
  escapeLike,
  matchRank,
  mergeResults,
  npiPrefixRange,
  PRACTICE_STATE_FILTER_SQL,
  runProviderSearch,
  searchBySpecialty,
  specialtyPatterns,
  STATE_FILTER_SQL,
} from "../server/lib/providerSearch";
import { capabilitiesFrom, NO_CAPABILITIES } from "../server/lib/searchCapabilities";
import { SEARCH_INDEXES, SEARCH_EXPR } from "../server/lib/searchIndexes";
import { BOOT_INDEXES } from "../server/lib/bootIndexes";

const ALL = { trigram: true, lastName: true, orgPrefix: true, zip5: true, stateCity: true, primaryTaxonomy: true };

describe("buildProviderSearchPlan", () => {
  it("ignores queries shorter than two characters", () => {
    expect(buildProviderSearchPlan(" a ", {}, ALL)).toBeNull();
  });

  it("looks up a full NPI exactly and a partial one by range", () => {
    expect(buildProviderSearchPlan("1234567890", {}, ALL)!.queries).toEqual([
      expect.objectContaining({ kind: "npi", text: expect.stringContaining("WHERE npi = $1"), values: ["1234567890"] }),
    ]);
    const partial = buildProviderSearchPlan("12345", { limit: 20 }, ALL)!.queries[0];
    expect(partial.text).toContain("npi >= $1 AND npi < $2");
    expect(partial.values).toEqual(["12345", "12346", 20]);
    // Reported as an NPI search whatever the trigram index's state.
    expect(buildProviderSearchPlan("12345", {}, ALL)!.mode).toBe("npi");
  });

  it("computes NPI prefix ranges with carries", () => {
    expect(npiPrefixRange("129")).toEqual({ low: "129", high: "13" });
    expect(npiPrefixRange("1999")).toEqual({ low: "1999", high: "2" });
    expect(npiPrefixRange("99")).toEqual({ low: "99", high: null });
  });

  it("matches people by last-name prefix and organizations by contains, on the indexed expressions", () => {
    const plan = buildProviderSearchPlan("Mercy", {}, ALL)!;
    expect(plan.mode).toBe("contains");
    const person = plan.queries.find((q) => q.kind === "person")!;
    expect(person.text).toContain(`${SEARCH_EXPR.lastName} LIKE $1`);
    expect(person.values[0]).toBe("mercy%");
    const [prefix, contains] = plan.queries.filter((q) => q.kind === "org");
    // Starts-with first, in index order, so exact and prefix matches are never
    // lost to the unordered contains cap.
    expect(prefix.text).toContain(`${SEARCH_EXPR.orgName} LIKE $1 ORDER BY ${SEARCH_EXPR.orgName}`);
    expect(prefix.values).toEqual(["mercy%", 50]);
    expect(contains.text).toContain(`organization_name IS NOT NULL AND ${SEARCH_EXPR.orgName} LIKE $1`);
    expect(contains.values).toEqual(["%mercy%", 200]);
  });

  it("falls back to organization prefixes without pg_trgm, and for two-letter terms", () => {
    const noTrgm = buildProviderSearchPlan("mercy", { entityType: "Organization" }, { ...ALL, trigram: false })!;
    expect(noTrgm.mode).toBe("prefix");
    expect(noTrgm.queries.map((q) => q.kind)).toEqual(["org"]);
    expect(noTrgm.queries[0].values[0]).toBe("mercy%");
    expect(buildProviderSearchPlan("ab", { entityType: "Organization" }, ALL)!.mode).toBe("prefix");
  });

  it("matches two-word names in either order", () => {
    const plan = buildProviderSearchPlan("John  Smith", { entityType: "Individual" }, ALL)!;
    expect(plan.queries.map((q) => q.values.slice(0, -1))).toEqual([["john smith%"], ["smith%", "john%"], ["john%", "smith%"]]);
    const comma = buildProviderSearchPlan("Smith, John", { entityType: "Individual" }, ALL)!;
    expect(comma.queries[0].values[0]).toBe("smith john%");
    expect(comma.queries[2].values.slice(0, 2)).toEqual(["smith%", "john%"]);
  });

  it("runs only the kinds the entity filter allows", () => {
    expect(buildProviderSearchPlan("mercy", { entityType: "Individual" }, ALL)!.queries.every((q) => q.kind === "person")).toBe(true);
    expect(buildProviderSearchPlan("mercy", { entityType: "Robot" as any }, ALL)!.queries.map((q) => q.kind)).toEqual(["person", "org", "org"]);
  });

  it("applies the entity filter to NPI lookups too", () => {
    const exact = buildProviderSearchPlan("1234567890", { entityType: "Organization" }, ALL)!.queries[0];
    expect(exact.text).toContain("WHERE npi = $1 AND entity_type = $2 LIMIT 1");
    expect(exact.values).toEqual(["1234567890", "Organization"]);
    const range = buildProviderSearchPlan("12345", { entityType: "Individual", limit: 20 }, ALL)!.queries[0];
    expect(range.text).toContain("npi >= $1 AND npi < $2 AND entity_type = $3 ORDER BY npi LIMIT $4");
    expect(range.values).toEqual(["12345", "12346", "Individual", 20]);
    const nines = buildProviderSearchPlan("99", { entityType: "Individual", limit: 20 }, ALL)!.queries[0];
    expect(nines.text).toContain("npi >= $1 AND entity_type = $2 ORDER BY npi LIMIT $3");
    expect(nines.values).toEqual(["99", "Individual", 20]);
  });

  it("asks for more candidates when a state filter will cut them down", () => {
    const plan = buildProviderSearchPlan("smith", { entityType: "Individual", state: "PA", limit: 20 }, ALL)!;
    expect(plan.queries[0].cap).toBe(500);
  });

  it("reports a degraded search while its index is still building", () => {
    expect(buildProviderSearchPlan("smith", {}, NO_CAPABILITIES)!.degraded).toBe(true);
    expect(buildProviderSearchPlan("smith", {}, ALL)!.degraded).toBe(false);
  });

  it("escapes LIKE wildcards in user input", () => {
    expect(escapeLike("50%_off\\")).toBe("50\\%\\_off\\\\");
    expect(buildProviderSearchPlan("o'neil%", { entityType: "Individual" }, ALL)!.queries[0].values[0]).toBe("o'neil\\%%");
  });
});

describe("ranking", () => {
  it("puts exact and starts-with matches ahead of contains", () => {
    const rows = [
      { npi: "3", organization_name: "St. Mercy Clinic" },
      { npi: "1", organization_name: "Mercy Hospital of Pittsburgh" },
      { npi: "2", organization_name: "Mercy" },
      { npi: "4", organization_name: "Holymercy Center" },
    ];
    expect(rows.map((r) => matchRank(r, "mercy"))).toEqual([2, 1, 0, 3]);
    const query = { kind: "org" as const, cap: 200, text: "", values: [] };
    const merged = mergeResults([{ query, rows }], "mercy");
    expect(merged.rows.map((r) => r.npi)).toEqual(["2", "1", "3", "4"]);
    expect(merged.truncated).toBe(false);
  });

  it("dedupes, keeps NPI hits first and flags capped queries", () => {
    const npiQ = { kind: "npi" as const, cap: 2, text: "", values: [] };
    const personQ = { kind: "person" as const, cap: 2, text: "", values: [] };
    const merged = mergeResults([
      { query: personQ, rows: [{ npi: "9", last_name: "Smith" }, { npi: "1", last_name: "Smithers" }] },
      { query: npiQ, rows: [{ npi: "1", last_name: "Smithers" }] },
    ], "smith");
    expect(merged.rows.map((r) => r.npi)).toEqual(["9", "1"]);
    expect(merged.truncated).toBe(true);
  });
});

function fakeClient(answer: (sql: string, params: any[]) => any[]) {
  const calls: Array<{ sql: string; params: any[] }> = [];
  return { calls, client: { query: async (sql: string, params: any[] = []) => { calls.push({ sql, params }); return { rows: answer(sql, params) }; } } };
}

describe("runProviderSearch", () => {
  it("filters by state with one bounded NPI list query", async () => {
    const { client, calls } = fakeClient((sql) => {
      if (sql.includes("FROM provider_locations")) return [{ npi: "2" }];
      if (sql.includes("organization_name IS NOT NULL")) return [{ npi: "2", organization_name: "Mercy Hospital" }, { npi: "3", organization_name: "Mercy Clinic" }];
      return [];
    });
    const r = await runProviderSearch(client, "mercy", { entityType: "Organization", state: "pa" }, ALL);
    expect(r.providers.map((p) => p.npi)).toEqual(["2"]);
    const stateCall = calls.find((c) => c.sql.includes("provider_locations"))!;
    expect(stateCall.sql).toContain("npi = ANY($1) AND state = $2");
    expect(stateCall.params).toEqual([["3", "2"], "PA"]);
    expect(r.mode).toBe("contains");
  });
});

describe("searchBySpecialty", () => {
  it("uses the group's code prefixes and checks the state in chunks", async () => {
    expect(specialtyPatterns({ group: "cardiology" })).toContain("207RC0000X");
    expect(specialtyPatterns({ group: "family_medicine" })).toEqual(["207Q%"]);
    expect(specialtyPatterns({ group: "nope" })).toBeNull();
    const { client, calls } = fakeClient((sql, params) => {
      if (sql.includes("FROM provider_taxonomies")) return [{ npi: "1", taxonomy_code: "207Q00000X", taxonomy_description: "Family Medicine" }, { npi: "2", taxonomy_code: "207Q00000X", taxonomy_description: "Family Medicine" }];
      if (sql.includes("FROM provider_locations")) return [{ npi: "2" }];
      if (sql.includes("FROM providers")) return params[0].map((npi: string) => ({ npi, last_name: "X" }));
      return [];
    });
    const r = await searchBySpecialty(client, { group: "family_medicine", state: "OH", limit: 10 });
    expect(r!.providers).toEqual([{ npi: "2", last_name: "X", taxonomy_code: "207Q00000X", specialty: "Family Medicine" }]);
    expect(calls[0].sql).toContain("is_primary = true AND (taxonomy_code LIKE $1)");
    expect(calls[0].sql).not.toMatch(/ORDER BY|JOIN/);
    // Generic search counts any location in the state.
    expect(calls.find((c) => c.sql.includes("provider_locations"))!.sql).toBe(STATE_FILTER_SQL);
  });

  it("can require a practice location in the state", async () => {
    const { client, calls } = fakeClient((sql, params) => {
      if (sql.includes("FROM provider_taxonomies")) return [{ npi: "1", taxonomy_code: "207Q00000X", taxonomy_description: "Family Medicine" }, { npi: "2", taxonomy_code: "207Q00000X", taxonomy_description: "Family Medicine" }];
      // "1" has only a mailing address in OH.
      if (sql.includes("FROM provider_locations")) return (sql.includes("location_type = 'Practice'") ? ["2"] : ["1", "2"]).map((npi) => ({ npi }));
      if (sql.includes("FROM providers")) return params[0].map((npi: string) => ({ npi, last_name: "X" }));
      return [];
    });
    const r = await searchBySpecialty(client, { group: "family_medicine", state: "OH", limit: 10, practiceOnly: true });
    expect(r!.providers.map((p: any) => p.npi)).toEqual(["2"]);
    const stateCall = calls.find((c) => c.sql.includes("provider_locations"))!;
    expect(stateCall.sql).toBe(PRACTICE_STATE_FILTER_SQL);
    expect(stateCall.params).toEqual([["1", "2"], "OH"]);
  });
});

describe("search indexes", () => {
  it("are built at boot, concurrently, on the same expressions the queries use", () => {
    for (const ddl of SEARCH_INDEXES) expect(BOOT_INDEXES.map((i) => i.ddl)).toContain(ddl);
    expect(SEARCH_INDEXES.join("\n")).toContain(`(${SEARCH_EXPR.lastName} text_pattern_ops)`);
    expect(SEARCH_INDEXES.join("\n")).toContain(`USING gin (${SEARCH_EXPR.orgName} gin_trgm_ops)`);
  });

  it("only enables contains search when pg_trgm and its index are both ready", () => {
    expect(capabilitiesFrom(["pg_trgm"], ["idx_providers_org_name_trgm"]).trigram).toBe(true);
    expect(capabilitiesFrom([], ["idx_providers_org_name_trgm"]).trigram).toBe(false);
    expect(capabilitiesFrom(["pg_trgm"], []).trigram).toBe(false);
    expect(capabilitiesFrom([], ["idx_providers_last_name_lower", "idx_provloc_zip5"])).toMatchObject({ lastName: true, zip5: true, stateCity: false });
  });
});
