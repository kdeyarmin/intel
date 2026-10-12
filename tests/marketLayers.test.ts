import { describe, expect, it, vi } from "vitest";

vi.mock("../server/db", () => ({ pool: {} }));

import { LAYER_METRICS } from "../server/functions/market";
// @ts-expect-error -- plain JS module
import { COUNTY_LAYER_METRICS } from "../src/lib/marketLayers.js";

describe("county layer metrics", () => {
  it("are mirrored between the server and the client, key by key", () => {
    expect(COUNTY_LAYER_METRICS.map((m: any) => [m.key, m.label, m.format]))
      .toEqual(Object.entries(LAYER_METRICS).map(([key, m]) => [key, m.label, m.format]));
  });

  it("name real columns of the county profile with a known format", () => {
    for (const [key, m] of Object.entries(LAYER_METRICS)) {
      expect(m.column, key).toMatch(/^[a-z_0-9]+$/);
      expect(["count", "percent", "pct_units", "money", "rate"]).toContain(m.format);
      expect(["enrollment", "saturation", "variation", "hospital_service_area", "pac_utilization", "acs", "licensed"]).toContain(m.vintage);
    }
  });
});
