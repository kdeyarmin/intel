// Turns a Base44 entity export into an ordered, idempotent import plan.
// Nothing here opens a database or a network connection.
import {
  directoryAccountKey,
  isValidEmail,
  isValidNpi,
  normalizeDomain,
  normalizeEmail,
  normalizeNpi,
  normalizePhone,
  normalizeRole,
  normalizeStage,
  normalizeType,
  stableAccountKey,
  tagsToStorage,
} from "../../src/lib/crmQuality.js";

export const BASE44_APP_ID = "6993c62145573ca8a97ad4a9";

/** Customer data the Railway schema can store. CMS/NPPES bulk tables are not in this set. */
export const IMPORT_ENTITIES = [
  "User",
  "CrmAccount",
  "CrmContact",
  "CrmActivity",
  "CrmReferral",
  "CrmCampaignTouch",
  "CallSheet",
  "CallSheetAccount",
  "LeadList",
  "LeadListMember",
  "SavedFilter",
  "OutreachCampaign",
  "OutreachMessage",
  "CampaignTemplate",
  "Campaign",
] as const;

/**
 * Large public datasets. Count them, do not copy them: Railway reloads these
 * from CMS and NPPES. Copying them from Base44 would duplicate that pipeline.
 */
export const BULK_ENTITIES = new Set([
  "Provider", "ProviderLocation", "ProviderTaxonomy", "ProviderAffiliation",
  "ProviderLocationMatch", "ProviderDEASchedules", "ProviderMedicareCompare",
  "ProviderNPIValidation", "ProviderOwnership", "ProviderReconciliation",
  "ProviderServiceUtilization", "LeadScore", "CMSReferral", "CMSUtilization",
  "CMSServiceUtilization", "MedicareFacility", "MedicareMAInpatient",
  "MedicareHHAStats", "MedicareSNFStats", "CMSHHAStats", "CMSSNFStats",
  "NursingHomeChain", "NursingHomeDeficiency", "NursingHomeProvider",
  "HomeHealthCostReport", "HomeHealthEnrollment", "HomeHealthNationalMeasure",
  "HomeHealthPDGM", "HospiceEnrollment", "HospiceNationalMeasure",
  "HospiceProviderMeasure", "HospiceStateMeasure", "SNFProviderMeasure",
  "InpatientDRG", "MedicalEquipmentSupplier", "ImportBatch", "ImportMetrics",
  "AuditEvent", "ApiInteractionLog", "EnrichmentRecord", "BackgroundTask",
]);

/** Old Base44 campaign tables that migration 0034 dropped. */
export const DROPPED_ENTITIES = new Set(["CampaignSequenceStep", "CampaignTask"]);

const ACTIVITY_KINDS = new Set(["visit", "call", "note", "email", "meeting"]);
const FILE_URL = /https?:\/\/[^\s"'<>]+/gi;

export type PlanAction = "insert" | "unchanged" | "skip";

export type PlanRow = {
  entity: string;
  sourceId: string;
  table: string;
  action: PlanAction;
  reason?: string;
  warnings: string[];
  values: Record<string, unknown>;
  parent?: { entity: string; sourceId: string; column: string };
  userEmail?: string | null;
};

export type FilePlan = { url: string; fileName: string };

export type ImportPlan = {
  rows: PlanRow[];
  files: FilePlan[];
  unmapped: { entity: string; count: number }[];
  bulk: { entity: string; count: number }[];
  dropped: { entity: string; count: number }[];
  orgId: number | null;
};

type Row = Record<string, unknown>;

function isRow(value: unknown): value is Row {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function recordsOf(value: unknown): Row[] {
  if (Array.isArray(value)) return value.filter(isRow);
  if (!isRow(value)) return [];
  if (Array.isArray(value.items)) return value.items.filter(isRow);
  if (Array.isArray(value.records)) return value.records.filter(isRow);
  return [];
}

function collapse(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function camel(snake: string): string {
  return snake.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

function pick(row: Row, key: string): unknown {
  for (const name of [key, camel(key)]) {
    const value = row[name];
    if (value != null && value !== "") return value;
  }
  return undefined;
}

function clip(value: unknown, max: number): string | null {
  const text = collapse(value);
  return text ? text.slice(0, max) : null;
}

function sourceId(row: Row): string | null {
  const id = row.id ?? row._id;
  if (id == null || id === "") return null;
  const text = String(id);
  return text.length <= 80 ? text : null;
}

function calendarDay(value: unknown): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(collapse(value));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function jsonValue(value: unknown): unknown {
  if (value == null || value === "") return null;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function emailOf(row: Row, key = "email"): string | null {
  const email = normalizeEmail(pick(row, key));
  return email && isValidEmail(email) ? email : null;
}

export function fileUrlsIn(value: unknown, found = new Set<string>()): string[] {
  if (typeof value === "string") {
    for (const match of value.match(FILE_URL) ?? []) {
      const url = match.replace(/[),.;]+$/, "");
      if (/supabase\.co|base44\.app|base44-prod/i.test(url)) found.add(url);
    }
    return [...found];
  }
  if (Array.isArray(value)) {
    for (const item of value) fileUrlsIn(item, found);
    return [...found];
  }
  if (isRow(value)) {
    for (const item of Object.values(value)) fileUrlsIn(item, found);
  }
  return [...found];
}

function fileNameFor(url: string, used: Set<string>): string {
  let base = "file";
  try {
    base = decodeURIComponent(new URL(url).pathname.split("/").pop() || "file");
  } catch {
    base = "file";
  }
  base = base.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+/, "").slice(-120) || "file";
  let name = base;
  let n = 2;
  while (used.has(name)) {
    const dot = base.lastIndexOf(".");
    name = dot > 0 ? `${base.slice(0, dot)}-${n}${base.slice(dot)}` : `${base}-${n}`;
    n += 1;
  }
  used.add(name);
  return name;
}

function skip(entity: string, sourceIdValue: string, table: string, reason: string): PlanRow {
  return { entity, sourceId: sourceIdValue, table, action: "skip", reason, warnings: [], values: {} };
}

function htmlToText(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|li|h[1-6]|tr)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Destination messages store one plain-text body. Native exports split HTML and text. */
function messageBody(row: Row): string | null {
  const body = pick(row, "body");
  if (body != null && body !== "") return String(body);
  const text = pick(row, "body_text");
  if (text != null && text !== "") return String(text);
  const html = pick(row, "body_html");
  if (html != null && html !== "") return htmlToText(String(html));
  return null;
}

function timestampValue(value: unknown): string | null {
  const text = collapse(value);
  if (!text) return null;
  const parsed = Date.parse(text);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString();
}

function parentSource(parentEntity: string, row: Row): string {
  if (parentEntity === "CrmAccount") return collapse(pick(row, "account_id"));
  if (parentEntity === "LeadList") return collapse(pick(row, "list_id") || pick(row, "lead_list_id"));
  if (parentEntity === "CallSheet") return collapse(pick(row, "sheet_id"));
  return collapse(pick(row, "campaign_id"));
}

/** An explicit export directory wins over a live API key left in the shell. */
export function importSource(options: { exportDir?: string; token?: string }): "export-dir" | "api" | "none" {
  if (options.exportDir) return "export-dir";
  if (options.token) return "api";
  return "none";
}

export function planImport(bundle: Record<string, unknown>, options: { existingEmails?: Iterable<string>; orgId?: number | null } = {}): ImportPlan {
  const existing = new Set([...(options.existingEmails ?? [])].map((email) => email.toLowerCase()));
  const rows: PlanRow[] = [];
  const seenIds = new Map<string, Set<string>>();
  const accountKeys = new Set<string>();
  const userEmails = new Map<string, string>();

  const take = (entity: string): Row[] => recordsOf(bundle[entity]);

  const remember = (entity: string, id: string): boolean => {
    const set = seenIds.get(entity) ?? new Set<string>();
    seenIds.set(entity, set);
    if (set.has(id)) return false;
    set.add(id);
    return true;
  };

  for (const row of take("User")) {
    const id = sourceId(row);
    if (!id) {
      rows.push(skip("User", "", "users", "missing id"));
      continue;
    }
    if (!remember("User", id)) {
      rows.push(skip("User", id, "users", "duplicate source id"));
      continue;
    }
    const email = emailOf(row);
    if (!email) {
      rows.push(skip("User", id, "users", "missing or invalid email"));
      continue;
    }
    const warnings: string[] = [];
    if (pick(row, "password") || pick(row, "password_hash")) warnings.push("password was not copied");
    const role = pick(row, "role") === "admin" ? "admin" : "user";
    if (existing.has(email) || userEmails.has(email)) {
      rows.push({
        entity: "User", sourceId: id, table: "users", action: "unchanged",
        reason: "email already exists", warnings, values: { email },
      });
      userEmails.set(email, id);
      continue;
    }
    userEmails.set(email, id);
    rows.push({
      entity: "User",
      sourceId: id,
      table: "users",
      action: "insert",
      warnings,
      values: {
        email,
        full_name: clip(pick(row, "full_name"), 255),
        role,
        is_platform_admin: role === "admin",
        status: "invited",
      },
    });
  }

  const addAccount = (row: Row) => {
    const id = sourceId(row);
    if (!id) return rows.push(skip("CrmAccount", "", "crm_accounts", "missing id"));
    if (!remember("CrmAccount", id)) return rows.push(skip("CrmAccount", id, "crm_accounts", "duplicate source id"));
    const name = clip(pick(row, "name"), 500);
    if (!name) return rows.push(skip("CrmAccount", id, "crm_accounts", "missing name"));
    const warnings: string[] = [];
    const rawType = collapse(pick(row, "account_type"));
    const accountType = normalizeType(rawType) || (rawType ? "other" : "other");
    if (rawType && !normalizeType(rawType)) warnings.push(`account type "${rawType.slice(0, 40)}" stored as other`);
    const city = clip(pick(row, "city"), 100);
    const npiRaw = pick(row, "npi");
    const npi = npiRaw == null || npiRaw === "" ? null : normalizeNpi(npiRaw);
    if (npiRaw && !isValidNpi(npi)) warnings.push("invalid NPI dropped");
    const accountKey = clip(pick(row, "account_key"), 64)
      || (npi ? directoryAccountKey(npi) : stableAccountKey(accountType, name, city || ""));
    const key = `${accountType}|${accountKey}`;
    if (accountKeys.has(key)) return rows.push(skip("CrmAccount", id, "crm_accounts", "duplicate account key"));
    accountKeys.add(key);
    const stage = normalizeStage(pick(row, "stage")) || "prospect";
    if (pick(row, "stage") && !normalizeStage(pick(row, "stage"))) warnings.push("unrecognized stage stored as prospect");
    rows.push({
      entity: "CrmAccount",
      sourceId: id,
      table: "crm_accounts",
      action: "insert",
      warnings,
      userEmail: emailOf(row, "claimed_by_email") || emailOf(row, "owner_email"),
      values: {
        account_key: accountKey,
        account_type: accountType,
        name,
        city,
        phone: normalizePhone(pick(row, "phone")) || clip(pick(row, "phone"), 50),
        stage,
        source: clip(pick(row, "source"), 40) || "base44",
        tags: tagsToStorage(pick(row, "tags")),
        npi,
        domain: normalizeDomain(pick(row, "domain") || pick(row, "website")),
      },
    });
  };

  for (const row of take("CrmAccount")) addAccount(row);

  const child = (entity: string, table: string, parentEntity: string, row: Row, build: (id: string) => { values: Record<string, unknown>; warnings: string[] } | string) => {
    const id = sourceId(row);
    if (!id) return rows.push(skip(entity, "", table, "missing id"));
    if (!remember(entity, id)) return rows.push(skip(entity, id, table, "duplicate source id"));
    const parentId = parentSource(parentEntity, row);
    if (!parentId) return rows.push(skip(entity, id, table, "missing parent id"));
    const built = build(id);
    if (typeof built === "string") return rows.push(skip(entity, id, table, built));
    rows.push({
      entity, sourceId: id, table, action: "insert", warnings: built.warnings, values: built.values,
      parent: {
        entity: parentEntity,
        sourceId: parentId,
        column: parentEntity === "LeadList" ? "list_id" : parentEntity === "CallSheet" ? "sheet_id" : parentEntity === "OutreachCampaign" ? "campaign_id" : "account_id",
      },
      userEmail: emailOf(row, "user_email"),
    });
  };

  for (const row of take("CrmContact")) {
    child("CrmContact", "crm_contacts", "CrmAccount", row, () => {
      const name = clip(pick(row, "name"), 255);
      if (!name) return "missing name";
      const warnings: string[] = [];
      const email = emailOf(row);
      if (pick(row, "email") && !email) warnings.push("invalid email dropped");
      return {
        warnings,
        values: { role: normalizeRole(pick(row, "role")), name, phone: normalizePhone(pick(row, "phone")) || clip(pick(row, "phone"), 50), email },
      };
    });
  }

  for (const row of take("CrmActivity")) {
    child("CrmActivity", "crm_activities", "CrmAccount", row, () => {
      const kind = collapse(pick(row, "kind")).toLowerCase();
      const activityDate = calendarDay(pick(row, "activity_date"));
      if (!ACTIVITY_KINDS.has(kind)) return `unrecognized activity kind`;
      if (!activityDate) return "invalid activity date";
      return { warnings: [], values: { kind, activity_date: activityDate, done: pick(row, "done") !== false, note: clip(pick(row, "note"), 4000) } };
    });
  }

  for (const row of take("CrmReferral")) {
    child("CrmReferral", "crm_referrals", "CrmAccount", row, () => {
      const received = calendarDay(pick(row, "received_on"));
      if (!received) return "invalid received date";
      const warnings: string[] = [];
      if (pick(row, "patient_name") || pick(row, "patient")) warnings.push("patient name was not imported");
      const raw = collapse(pick(row, "outcome")).toLowerCase();
      const outcome = raw === "admitted" || raw === "won" ? "admitted" : raw === "lost" || raw === "closed" ? "lost" : raw === "open" || raw === "pending" || raw === "" ? "open" : "";
      if (!outcome) return "unrecognized outcome";
      const admitted = outcome === "admitted" ? calendarDay(pick(row, "admitted_on")) || received : null;
      return { warnings, values: { received_on: received, outcome, admitted_on: admitted, note: clip(pick(row, "note"), 4000) } };
    });
  }

  for (const row of take("LeadList")) addLeadList(row);

  for (const row of take("OutreachCampaign")) addCampaign("OutreachCampaign", row);
  for (const row of take("Campaign")) addCampaign("Campaign", row);

  function addLeadList(row: Row) {
    const id = sourceId(row);
    if (!id) return;
    const name = clip(pick(row, "name"), 255);
    if (!name) return rows.push(skip("LeadList", id, "lead_lists", "missing name"));
    const filters = jsonValue(pick(row, "filters") || pick(row, "filter_criteria"));
    rows.push({
      entity: "LeadList", sourceId: id, table: "lead_lists", action: "insert",
      warnings: pick(row, "filters") && filters == null ? ["filters were not valid JSON"] : [],
      values: { name, description: clip(pick(row, "description"), 8000), list_type: clip(pick(row, "list_type"), 50), filter_criteria: filters, member_count: Number(pick(row, "provider_count") || pick(row, "member_count")) || 0, created_by: clip(pick(row, "created_by"), 255) },
    });
  }

  function addCampaign(entity: string, row: Row) {
    const id = sourceId(row);
    if (!id) return rows.push(skip(entity, "", "outreach_campaigns", "missing id"));
    if (!remember(entity, id)) return rows.push(skip(entity, id, "outreach_campaigns", "duplicate source id"));
    const name = clip(pick(row, "name"), 255);
    if (!name) return rows.push(skip(entity, id, "outreach_campaigns", "missing name"));
    const status = clip(pick(row, "status"), 50) || "draft";
    const warnings = entity === "Campaign" ? ["imported from the legacy Campaign entity"] : [];
    const subject = clip(pick(row, "subject") || pick(row, "subject_template"), 4000);
    const bodyValue = pick(row, "body");
    const body = bodyValue != null && bodyValue !== "" ? String(bodyValue) : (pick(row, "body_template") == null ? null : String(pick(row, "body_template")));
    const listId = collapse(pick(row, "lead_list_id") || pick(row, "target_list_id") || pick(row, "list_id"));
    rows.push({
      entity, sourceId: id, table: "outreach_campaigns", action: "insert", warnings,
      values: {
        name, description: clip(pick(row, "description") || pick(row, "notes"), 8000), status,
        campaign_type: clip(pick(row, "campaign_type"), 50) || (listId ? "lead_list" : entity === "Campaign" ? "legacy" : null),
        subject, body,
        sender_email: emailOf(row, "sender_email"), sender_name: clip(pick(row, "sender_name"), 255),
        goal: clip(pick(row, "goal"), 100), created_by: clip(pick(row, "created_by"), 255),
      },
      ...(listId ? { parent: { entity: "LeadList", sourceId: listId, column: "target_list_id" } } : {}),
    });
  }

  for (const row of take("OutreachMessage")) {
    child("OutreachMessage", "outreach_messages", "OutreachCampaign", row, () => {
      const warnings: string[] = [];
      const sentAt = timestampValue(pick(row, "sent_at"));
      const openedAt = timestampValue(pick(row, "opened_at"));
      const clickedAt = timestampValue(pick(row, "clicked_at"));
      const bouncedAt = timestampValue(pick(row, "bounced_at"));
      const respondedAt = timestampValue(pick(row, "responded_at"));
      for (const [key, value] of [["sent_at", sentAt], ["opened_at", openedAt], ["clicked_at", clickedAt], ["bounced_at", bouncedAt], ["responded_at", respondedAt]] as const) {
        if (pick(row, key) && !value) warnings.push(`invalid ${key} dropped`);
      }
      return {
        warnings,
        values: {
          npi: clip(pick(row, "npi"), 20),
          recipient_email: emailOf(row, "recipient_email"),
          recipient_name: clip(pick(row, "recipient_name"), 255),
          subject: pick(row, "subject") == null ? null : String(pick(row, "subject")),
          body: messageBody(row),
          status: clip(pick(row, "status"), 50) || "pending",
          sent_at: sentAt,
          opened_at: openedAt,
          clicked_at: clickedAt,
          bounced_at: bouncedAt,
          responded_at: respondedAt,
        },
      };
    });
  }

  for (const row of take("CrmCampaignTouch")) {
    const id = sourceId(row);
    if (!id) {
      rows.push(skip("CrmCampaignTouch", "", "crm_campaign_touches", "missing id"));
      continue;
    }
    const accountId = collapse(pick(row, "account_id"));
    const campaignId = collapse(pick(row, "campaign_id"));
    const touched = calendarDay(pick(row, "touched_on") || pick(row, "created_date"));
    if (!accountId || !campaignId || !touched) {
      rows.push(skip("CrmCampaignTouch", id, "crm_campaign_touches", "missing account, campaign, or date"));
      continue;
    }
    rows.push({
      entity: "CrmCampaignTouch", sourceId: id, table: "crm_campaign_touches", action: "insert", warnings: [],
      values: { touched_on: touched, campaign_source_id: campaignId },
      parent: { entity: "CrmAccount", sourceId: accountId, column: "account_id" },
    });
  }

  for (const row of take("CampaignTemplate")) {
    const id = sourceId(row);
    if (!id) continue;
    const name = clip(pick(row, "name"), 255);
    if (!name) {
      rows.push(skip("CampaignTemplate", id, "campaign_templates", "missing name"));
      continue;
    }
    rows.push({
      entity: "CampaignTemplate", sourceId: id, table: "campaign_templates", action: "insert", warnings: [],
      values: {
        name, subject_template: pick(row, "subject_template") == null ? null : String(pick(row, "subject_template")),
        body_template: pick(row, "body_template") == null ? null : String(pick(row, "body_template")),
        category: clip(pick(row, "category"), 50),
      },
    });
  }

  for (const row of take("LeadListMember")) {
    child("LeadListMember", "lead_list_members", "LeadList", row, () => {
      const npi = clip(pick(row, "npi"), 20);
      if (!npi) return "missing NPI";
      return { warnings: [], values: { npi, status: clip(pick(row, "status"), 50) || "active", notes: clip(pick(row, "notes"), 4000), added_by: clip(pick(row, "added_by"), 255) } };
    });
  }

  for (const row of take("SavedFilter")) {
    const id = sourceId(row);
    if (!id) continue;
    const name = clip(pick(row, "name"), 255);
    if (!name) {
      rows.push(skip("SavedFilter", id, "saved_filters", "missing name"));
      continue;
    }
    rows.push({
      entity: "SavedFilter", sourceId: id, table: "saved_filters", action: "insert", warnings: [],
      userEmail: emailOf(row, "user_email") || emailOf(row, "created_by"),
      values: { name, page: clip(pick(row, "page"), 100), filters: jsonValue(pick(row, "filters")), is_default: pick(row, "is_default") === true },
    });
  }

  for (const row of take("CallSheet")) {
    const id = sourceId(row);
    if (!id) continue;
    const name = clip(pick(row, "name"), 255);
    if (!name) {
      rows.push(skip("CallSheet", id, "call_sheets", "missing name"));
      continue;
    }
    rows.push({
      entity: "CallSheet", sourceId: id, table: "call_sheets", action: "insert", warnings: [],
      values: {
        name, state: clip(pick(row, "state"), 2), county_fips: clip(pick(row, "county_fips"), 5),
        county_name: clip(pick(row, "county_name"), 200), account_count: Number(pick(row, "account_count")) || 0,
        created_by: clip(pick(row, "created_by"), 255),
      },
    });
  }

  for (const row of take("CallSheetAccount")) {
    child("CallSheetAccount", "call_sheet_accounts", "CallSheet", row, () => {
      const name = clip(pick(row, "name"), 500);
      const accountType = normalizeType(pick(row, "account_type")) || "other";
      const city = clip(pick(row, "city"), 100);
      const accountKey = clip(pick(row, "account_key"), 64) || stableAccountKey(accountType, name || "account", city || "");
      return {
        warnings: [],
        values: {
          account_kind: clip(pick(row, "account_kind"), 20) || "facility",
          account_key: accountKey, account_type: accountType, name, city,
          phone: normalizePhone(pick(row, "phone")) || clip(pick(row, "phone"), 50),
          detail: clip(pick(row, "detail"), 4000), status: clip(pick(row, "status"), 40) || "new",
          next_date: calendarDay(pick(row, "next_date")), notes: clip(pick(row, "notes"), 4000),
        },
      };
    });
  }

  const present = new Set(rows.filter((row) => row.action !== "skip").map((row) => `${row.entity}:${row.sourceId}`));
  for (const row of rows) {
    if (row.action === "skip" || !row.parent) continue;
    const parentKey = `${row.parent.entity}:${row.parent.sourceId}`;
    const campaignId = collapse(row.values.campaign_source_id);
    const campaignOk = !campaignId || present.has(`OutreachCampaign:${campaignId}`) || present.has(`Campaign:${campaignId}`);
    if (row.parent.column === "target_list_id" && !present.has(parentKey)) {
      row.warnings.push("lead list was not imported");
      delete row.parent;
      continue;
    }
    if (!present.has(parentKey) || !campaignOk) {
      row.action = "skip";
      row.reason = "parent was not imported";
      row.values = {};
    }
  }

  const imported = new Set<string>([...IMPORT_ENTITIES, "Files", "files"]);
  const bulk: ImportPlan["bulk"] = [];
  const dropped: ImportPlan["dropped"] = [];
  const unmapped: ImportPlan["unmapped"] = [];
  for (const [entity, value] of Object.entries(bundle)) {
    const listed = recordsOf(value).length;
    const count = listed || (isRow(value) && typeof value.__count === "number" ? value.__count : 0);
    if (!count || imported.has(entity)) continue;
    if (BULK_ENTITIES.has(entity)) bulk.push({ entity, count });
    else if (DROPPED_ENTITIES.has(entity)) dropped.push({ entity, count });
    else unmapped.push({ entity, count });
  }

  const usedNames = new Set<string>();
  const files: FilePlan[] = [];
  const urls = new Set<string>();
  for (const entity of IMPORT_ENTITIES) fileUrlsIn(bundle[entity], urls);
  fileUrlsIn(bundle.Files ?? bundle.files, urls);
  for (const url of urls) files.push({ url, fileName: fileNameFor(url, usedNames) });

  return {
    rows,
    files,
    unmapped,
    bulk,
    dropped,
    orgId: options.orgId ?? null,
  };
}

export function summarize(plan: ImportPlan) {
  const byEntity: Record<string, { insert: number; unchanged: number; skip: number; warnings: number }> = {};
  for (const row of plan.rows) {
    const bucket = byEntity[row.entity] ?? { insert: 0, unchanged: 0, skip: 0, warnings: 0 };
    bucket[row.action] += 1;
    bucket.warnings += row.warnings.length;
    byEntity[row.entity] = bucket;
  }
  return {
    byEntity,
    files: plan.files.length,
    bulk: plan.bulk,
    dropped: plan.dropped,
    unmapped: plan.unmapped,
    orgId: plan.orgId,
    skips: plan.rows.filter((row) => row.action === "skip").map((row) => ({ entity: row.entity, sourceId: row.sourceId, reason: row.reason })),
  };
}

export const ACCESS_NEEDED = [
  `Base44 API key for app ${BASE44_APP_ID} (BASE44_API_KEY).`,
  "Create it in the Base44 dashboard for that app: Settings → API keys (or an admin user's access token).",
  "A service-role token only exists inside Base44-hosted functions, so it cannot be used from this script.",
  "The app id in this repo is 6993c62145573ca8a97ad4a9. Set BASE44_APP_ID only if the live app id is different.",
  "If an API key cannot be created, export each entity as JSON from the Base44 dashboard into one directory and pass --export-dir.",
  "Name the files User.json, CrmAccount.json, CrmContact.json, CrmActivity.json, CrmReferral.json, LeadList.json, SavedFilter.json, OutreachCampaign.json, CallSheet.json, and the matching member/child files.",
  "The checked-in Base44 catalog has no CrmAccount entity. If the live app stored the marketing book under other names, include those files too (they are reported as unmapped until a mapping is added) or set BASE44_EXTRA_ENTITIES.",
  "Files: include files.json as an array of {url} for private objects the entity rows do not already link, or leave public supabase URLs in the rows.",
  "Apply needs DATABASE_URL for the Railway Postgres database and --org-id for the organization that should own the rows. This script refuses a non-local database unless BASE44_IMPORT_ALLOW_REMOTE=1.",
  "Do not set that variable until the dry-run counts have been reviewed. The script never sends email.",
].join(" ");
