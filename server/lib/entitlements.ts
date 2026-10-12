// Territory entitlements: a plan covers counties, a state or the country.
// Market, county, territory and referral views check the place they are
// asked about against the organization's territory; outside it they answer
// 403 with an upgrade message. Platform admins and organizations whose plan
// covers everything (the legacy organization, national plans, a trial that
// hasn't chosen one) see everything; a County Pack or State plan covers only
// the places its owner chose, and nothing until they have chosen.
import { normalizeTerritory, type Territory } from "./orgs";
import { isPlatformAdmin } from "./roles";
import { FIPS_STATE, STATE_FIPS, stateFipsOf } from "./stateFips";

export { STATE_FIPS, stateFipsOf };

export interface EntitledUser {
  isPlatformAdmin?: boolean;
  role?: string | null;
  territory?: Territory | null;
  orgStatus?: string | null;
  orgBillingStatusSince?: Date | string | null;
  planCode?: string | null;
}

/** Plans that cover only the places chosen on the Billing page (an empty territory is then no place at all). */
export const TERRITORY_PLANS: ReadonlySet<string> = new Set(["county_pack", "state"]);

export class TerritoryError extends Error {
  status = 403;
  code = "outside_territory";
  constructor(message: string) {
    super(message);
  }
}

export class SubscriptionError extends Error {
  status = 402;
  code = "subscription_inactive";
  constructor(message: string) {
    super(message);
  }
}

/** Statuses under which an organization may use the market data. */
export const USABLE_ORG_STATUSES = new Set(["trial", "active", "past_due"]);

/**
 * Statuses under which an organization may incur costs (AI calls, paid email,
 * exports). Narrower than USABLE_ORG_STATUSES: a past_due organization keeps
 * read-only access, but it may not send paid email or burn AI tokens until it
 * pays; a canceled one may not either.
 */
const BILLABLE_ORG_STATUSES: ReadonlySet<string> = new Set(["trial", "active"]);

/**
 * Throws a 402 SubscriptionError unless the organization's status permits
 * cost-incurring actions. Other area workers import this exact name.
 */
export function assertBillableOrg(org: { status?: string } | undefined): void {
  if (org && BILLABLE_ORG_STATUSES.has(org.status ?? "")) return;
  throw new SubscriptionError("Your organization's subscription isn't active. An owner can reactivate it on the Billing page.");
}

/**
 * The dunning ladder, as one access tier per organization:
 * - "full": trial or active — everything the plan allows.
 * - "readonly": past_due for less than PAST_DUE_READONLY_MS — reads keep
 *   working; spend is already blocked separately (assertBillableOrg).
 * - "billing_only": past_due past the grace window, or canceled (or any
 *   other unusable status) — the user can still sign in and reach the
 *   Billing page, but entity reads and function calls are closed until the
 *   organization pays. No emails here: Stripe sends its own dunning notices.
 *
 * An account with no organization (no status) has nothing to dun: "full".
 * A past_due organization whose clock start is unknown keeps read-only
 * access — the ladder only escalates on a proven age.
 */
export type OrgAccessTier = "full" | "readonly" | "billing_only";

/** How long a past_due organization keeps read-only access before billing-only. */
export const PAST_DUE_READONLY_MS = 14 * 24 * 60 * 60 * 1000;

export function orgAccessTier(
  org: { status?: string | null; billingStatusSince?: Date | string | null } | null | undefined,
  now: Date = new Date(),
): OrgAccessTier {
  const status = org?.status ?? null;
  if (status == null) return "full";
  if (status === "trial" || status === "active") return "full";
  if (status === "past_due") {
    const since = org?.billingStatusSince ? new Date(org.billingStatusSince) : null;
    if (since && !Number.isNaN(since.getTime()) && now.getTime() - since.getTime() >= PAST_DUE_READONLY_MS) return "billing_only";
    return "readonly";
  }
  return "billing_only";
}

/** Throws a 402 SubscriptionError when the organization is down to billing-only access. */
export function assertOrgAccess(org: { status?: string | null; billingStatusSince?: Date | string | null } | null | undefined, now: Date = new Date()): void {
  if (orgAccessTier(org, now) !== "billing_only") return;
  throw new SubscriptionError("Your organization's subscription has lapsed. An owner can update payment on the Billing page to restore access.");
}

export function territoryOf(user: EntitledUser | null | undefined): Territory {
  return normalizeTerritory(user?.territory);
}

export function isUnrestricted(user: EntitledUser | null | undefined): boolean {
  if (!user) return true;
  if (isPlatformAdmin(user)) return true;
  const t = territoryOf(user);
  if (t.states.length > 0 || t.county_fips.length > 0) return false;
  // Nothing chosen: everything for a plan that covers everything, nothing for one that covers chosen places.
  return !(user.planCode && TERRITORY_PLANS.has(user.planCode));
}

/** Whether the plan covers chosen places but none are chosen yet. */
export function needsTerritoryChoice(user: EntitledUser | null | undefined): boolean {
  if (!user || isPlatformAdmin(user)) return false;
  const t = territoryOf(user);
  return t.states.length === 0 && t.county_fips.length === 0 && !!user.planCode && TERRITORY_PLANS.has(user.planCode);
}

/** Whether a state (and optionally a county) is inside the user's territory. */
export function inTerritory(user: EntitledUser | null | undefined, place: { state?: string | null; county_fips?: string | null }): boolean {
  if (isUnrestricted(user)) return true;
  const t = territoryOf(user);
  const state = String(place.state ?? "").trim().toUpperCase();
  const county = String(place.county_fips ?? "").trim();
  if (county && /^\d{5}$/.test(county)) {
    if (t.county_fips.includes(county)) return true;
    return t.states.includes(county.slice(0, 2) === "" ? "" : stateOfCounty(county, t));
  }
  if (state) return t.states.includes(state) || t.county_fips.some((c) => stateFipsOf(state) != null && c.startsWith(stateFipsOf(state)!));
  return true;
}

// A county in a state plan passes through the state's FIPS prefix (the table lives in ./stateFips).
function stateOfCounty(countyFips: string, _t: Territory): string {
  return FIPS_STATE[countyFips.slice(0, 2)] ?? "";
}

/**
 * What a restricted user may see, as county FIPS codes and state FIPS prefixes (null = everything), for
 * queries that narrow rows to the plan's territory in SQL instead of after a row limit.
 */
export function territoryScope(user: EntitledUser | null | undefined): { counties: string[]; statePrefixes: string[] } | null {
  if (isUnrestricted(user)) return null;
  const t = territoryOf(user);
  return { counties: t.county_fips, statePrefixes: t.states.map((s) => stateFipsOf(s)).filter((p): p is string => !!p) };
}

/** The counties of a state the user may see (null = all of them). */
export function entitledCounties(user: EntitledUser | null | undefined, state: string): string[] | null {
  if (isUnrestricted(user)) return null;
  const t = territoryOf(user);
  const st = state.toUpperCase();
  if (t.states.includes(st)) return null;
  const prefix = stateFipsOf(st);
  return prefix ? t.county_fips.filter((c) => c.startsWith(prefix)) : [];
}

/** Throws a 403 TerritoryError when the place is outside the user's plan, and a 402 when the organization can't use the app. */
export function assertTerritory(user: EntitledUser | null | undefined, place: { state?: string | null; county_fips?: string | null; county_name?: string | null }) {
  if (user && !isPlatformAdmin(user) && user.orgStatus && orgAccessTier({ status: user.orgStatus, billingStatusSince: user.orgBillingStatusSince }) === "billing_only") {
    throw new SubscriptionError("Your organization's subscription isn't active. An owner can reactivate it on the Billing page.");
  }
  if (needsTerritoryChoice(user)) {
    throw new TerritoryError("Your plan covers the places you choose. An owner can pick them on the Billing page.");
  }
  if (inTerritory(user, place)) return;
  const where = place.county_name ? `${place.county_name}${place.state ? `, ${place.state}` : ""}` : place.county_fips ? `county ${place.county_fips}` : place.state ? `${String(place.state).toUpperCase()}` : "this area";
  throw new TerritoryError(`${where} is outside your plan's territory. Upgrade on the Billing page, or ask an owner to add it.`);
}
