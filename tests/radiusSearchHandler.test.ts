import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ resolve: vi.fn(), run: vi.fn() }));
vi.mock("../server/db", () => ({ db: {}, pool: {} }));
vi.mock("../server/lib/searchCapabilities", () => ({ getSearchCapabilities: async () => ({}) }));
vi.mock("../server/lib/pgClient", () => ({
  withTimeoutClient: async (_pool: any, _timeout: string, fn: any) => fn({}),
  isStatementTimeout: () => false,
}));
vi.mock("../server/lib/radiusSearch", () => ({
  resolveZipRadius: mocks.resolve,
  runRadiusProviderSearch: mocks.run,
}));
import { handleSearchProviders } from "../server/functions/search";

beforeEach(() => {
  mocks.resolve.mockReset().mockResolvedValue({ zip: "01001", miles: 50, state: "MA", distances: new Map() });
  mocks.run.mockReset().mockResolvedValue({ providers: [] });
});

describe("provider radius handler", () => {
  it("allows national radius searches across state borders without a state filter", async () => {
    await handleSearchProviders({ radius_zip: "01001", radius_miles: 50 });
    expect(mocks.run).toHaveBeenCalledWith(expect.anything(), "", expect.objectContaining({ state: null }), expect.anything(), expect.anything());
  });

  it("keeps the existing state entitlement scope for restricted searches", async () => {
    await handleSearchProviders({ radius_zip: "01001", radius_miles: 50 }, { planCode: "state", territory: { states: ["MA"], county_fips: [] } });
    expect(mocks.run).toHaveBeenCalledWith(expect.anything(), "", expect.objectContaining({ state: "MA" }), expect.anything(), expect.anything());
  });

  it("rejects radius searches outside a restricted plan", async () => {
    await expect(handleSearchProviders({ radius_zip: "01001", radius_miles: 50 }, { planCode: "state", territory: { states: ["PA"], county_fips: [] } })).rejects.toMatchObject({ status: 403 });
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it("retains explicit state, name and entity filters", async () => {
    await handleSearchProviders({ q: "Smith", state: "ct", entity_type: "Individual", limit: 25, radius_zip: "01001", radius_miles: 50 });
    expect(mocks.run).toHaveBeenCalledWith(expect.anything(), "Smith", { state: "CT", entityType: "Individual", limit: 25 }, expect.anything(), expect.anything());
  });
});
