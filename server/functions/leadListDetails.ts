import { getTableName, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { pool } from "../db";
import {
  providers,
  leadScores,
  providerLocations,
  providerServiceUtilization,
  cmsReferrals,
  providerTaxonomies,
} from "../db/schema";
import { decorateRow } from "../lib/entityFields";

/** Most NPIs one call accepts; the Lead Lists page sends its members in chunks of this size. */
export const MAX_MEMBER_DETAIL_NPIS = 500;

// One row per requested NPI from each detail table, chosen per NPI. A shared
// LIMIT over `npi IN (...)` let an NPI with hundreds of rows (a lab's HCPCS
// lines, a hospital's referral targets) fill the result and leave other
// members with no details. `order` is a fixed fragment, never request input.
export const MEMBER_DETAIL_SOURCES: ReadonlyArray<{ key: string; entity: string; table: any; order: string }> = [
  { key: "providers", entity: "Provider", table: providers, order: "id DESC" },
  { key: "scores", entity: "LeadScore", table: leadScores, order: "id DESC" },
  // The NPPES practice address first: that's what decorateRow calls is_primary.
  { key: "locations", entity: "ProviderLocation", table: providerLocations, order: "(location_type = 'Practice') DESC NULLS LAST, id DESC" },
  { key: "utilizations", entity: "ProviderServiceUtilization", table: providerServiceUtilization, order: "id DESC" },
  { key: "referrals", entity: "CMSReferral", table: cmsReferrals, order: "id DESC" },
  { key: "taxonomies", entity: "ProviderTaxonomy", table: providerTaxonomies, order: "is_primary DESC NULLS LAST, id DESC" },
];

/** Ids of the chosen row per NPI in $1: one npi-index lookup per NPI, so each gets its own LIMIT. */
export function memberDetailIdsSql(tableName: string, order: string): string {
  return `SELECT d.id
            FROM unnest($1::text[]) AS k(npi)
            CROSS JOIN LATERAL (
              SELECT id FROM ${tableName} WHERE npi = k.npi ORDER BY ${order} LIMIT 1
            ) d`;
}

/** The request's NPIs as unique, non-empty strings. Throws a 400 for a bad or oversized list. */
export function normalizeMemberNpis(raw: unknown): string[] {
  if (!Array.isArray(raw)) throw { status: 400, message: "npis must be a list of NPIs." };
  const npis = [...new Set(
    raw
      .filter((v) => typeof v === "string" || typeof v === "number")
      .map((v) => String(v).trim())
      .filter(Boolean),
  )];
  if (npis.length > MAX_MEMBER_DETAIL_NPIS) {
    throw { status: 400, message: `At most ${MAX_MEMBER_DETAIL_NPIS} NPIs per request.` };
  }
  return npis;
}

/**
 * Lead-list member details: for each NPI, its provider row, newest lead score,
 * practice location (else newest), newest utilization and referral rows, and
 * primary taxonomy (else newest). Rows have the entity API's shape.
 */
export async function handleGetLeadListMemberDetails(params: any) {
  const npis = normalizeMemberNpis(params?.npis);
  const result: Record<string, any[]> = Object.fromEntries(MEMBER_DETAIL_SOURCES.map((s) => [s.key, []]));
  if (npis.length === 0) return result;

  const client = await pool.connect();
  try {
    await client.query("SET statement_timeout = '15s'");
    const onClient = drizzle(client);
    for (const source of MEMBER_DETAIL_SOURCES) {
      const { rows } = await client.query(memberDetailIdsSql(getTableName(source.table), source.order), [npis]);
      const ids = rows.map((r: any) => r.id);
      if (ids.length === 0) continue;
      const full = await onClient.select().from(source.table).where(inArray(source.table.id, ids));
      result[source.key] = full.map((row: any) => decorateRow(source.entity, row));
    }
    return result;
  } finally {
    // RESET so the timeout doesn't follow this pooled connection to its next query.
    await client.query("RESET statement_timeout").catch(() => {});
    client.release();
  }
}
