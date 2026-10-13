import { describe, it, expect } from "vitest";
import { publicErrorMessage } from "../server/lib/publicError";

describe("publicErrorMessage", () => {
  const sql = Object.assign(new Error('relation "provider_locations" does not exist'), { code: "42P01", severity: "ERROR" });
  const conn = Object.assign(new Error("connect ECONNREFUSED 10.0.0.5:5432"), { code: "ECONNREFUSED" });
  const meant = Object.assign(new Error("Pick a state or a lead list."), { status: 400 });
  const worded = new Error("Email isn't configured yet.");

  it("hides database and connection details in production", () => {
    expect(publicErrorMessage(sql, true)).toBe("Something went wrong. Please retry.");
    expect(publicErrorMessage(conn, true)).toBe("Something went wrong. Please retry.");
  });

  it("keeps messages handlers chose to show, and everything in development", () => {
    expect(publicErrorMessage(meant, true)).toBe("Pick a state or a lead list.");
    expect(publicErrorMessage(worded, true)).toBe("Email isn't configured yet.");
    expect(publicErrorMessage(sql, false)).toBe(sql.message);
  });
});
