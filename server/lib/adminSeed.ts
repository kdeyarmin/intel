// Seeds the first admin from ADMIN_EMAIL / ADMIN_PASSWORD at start-up.
import { isActiveAdmin, normalizeEmail } from "./accounts";
import type { UserRepo } from "./userRepo";
import { LEGACY_ORG_ID, type OrgRepo } from "./orgs";

export type SeedOutcome = "seeded" | "exists" | "restored" | "left_alone" | "skipped_no_password" | "invalid_email";

export async function seedAdmin(
  repo: UserRepo,
  opts: {
    env?: NodeJS.ProcessEnv;
    hashPassword: (pw: string) => Promise<string>;
    verifyPassword: (pw: string, hash: string) => Promise<boolean>;
    /** When given, the admin is also made an owner of the first organization if they belong to none. */
    orgs?: Pick<OrgRepo, "membershipOf" | "addMember">;
  },
): Promise<{ outcome: SeedOutcome; email: string | null }> {
  const env = opts.env ?? process.env;
  const email = normalizeEmail(env.ADMIN_EMAIL || "admin@caremetric.local");
  if (!email) return { outcome: "invalid_email", email: null };
  // No real credential is committed to source. Production requires ADMIN_PASSWORD;
  // dev falls back to a clearly non-secret placeholder that should be changed.
  const password = env.ADMIN_PASSWORD || (env.NODE_ENV === "production" ? null : "changeme-dev-only");

  // The admin role and the platform-admin flag are one thing, and the first admin needs an organization
  // (the migration only places users that already existed) to use anything customer-owned.
  const withOrganization = async (userId: number) => {
    if (opts.orgs && !(await opts.orgs.membershipOf(userId))) await opts.orgs.addMember(LEGACY_ORG_ID, userId, "owner");
  };

  const [existing] = await repo.findByEmail(email);
  if (!existing) {
    if (!password) return { outcome: "skipped_no_password", email };
    const created = await repo.create({
      email,
      password_hash: await opts.hashPassword(password),
      full_name: env.ADMIN_FULL_NAME || "CareMetric Healthcare Advisors Admin",
      role: "admin",
      is_platform_admin: true,
      status: "active",
      approved_at: new Date(),
      approved_by: "system",
    });
    await withOrganization(created.id);
    return { outcome: "seeded", email };
  }
  if (isActiveAdmin(existing)) {
    await withOrganization(existing.id);
    return { outcome: "exists", email };
  }

  // The admin address exists without admin rights. Restore it only when no
  // one else can administer the app and it still has the configured password,
  // so neither a deliberate demotion nor someone who grabbed the address is
  // turned into an admin by a restart.
  const admins = await repo.activeAdmins();
  if (admins.length === 0 && env.ADMIN_PASSWORD && (await opts.verifyPassword(env.ADMIN_PASSWORD, existing.password_hash))) {
    await repo.update(existing.id, { role: "admin", is_platform_admin: true, status: "active", approved_at: existing.approved_at ?? new Date(), approved_by: existing.approved_by ?? "system", disabled_at: null, disabled_reason: null });
    await withOrganization(existing.id);
    return { outcome: "restored", email };
  }
  return { outcome: "left_alone", email };
}
