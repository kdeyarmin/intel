import { describe, it, expect } from "vitest";
import { buildProviderSearchQuery, escapeLike } from "../server/lib/providerSearch";

describe("buildProviderSearchQuery", () => {
  it("ignores queries shorter than two characters", () => {
    expect(buildProviderSearchQuery(" a ")).toBeNull();
  });

  it("looks up a full NPI exactly", () => {
    const q = buildProviderSearchQuery("1234567890")!;
    expect(q.text).toContain("npi = $1");
    expect(q.values).toEqual(["1234567890", 50]);
  });

  it("prefix-matches a partial NPI", () => {
    const q = buildProviderSearchQuery("12345")!;
    expect(q.text).toContain("npi LIKE $1");
    expect(q.values[0]).toBe("12345%");
  });

  it("prefix-matches single names across name columns", () => {
    const q = buildProviderSearchQuery("smith")!;
    expect(q.text).toContain("last_name ILIKE $1 OR first_name ILIKE $1 OR organization_name ILIKE $1");
    expect(q.values).toEqual(["smith%", 50]);
  });

  it("matches two-word names in either order", () => {
    const q = buildProviderSearchQuery("John  Smith")!;
    expect(q.values.slice(0, 3)).toEqual(["John Smith%", "John%", "Smith%"]);
    expect(q.text).toContain("(first_name ILIKE $2 AND last_name ILIKE $3)");
    expect(q.text).toContain("(last_name ILIKE $2 AND first_name ILIKE $3)");
    const comma = buildProviderSearchQuery("Smith, John")!;
    expect(comma.values.slice(1, 3)).toEqual(["Smith%", "John%"]);
  });

  it("filters by entity type when asked", () => {
    const q = buildProviderSearchQuery("mercy", { entityType: "Organization", limit: 20 })!;
    expect(q.text).toMatch(/AND entity_type = \$2/);
    expect(q.values).toEqual(["mercy%", "Organization", 20]);
  });

  it("ignores unknown entity types and clamps the limit", () => {
    const q = buildProviderSearchQuery("mercy", { entityType: "Robot" as any, limit: 9999 })!;
    expect(q.text).not.toContain("entity_type =");
    expect(q.values.at(-1)).toBe(500);
  });

  it("returns the fields the directory pages filter and sort on", () => {
    const columns = buildProviderSearchQuery("smith")!.text.split("FROM")[0];
    // "Not searched" email filter and "Last updated" sort.
    expect(columns).toMatch(/\bemail_searched_at\b/);
    expect(columns).toMatch(/\bupdated_date\b/);
  });

  it("escapes LIKE wildcards in user input", () => {
    expect(escapeLike("50%_off\\")).toBe("50\\%\\_off\\\\");
    expect(buildProviderSearchQuery("o'neil%")!.values[0]).toBe("o'neil\\%%");
  });
});
