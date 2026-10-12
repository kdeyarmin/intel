/** The Intelligence page's candidate counts: the provider total is a pg_class estimate, which is -1 until a table is first ANALYZEd. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const results: any[] = [];
vi.mock("../server/db", () => ({ db: { execute: vi.fn(async () => results.shift()) }, pool: {} }));

import { handleGetIntelCandidateCount } from "../server/functions/providerIntelligenceBot";

// The five queries it runs, in order: the estimate, enriched, searched, with an email, needing work.
const queue = (total: number) => results.push([{ count: total }], [{ count: 3 }], [{ count: 5 }], [{ count: 47 }], [{ count: 160 }]);

beforeEach(() => {
  results.length = 0;
});

describe("handleGetIntelCandidateCount", () => {
  it("never reports a negative total or unenriched count for a table that was never analyzed", async () => {
    queue(-1);
    expect(await handleGetIntelCandidateCount()).toMatchObject({ totalProviders: 0, unenrichedCount: 0, enrichedCount: 3, emailFoundCount: 47, needsWorkCount: 160 });
  });

  it("subtracts what was enriched from the estimate, and stops at zero when the estimate is behind", async () => {
    queue(1000);
    expect(await handleGetIntelCandidateCount()).toMatchObject({ totalProviders: 1000, unenrichedCount: 997 });
    queue(2);
    expect(await handleGetIntelCandidateCount()).toMatchObject({ totalProviders: 2, unenrichedCount: 0 });
  });
});
