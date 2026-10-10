/**
 * getGeoIndex caching: a reload elsewhere (autoload, another instance,
 * geo:load) shows up within a minute, and a reset discards a load that was
 * already in flight.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { getGeoIndex, resetGeoCache } from "../server/lib/geo";

function fakePool(state: { stamp: string; county: string; hold?: Promise<void> }) {
  return {
    query: vi.fn(async (sql: string) => {
      if (sql.includes("FROM geo_meta")) return { rows: [{ vintage: "2020", stamp: state.stamp }] };
      if (sql.includes("FROM geo_counties")) {
        const name = state.county;
        await state.hold;
        return { rows: [{ fips: "42003", state: "PA", name, lat: 40.4, lng: -80 }] };
      }
      return { rows: [] };
    }),
  };
}

afterEach(() => { resetGeoCache(); vi.useRealTimers(); });

describe("getGeoIndex", () => {
  it("picks up reloaded data once the stamp changes", async () => {
    vi.useFakeTimers();
    const state = { stamp: "t1", county: "Allegheny" };
    const pool = fakePool(state);
    expect((await getGeoIndex(pool)).counties.get("42003")?.name).toBe("Allegheny");

    state.stamp = "t2";
    state.county = "Allegheny (reloaded)";
    expect((await getGeoIndex(pool)).counties.get("42003")?.name).toBe("Allegheny"); // within the recheck window
    vi.advanceTimersByTime(61_000);
    expect((await getGeoIndex(pool)).counties.get("42003")?.name).toBe("Allegheny (reloaded)");
  });

  it("doesn't cache a load that started before a reset", async () => {
    let release!: () => void;
    const state = { stamp: "t1", county: "Old", hold: new Promise<void>((r) => { release = r; }) };
    const pool = fakePool(state);
    const stale = getGeoIndex(pool);
    resetGeoCache(); // e.g. autoload just replaced the data
    state.county = "New";
    state.hold = Promise.resolve();
    release();
    await stale;
    expect((await getGeoIndex(pool)).counties.get("42003")?.name).toBe("New");
  });
});
