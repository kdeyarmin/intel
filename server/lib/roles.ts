// Who a signed-in account is, for access checks. One definition, used by the
// middleware, the entity router, the function dispatcher and the handlers.
//
// Platform administrator: operates the platform itself (imports, the crawler,
// maintenance, the shared data) and sees every organization. The admin role and
// the users.is_platform_admin flag are one thing (the Users screen and the
// invite and seed paths keep them together); either grants it.
// Organization owner: administers their own organization (people, plan,
// billing, campaigns), never the data every customer shares.
export interface RoleFields {
  role?: string | null;
  orgRole?: string | null;
  isPlatformAdmin?: boolean | null;
}

export function isPlatformAdmin(user: RoleFields | null | undefined): boolean {
  return !!user && (user.isPlatformAdmin === true || user.role === "admin");
}

/** An organization's administrator: its owner, or a platform admin. */
export function isOrgAdmin(user: RoleFields | null | undefined): boolean {
  return isPlatformAdmin(user) || user?.orgRole === "owner";
}
