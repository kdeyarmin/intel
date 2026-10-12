// Territory entitlements: a plan covers counties, a state or the country.
// Market, county, territory and referral views check the place they are
// asked about against the organization's territory; outside it they answer
// 403 with an upgrade message. Platform admins and organizations whose plan
// covers everything (the legacy organization, national plans, a trial that
// hasn't chosen one) see everything; a County Pack or State plan covers only
// the places its owner chose, and nothing until they have chosen.
import { normalizeTerritory, type Territory } from "./orgs";
import { isPlatformAdmin } from "./roles";

export interface EntitledUser {
  isPlatformAdmin?: boolean;
  role?: string | null;
  territory?: Territory | null;
  orgStatus?: string | null;
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

// County FIPS → state abbreviation isn't needed for the common case: a state
// plan stores the state, a county pack stores counties. A county in a state
// plan passes through the state's FIPS prefix.
export const STATE_FIPS: Record<string, string> = {
  AL: "01", AK: "02", AZ: "04", AR: "05", CA: "06", CO: "08", CT: "09", DE: "10", DC: "11", FL: "12", GA: "13", HI: "15", ID: "16", IL: "17", IN: "18", IA: "19", KS: "20", KY: "21", LA: "22", ME: "23", MD: "24", MA: "25", MI: "26", MN: "27", MS: "28", MO: "29", MT: "30", NE: "31", NV: "32", NH: "33", NJ: "34", NM: "35", NY: "36", NC: "37", ND: "38", OH: "39", OK: "40", OR: "41", PA: "42", RI: "44", SC: "45", SD: "46", TN: "47", TX: "48", UT: "49", VT: "50", VA: "51", WA: "53", WV: "54", WI: "55", WY: "56", PR: "72", AS: "60", GU: "66", MP: "69", VI: "78",
};
const FIPS_STATE: Record<string, string> = Object.fromEntries(Object.entries(STATE_FIPS).map(([k, v]) => [v, k]));

export function stateFipsOf(state: string): string | null {
  return STATE_FIPS[state.toUpperCase()] ?? null;
}

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
  if (user && !isPlatformAdmin(user) && user.orgStatus && !USABLE_ORG_STATUSES.has(user.orgStatus)) {
    throw new SubscriptionError("Your organization's subscription isn't active. An owner can reactivate it on the Billing page.");
  }
  if (needsTerritoryChoice(user)) {
    throw new TerritoryError("Your plan covers the places you choose. An owner can pick them on the Billing page.");
  }
  if (inTerritory(user, place)) return;
  const where = place.county_name ? `${place.county_name}${place.state ? `, ${place.state}` : ""}` : place.county_fips ? `county ${place.county_fips}` : place.state ? `${String(place.state).toUpperCase()}` : "this area";
  throw new TerritoryError(`${where} is outside your plan's territory. Upgrade on the Billing page, or ask an owner to add it.`);
}
