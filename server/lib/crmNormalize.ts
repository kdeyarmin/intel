// Normalize marketing-book writes so phones, emails and names don't depend on
// which screen typed them. Invalid emails and NPIs are refused; a phone we
// can't recognize is kept (trimmed) rather than deleted.
import {
  isValidEmail,
  isValidNpi,
  normalizeDomain,
  normalizeEmail,
  normalizeNpi,
  normalizePhone,
  normalizeStage,
  tagsToStorage,
} from "../../src/lib/crmQuality.js";

export class CrmValidationError extends Error {
  status = 400;
  constructor(message: string) {
    super(message);
    this.name = "CrmValidationError";
  }
}

function collapse(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function phoneOrNull(value: unknown): string | null {
  return normalizePhone(value);
}

/** Calendar day stored as text (activity_date, received_on, admitted_on). */
function calendarDay(field: string, value: unknown, required: boolean): string | null {
  const day = collapse(value);
  if (!day) {
    if (required) throw new CrmValidationError(`${field} is required.`);
    return null;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) throw new CrmValidationError(`${field} must be a YYYY-MM-DD date.`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const date = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, date));
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== date) {
    throw new CrmValidationError(`${field} must be a YYYY-MM-DD date.`);
  }
  return day;
}

/** Mutates a CRM create/update payload. Unknown entities are left alone. */
export function normalizeCrmWrite(entityName: string, data: Record<string, any>): void {
  if (entityName === "CrmAccount") {
    if ("name" in data) {
      const name = collapse(data.name);
      if (!name) throw new CrmValidationError("Account name is required.");
      data.name = name;
    }
    if ("city" in data) data.city = collapse(data.city) || null;
    if ("phone" in data) data.phone = phoneOrNull(data.phone);
    if ("domain" in data) data.domain = normalizeDomain(data.domain);
    if ("tags" in data) data.tags = tagsToStorage(data.tags);
    if ("source" in data) data.source = collapse(data.source).slice(0, 40) || null;
    if ("stage" in data && data.stage != null && data.stage !== "") {
      const stage = normalizeStage(data.stage);
      if (!stage) throw new CrmValidationError(`Unknown stage "${data.stage}".`);
      data.stage = stage;
    }
    if ("npi" in data && data.npi != null && collapse(data.npi) !== "") {
      const npi = normalizeNpi(data.npi);
      if (!npi || !isValidNpi(npi)) throw new CrmValidationError(`NPI "${data.npi}" is not a valid 10-digit NPI.`);
      data.npi = npi;
    } else if ("npi" in data) data.npi = null;
  }
  if (entityName === "CrmContact") {
    if ("name" in data) {
      const name = collapse(data.name);
      if (!name) throw new CrmValidationError("Contact name is required.");
      data.name = name.slice(0, 255);
    }
    if ("phone" in data) data.phone = phoneOrNull(data.phone);
    if ("email" in data) {
      const email = normalizeEmail(data.email);
      if (email && !isValidEmail(email)) throw new CrmValidationError(`Contact email "${data.email}" is not valid.`);
      data.email = email;
    }
  }
  if (entityName === "CrmActivity") {
    if ("activity_date" in data) data.activity_date = calendarDay("activity_date", data.activity_date, true);
    if ("kind" in data) {
      const kind = collapse(data.kind);
      if (kind !== "visit" && kind !== "call" && kind !== "note") {
        throw new CrmValidationError(`Unknown activity "${data.kind}".`);
      }
      data.kind = kind;
    }
  }
  if (entityName === "CrmReferral") {
    if ("received_on" in data) data.received_on = calendarDay("received_on", data.received_on, true);
    if ("admitted_on" in data) data.admitted_on = calendarDay("admitted_on", data.admitted_on, false);
  }
  if (entityName === "CrmCampaignTouch") {
    if ("touched_on" in data) data.touched_on = calendarDay("touched_on", data.touched_on, true);
  }
}
