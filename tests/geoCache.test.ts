/**
 * getGeoIndex caching: a reload elsewhere (autoload, another instance,
 * geo:load) shows up within a minute, a reset discards a load that was
 * already in flight, and each load reads one consistent snapshot.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { getGeoIndex, resetGeoCache } from "../server/lib/geo";

function fakePool(state: { stamp: string; county: string; hold?: Promise<void>; fail?: string }) {
  const statements: string[] = [];
  const query = vi.fn(async (sql: string) => {
    if (state.fail && sql.includes(state.fail)) throw new Error("connection lost");
    if (sql.includes("FROM geo_meta")) return { rows: [{ vintage: "2020", stamp: state.stamp }] };
    if (sql.includes("FROM geo_counties")) {
      const name = state.county;
      await state.hold;
      return { rows: [{ fips: "42003", state: "PA", name, lat: 40.4, lng: -80 }] };
    }
    return { rows: [] };
  });
  const client = {
    query: vi.fn(async (sql: string) => { statements.push(sql); return query(sql); }),
    release: vi.fn(),
  };
  return { query, connect: vi.fn(async () => client), client, statements };
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

  it("reads the stamp and all three tables on one connection, in one read-only snapshot", async () => {
    const pool = fakePool({ stamp: "t1", county: "Allegheny" });
    await getGeoIndex(pool);
    expect(pool.connect).toHaveBeenCalledTimes(1);
    expect(pool.query).toHaveBeenCalledTimes(pool.statements.length); // nothing read outside the transaction
    // The tables are locked (in the loader's TRUNCATE order) before the first
    // SELECT takes the snapshot, so a reload's TRUNCATE can't commit inside it.
    expect(pool.statements).toEqual([
      "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY",
      "LOCK TABLE geo_zcta_counties, geo_zctas, geo_counties IN ACCESS SHARE MODE",
      expect.stringContaining("FROM geo_meta"),
      expect.stringContaining("FROM geo_counties"),
      expect.stringContaining("FROM geo_zctas"),
      expect.stringContaining("FROM geo_zcta_counties"),
      "COMMIT",
    ]);
    expect(pool.client.release).toHaveBeenCalledTimes(1);
  });

  it("rolls back, releases the connection and caches nothing when a read fails", async () => {
    const state: { stamp: string; county: string; fail?: string } = { stamp: "t1", county: "Allegheny", fail: "FROM geo_zctas" };
    const pool = fakePool(state);
    await expect(getGeoIndex(pool)).rejects.toThrow("connection lost");
    expect(pool.statements.at(-1)).toBe("ROLLBACK");
    expect(pool.client.release).toHaveBeenCalledTimes(1);
    state.fail = undefined;
    expect((await getGeoIndex(pool)).counties.get("42003")?.name).toBe("Allegheny");
  });
});
