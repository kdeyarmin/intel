import { describe, expect, it } from "vitest";
import { isOrgAdmin, isPlatformAdmin } from "../server/lib/roles";

describe("roles", () => {
  it("makes a platform admin of the admin role or the flag, nothing else", () => {
    expect(isPlatformAdmin({ role: "admin" })).toBe(true);
    expect(isPlatformAdmin({ role: "user", isPlatformAdmin: true })).toBe(true);
    expect(isPlatformAdmin({ role: "admin", isPlatformAdmin: false })).toBe(true);
    expect(isPlatformAdmin({ role: "user", orgRole: "owner" })).toBe(false);
    expect(isPlatformAdmin({ role: "user", orgRole: "member", isPlatformAdmin: false })).toBe(false);
    // Only a real `true` counts: a truthy string in a malformed row is not a grant.
    expect(isPlatformAdmin({ role: "user", isPlatformAdmin: "yes" as any })).toBe(false);
    expect(isPlatformAdmin(null)).toBe(false);
    expect(isPlatformAdmin(undefined)).toBe(false);
    expect(isPlatformAdmin({})).toBe(false);
  });

  it("lets an organization's owner and any platform admin administer an organization", () => {
    expect(isOrgAdmin({ role: "user", orgRole: "owner" })).toBe(true);
    expect(isOrgAdmin({ role: "admin" })).toBe(true);
    expect(isOrgAdmin({ role: "user", isPlatformAdmin: true })).toBe(true);
    expect(isOrgAdmin({ role: "user", orgRole: "member" })).toBe(false);
    expect(isOrgAdmin({ role: "user" })).toBe(false);
    expect(isOrgAdmin(null)).toBe(false);
  });
});
