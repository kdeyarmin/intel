// matchProvidersToLocations (admin): suggest which Medicare facilities in the
// same state each provider is likely affiliated with. Writes 'suggested' rows
// to provider_location_matches for review on the matching page; approved,
// rejected and overridden pairs are kept and never re-suggested.
import { pool } from "../db";
import { inSequence } from "../lib/pgSequence";
import { LISTING_PRIMARY_TYPES } from "./facilityDetail";
import { FACILITY_GROUP_LABELS, scoreProviderMatches, type FacilityMatch, type MatchFacility, type MatchProvider } from "../lib/matching";

const MAX_PROVIDERS = 500;
const MAX_FACILITIES = 20_000;
const DEFAULT_GROUPS = ["hospital", "snf", "home_health", "hospice"];

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const zip5 = (z: string | null) => String(z || "").replace(/\D/g, "").slice(0, 5);
const city = (c: string | null) => String(c || "").trim().toLowerCase();

// A facility's identity across data years (each yearly import is a new row):
// its type and CMS provider number, else its name and ZIP.
const facilityKey = (f: { facility_type: string; provider_id: string | null; facility_name: string | null; zip: string | null }) =>
  `${f.facility_type}|${f.provider_id || `${String(f.facility_name || "").toLowerCase()}|${zip5(f.zip)}`}`;

// One matching run at a time: a run replaces the suggestions of the providers
// it checks, and two overlapping runs would both insert theirs.
const MATCHING_LOCK = "hashtext('provider_location_matching')";

function groupFor(facilityType: string): string {
  return Object.entries(LISTING_PRIMARY_TYPES).find(([, t]) => t === facilityType)?.[0] || "hospital";
}

export async function handleMatchProvidersToLocations(payload: any) {
  const state = String(payload?.state || "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(state)) throw new HttpError(400, "Choose a state to match providers in.");
  const groups: string[] = (Array.isArray(payload?.facility_types) && payload.facility_types.length ? payload.facility_types : DEFAULT_GROUPS)
    .map(String).filter((g: string) => LISTING_PRIMARY_TYPES[g]);
  if (!groups.length) throw new HttpError(400, "Choose at least one facility type.");
  const listId = Number(payload?.lead_list_id);

  const client = await pool.connect();
  let locked = false;
  try {
    locked = (await client.query(`SELECT pg_try_advisory_lock(${MATCHING_LOCK}) AS ok`)).rows[0]?.ok === true;
    if (!locked) return { success: false, error: "Another matching run is in progress. Try again when it finishes." };
    await client.query("SET statement_timeout = '20s'");

    // Providers practicing in the state (optionally only those on a lead list).
    let locRows: any[];
    if (Number.isInteger(listId) && listId > 0) {
      const { rows: members } = await client.query(
        "SELECT npi FROM lead_list_members WHERE list_id = $1 AND npi IS NOT NULL LIMIT 5000", [listId]);
      ({ rows: locRows } = await client.query(
        "SELECT npi, address_1, city, zip FROM provider_locations WHERE npi = ANY($1) AND state = $2 AND location_type = 'Practice'",
        [members.map((m: any) => m.npi), state],
      ));
    } else {
      ({ rows: locRows } = await client.query(
        "SELECT npi, address_1, city, zip FROM provider_locations WHERE state = $1 AND location_type = 'Practice' LIMIT $2",
        [state, MAX_PROVIDERS * 3],
      ));
    }
    const firstLoc = new Map<string, any>();
    for (const r of locRows) if (!firstLoc.has(r.npi)) firstLoc.set(r.npi, r);
    const npis = [...firstLoc.keys()].slice(0, MAX_PROVIDERS);
    if (!npis.length) {
      return { success: false, error: `No providers with a practice location in ${state}${listId ? " on that lead list" : ""}.` };
    }

    const [prov, tax, refs, facs, decided] = await inSequence([
      () => client.query("SELECT npi, entity_type, first_name, last_name, organization_name, credential FROM providers WHERE npi = ANY($1)", [npis]),
      () => client.query("SELECT npi, taxonomy_description FROM provider_taxonomies WHERE npi = ANY($1) AND is_primary = true", [npis]),
      () => client.query(
        "SELECT npi, referred_to_npi, total_referrals FROM cms_referrals WHERE npi = ANY($1) AND referred_to_npi IS NOT NULL LIMIT 50000",
        [npis],
      ),
      // idx_medfac_type_state
      () => client.query(
        `SELECT id, facility_type, provider_id, facility_name, address, city, zip FROM medicare_facilities
          WHERE facility_type = ANY($1) AND state = $2 ORDER BY id DESC LIMIT $3`,
        [groups.map((g) => LISTING_PRIMARY_TYPES[g]), state, MAX_FACILITIES],
      ),
      () => client.query(
        "SELECT npi, facility_id FROM provider_location_matches WHERE npi = ANY($1) AND match_type = 'facility' AND status <> 'suggested'",
        [npis],
      ),
    ]);

    // One row per facility (several data years can repeat it); newest wins.
    const keyById = new Map<number, string>();
    const facilities: MatchFacility[] = [];
    const seen = new Set<string>();
    for (const f of facs.rows) {
      const key = facilityKey(f);
      if (seen.has(key) || !f.facility_name) continue;
      seen.add(key);
      keyById.set(f.id, key);
      facilities.push({ id: f.id, group: groupFor(f.facility_type), provider_id: f.provider_id, name: f.facility_name, address: f.address, city: f.city, zip: f.zip });
    }
    if (!facilities.length) {
      const kinds = groups.map((g) => FACILITY_GROUP_LABELS[g]?.toLowerCase() || g).join(", ");
      return { success: false, notConfigured: true, error: `No facilities of the chosen types (${kinds}) have been imported for ${state} yet. Import the CMS facility datasets first.` };
    }
    const byZip = new Map<string, MatchFacility[]>();
    const byCity = new Map<string, MatchFacility[]>();
    const byZip3 = new Map<string, MatchFacility[]>();
    const push = (m: Map<string, MatchFacility[]>, k: string, f: MatchFacility) => { if (k) (m.get(k) || m.set(k, []).get(k)!).push(f); };
    for (const f of facilities) {
      push(byZip, zip5(f.zip), f);
      push(byCity, city(f.city), f);
      push(byZip3, zip5(f.zip).length === 5 ? zip5(f.zip).slice(0, 3) : "", f);
    }

    const sent = new Map<string, Map<string, number>>();
    for (const r of refs.rows) {
      if (!sent.has(r.npi)) sent.set(r.npi, new Map());
      const m = sent.get(r.npi)!;
      m.set(r.referred_to_npi, Math.max(m.get(r.referred_to_npi) || 0, Number(r.total_referrals) || 1));
    }
    const specialty = new Map<string, string>(tax.rows.map((t: any) => [t.npi, t.taxonomy_description]));
    const info = new Map<string, any>(prov.rows.map((p: any) => [p.npi, p]));
    // Reviewed pairs, by facility identity rather than row id, so a facility
    // re-imported for a new year isn't suggested again.
    const decidedIds = [...new Set(decided.rows.map((d: any) => d.facility_id).filter((id: any) => id != null))];
    const decidedFacs = decidedIds.length
      ? await client.query("SELECT id, facility_type, provider_id, facility_name, zip FROM medicare_facilities WHERE id = ANY($1)", [decidedIds])
      : { rows: [] };
    const decidedKey = new Map<number, string>(decidedFacs.rows.map((f: any) => [f.id, facilityKey(f)]));
    const decidedPairs = new Set(decided.rows.map((d: any) => `${d.npi}|${decidedKey.get(d.facility_id) ?? `id:${d.facility_id}`}`));

    const suggestions: FacilityMatch[] = [];
    let matchedProviders = 0;
    for (const npi of npis) {
      const loc = firstLoc.get(npi);
      const p = info.get(npi) || {};
      const isOrganization = p.entity_type === "Organization" || (!!p.organization_name && !p.last_name);
      const person = [p.first_name, p.last_name].filter(Boolean).join(" ");
      const provider: MatchProvider = {
        npi,
        name: isOrganization ? p.organization_name || npi : person ? `${person}${p.credential ? `, ${p.credential}` : ""}` : npi,
        isOrganization,
        taxonomy: specialty.get(npi) || null,
        address: loc.address_1,
        city: loc.city,
        zip: loc.zip,
      };
      const z = zip5(loc.zip);
      const candidates = new Map<number, MatchFacility>();
      for (const f of [...(byZip.get(z) || []), ...(byCity.get(city(loc.city)) || []), ...(z.length === 5 ? byZip3.get(z.slice(0, 3)) || [] : [])]) {
        if (candidates.size >= 400) break;
        // Leave out facilities already reviewed for this provider before
        // ranking, so the best remaining ones are suggested.
        if (decidedPairs.has(`${npi}|${keyById.get(f.id)}`)) continue;
        candidates.set(f.id, f);
      }
      const referrals = sent.get(npi);
      const matches = scoreProviderMatches(provider, [...candidates.values()], (f) =>
        (f.provider_id && /^\d{10}$/.test(f.provider_id) ? referrals?.get(f.provider_id) || 0 : 0));
      if (matches.length) matchedProviders += 1;
      suggestions.push(...matches);
    }

    await client.query("BEGIN");
    try {
      // Replace earlier suggestions for these providers; reviewed pairs stay.
      await client.query(
        "DELETE FROM provider_location_matches WHERE npi = ANY($1) AND match_type = 'facility' AND status = 'suggested'", [npis]);
      for (let i = 0; i < suggestions.length; i += 200) {
        const part = suggestions.slice(i, i + 200);
        const values: unknown[] = [];
        const tuples = part.map((m, j) => {
          values.push(m.npi, m.facility_id, m.confidence_score, m.provider_name, m.location_display, JSON.stringify(m.match_reasons),
            m.address_match_score, m.proximity_score, m.specialization_score, m.referral_score, m.name_match_score ?? null);
          const o = j * 11;
          return `($${o + 1}, $${o + 2}, $${o + 3}, 'facility', 'suggested', $${o + 4}, $${o + 5}, $${o + 6}::jsonb, $${o + 7}, $${o + 8}, $${o + 9}, $${o + 10}, $${o + 11}, now())`;
        });
        await client.query(
          `INSERT INTO provider_location_matches (npi, facility_id, confidence_score, match_type, status, provider_name, location_display,
             match_reasons, address_match_score, proximity_score, specialization_score, referral_score, name_match_score, matched_at)
           VALUES ${tuples.join(", ")}`,
          values,
        );
      }
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    }

    return {
      success: true,
      state,
      facility_types: groups,
      providers_checked: npis.length,
      facilities_considered: facilities.length,
      matched: matchedProviders,
      unmatched: npis.length - matchedProviders,
      suggestions_created: suggestions.length,
      decisions_kept: decided.rows.length,
      capped: locRows.length >= MAX_PROVIDERS * 3 || facs.rows.length >= MAX_FACILITIES,
    };
  } finally {
    await client.query("RESET statement_timeout").catch(() => {});
    if (locked) await client.query(`SELECT pg_advisory_unlock(${MATCHING_LOCK})`).catch(() => {});
    client.release();
  }
}
