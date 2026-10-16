// Data-quality rules for the marketing book. Pure: the page, the import
// preview and the API all use the same phone, email, name and dedupe rules.
// Engagement is computed only from activity the team logged. An account with
// no calls and no referrals is "No activity", never a made-up score of 0.

export const ACCOUNT_STAGES = [
  { id: 'prospect', label: 'Prospect' },
  { id: 'working', label: 'Working' },
  { id: 'customer', label: 'Customer' },
  { id: 'inactive', label: 'Inactive' },
];

const STAGE_IDS = new Set(ACCOUNT_STAGES.map((s) => s.id));

const TYPE_ALIASES = {
  hospital: 'hospital',
  hospitals: 'hospital',
  snf: 'snf',
  'nursing home': 'snf',
  'nursing homes': 'snf',
  'skilled nursing': 'snf',
  licensed: 'licensed',
  'personal care': 'licensed',
  'personal care home': 'licensed',
  'assisted living': 'licensed',
  hha: 'hha',
  'home health': 'hha',
  hospice: 'hospice',
  clinician: 'clinician',
  physician: 'clinician',
  doctor: 'clinician',
  provider: 'clinician',
  other: 'other',
};

const ROLE_ALIASES = {
  administrator: 'administrator',
  admin: 'administrator',
  don: 'don',
  'director of nursing': 'don',
  'business office': 'business_office',
  business_office: 'business_office',
  'social services': 'social_services',
  social_services: 'social_services',
  admissions: 'admissions',
  'discharge planner': 'discharge_planner',
  discharge_planner: 'discharge_planner',
  other: 'other',
};

const LEGAL_TOKENS = new Set([
  'inc', 'llc', 'l.l.c', 'llp', 'incorporated', 'corp', 'corporation', 'co', 'company',
  'ltd', 'limited', 'pllc', 'pc', 'p.c', 'pa', 'dba', 'the',
]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const CRM_IMPORT_FIELDS = [
  { id: 'name', label: 'Account name', required: true, aliases: ['name', 'account', 'account name', 'facility', 'organization', 'company'] },
  { id: 'account_type', label: 'Type', aliases: ['type', 'account type', 'facility type', 'kind'] },
  { id: 'city', label: 'City', aliases: ['city', 'town'] },
  { id: 'phone', label: 'Phone', aliases: ['phone', 'telephone', 'tel', 'account phone'] },
  { id: 'contact_name', label: 'Contact name', aliases: ['contact', 'contact name', 'person', 'contact person'] },
  { id: 'contact_role', label: 'Contact role', aliases: ['role', 'contact role', 'title'] },
  { id: 'email', label: 'Contact email', aliases: ['email', 'contact email', 'e-mail', 'e mail'] },
  { id: 'stage', label: 'Stage', aliases: ['stage', 'status', 'pipeline'] },
  { id: 'tags', label: 'Tags', aliases: ['tags', 'tag', 'labels'] },
  { id: 'npi', label: 'NPI', aliases: ['npi', 'npi number'] },
  { id: 'domain', label: 'Website', aliases: ['website', 'domain', 'url', 'web'] },
  { id: 'source', label: 'Source', aliases: ['source', 'lead source', 'campaign'] },
];

function collapse(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/** US numbers become (555) 555-0100. Anything else is trimmed, not discarded. */
export function normalizePhone(value) {
  if (value == null) return null;
  const raw = collapse(value);
  if (!raw) return null;
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  return raw;
}

export function phoneDigits(value) {
  const n = normalizePhone(value);
  return n ? n.replace(/\D/g, '') : '';
}

export function normalizeEmail(value) {
  if (value == null) return null;
  const s = collapse(value).toLowerCase();
  return s || null;
}

export function isValidEmail(value) {
  const s = normalizeEmail(value);
  if (!s) return true;
  return s.length <= 255 && EMAIL_RE.test(s);
}

export function normalizeDomain(value) {
  if (value == null) return null;
  let s = collapse(value).toLowerCase();
  if (!s) return null;
  s = s.replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0].replace(/\.$/, '');
  if (!s || !s.includes('.') || /\s/.test(s)) return null;
  return s.slice(0, 255);
}

/** Comparison form of a company name: case, punctuation and legal suffixes ignored. */
export function normalizeAccountName(value) {
  const lowered = collapse(value).toLowerCase().replace(/['’]/g, '');
  const tokens = lowered
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((t) => t && !LEGAL_TOKENS.has(t));
  return tokens.join(' ');
}

export function normalizeStage(value) {
  if (value == null || collapse(value) === '') return null;
  const s = collapse(value).toLowerCase().replace(/[\s-]+/g, '_');
  if (STAGE_IDS.has(s)) return s;
  if (s === 'active' || s === 'in_progress') return 'working';
  if (s === 'closed' || s === 'lost' || s === 'do_not_contact') return 'inactive';
  if (s === 'new' || s === 'lead') return 'prospect';
  if (s === 'won' || s === 'admitted' || s === 'client') return 'customer';
  return null;
}

export function normalizeType(value) {
  const s = collapse(value).toLowerCase();
  if (!s) return null;
  return TYPE_ALIASES[s] || null;
}

export function normalizeRole(value) {
  const s = collapse(value).toLowerCase();
  if (!s) return 'other';
  return ROLE_ALIASES[s] || 'other';
}

export function normalizeTags(value) {
  const parts = Array.isArray(value) ? value : String(value ?? '').split(/[,;]/);
  const seen = new Set();
  const out = [];
  for (const part of parts) {
    const t = collapse(part).toLowerCase().slice(0, 40);
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

export function tagsToStorage(value) {
  const tags = normalizeTags(value);
  return tags.length ? tags.join(', ') : null;
}

export function parseTags(value) {
  return normalizeTags(value);
}

/** NPI check digit (Luhn over CMS prefix 80840). */
export function isValidNpi(npi) {
  const s = String(npi ?? '').trim();
  if (!/^[12]\d{9}$/.test(s)) return false;
  const digits = `80840${s}`;
  let sum = 0;
  for (let i = 0; i < digits.length; i += 1) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

export function normalizeNpi(value) {
  if (value == null || collapse(value) === '') return null;
  const digits = String(value).replace(/\D/g, '');
  return isValidNpi(digits) ? digits : null;
}

function fnv(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Storage key. Short names stay readable. A name that would not fit in
 * varchar(64) keeps a hash of the full slug, so two long names that share
 * a prefix no longer collapse into one account.
 */
export function stableAccountKey(type, name, city) {
  const slug = `${type}|${collapse(name)}|${collapse(city)}`.toLowerCase().replace(/[^a-z0-9|]+/g, ' ').replace(/\s+/g, ' ').trim();
  const full = `manual:${slug}`;
  if (full.length <= 64) return full;
  return `manual:${slug.slice(0, 48)}:${fnv(slug)}`;
}

/** Directory accounts are keyed by NPI so the same provider is not added twice. */
export function directoryAccountKey(npi) {
  return `npi:${npi}`;
}

export function identityKey(type, name, city) {
  return `${type || ''}|${normalizeAccountName(name)}|${normalizeAccountName(city)}`;
}

function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysBefore(n, now) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - n);
  return isoDate(d);
}

export function accountQuality({ account, contacts = [], activities = [], now = new Date() }) {
  const flags = [];
  if (!normalizePhone(account?.phone)) flags.push({ id: 'no_phone', label: 'No phone' });
  if (contacts.length === 0) flags.push({ id: 'no_contact', label: 'No contact' });
  const emails = contacts.map((c) => c.email).filter(Boolean);
  if (contacts.length > 0 && emails.length === 0) flags.push({ id: 'no_email', label: 'No email' });
  if (emails.some((e) => !isValidEmail(e))) flags.push({ id: 'bad_email', label: 'Invalid email' });
  const cutoff = daysBefore(90, now);
  const lastCall = activities
    .filter((a) => (a.kind === 'visit' || a.kind === 'call') && a.done && typeof a.activity_date === 'string')
    .map((a) => a.activity_date)
    .sort()
    .at(-1);
  if (!lastCall || lastCall < cutoff) flags.push({ id: 'stale', label: 'No call in 90 days' });
  return flags;
}

/**
 * Engagement from logged work only. Null when the team has not logged a call
 * or a referral, so an empty account is not scored 0.
 */
export function engagementScore({ activities = [], referrals = [], contacts = [], now = new Date() }) {
  const calls = activities.filter((a) => (a.kind === 'visit' || a.kind === 'call') && a.done && typeof a.activity_date === 'string');
  const hasSignal = calls.length > 0 || referrals.length > 0;
  if (!hasSignal) return { score: null, label: 'No activity' };
  const last = calls.map((a) => a.activity_date).sort().at(-1) || '';
  let score = 0;
  if (last >= daysBefore(14, now)) score += 40;
  else if (last >= daysBefore(30, now)) score += 30;
  else if (last >= daysBefore(60, now)) score += 20;
  else if (last >= daysBefore(90, now)) score += 10;
  const recentRefs = referrals.filter((r) => typeof r.received_on === 'string' && r.received_on >= daysBefore(90, now));
  score += Math.min(30, recentRefs.length * 10);
  if (referrals.some((r) => r.outcome === 'open')) score += 10;
  if (referrals.some((r) => r.outcome === 'admitted' && (r.admitted_on || r.received_on) >= daysBefore(180, now))) score += 20;
  if (contacts.some((c) => c.email && isValidEmail(c.email))) score += 10;
  score = Math.min(100, score);
  const label = score >= 70 ? 'Healthy' : score >= 40 ? 'Warm' : 'Cold';
  return { score, label };
}

export function findDuplicateGroups(accounts) {
  const parent = accounts.map((_, i) => i);
  const find = (i) => {
    let p = i;
    while (parent[p] !== p) p = parent[p];
    let c = i;
    while (parent[c] !== p) { const n = parent[c]; parent[c] = p; c = n; }
    return p;
  };
  const union = (a, b) => {
    const pa = find(a);
    const pb = find(b);
    if (pa !== pb) parent[pa] = pb;
  };
  const byName = new Map();
  const byNpi = new Map();
  accounts.forEach((account, i) => {
    const name = identityKey(account.account_type, account.name, account.city);
    if (byName.has(name)) union(i, byName.get(name));
    else byName.set(name, i);
    if (account.npi) {
      const npi = String(account.npi);
      if (byNpi.has(npi)) union(i, byNpi.get(npi));
      else byNpi.set(npi, i);
    }
  });
  const groups = new Map();
  accounts.forEach((account, i) => {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(account);
  });
  return [...groups.values()]
    .filter((g) => g.length > 1)
    .sort((a, b) => String(a[0].name).localeCompare(String(b[0].name)));
}

function sameId(a, b) {
  return a != null && b != null && Number(a) === Number(b);
}

export function planMerge(survivor, duplicate, { contacts = [], activities = [], referrals = [] } = {}) {
  const onDup = (rows) => rows.filter((r) => sameId(r.account_id, duplicate.id)).map((r) => r.id);
  const fill = {};
  if (!normalizePhone(survivor.phone) && normalizePhone(duplicate.phone)) fill.phone = normalizePhone(duplicate.phone);
  if (!collapse(survivor.city) && collapse(duplicate.city)) fill.city = collapse(duplicate.city);
  if (!survivor.domain && duplicate.domain) fill.domain = normalizeDomain(duplicate.domain);
  if (!survivor.npi && duplicate.npi) fill.npi = duplicate.npi;
  const tags = normalizeTags([...(parseTags(survivor.tags)), ...parseTags(duplicate.tags)]);
  if (tags.join(', ') !== parseTags(survivor.tags).join(', ')) fill.tags = tags.join(', ');
  if (!survivor.source && duplicate.source) fill.source = duplicate.source;
  return {
    survivorId: survivor.id,
    duplicateId: duplicate.id,
    move: { contacts: onDup(contacts), activities: onDup(activities), referrals: onDup(referrals) },
    fill,
  };
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  const src = String(text ?? '').replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i += 1; }
        else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (ch !== '\r') cell += ch;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => collapse(c) !== ''));
}

function headerKey(header) {
  return collapse(header).toLowerCase();
}

export function suggestMapping(headers) {
  const mapping = {};
  const used = new Set();
  headers.forEach((header, index) => {
    const key = headerKey(header);
    const field = CRM_IMPORT_FIELDS.find((f) => !used.has(f.id) && (f.id === key || f.aliases.includes(key)));
    if (field) {
      mapping[field.id] = index;
      used.add(field.id);
    }
  });
  return mapping;
}

export function importTemplateCsv() {
  const headers = ['Account name', 'Type', 'City', 'Phone', 'Contact name', 'Contact role', 'Contact email', 'Stage', 'Tags', 'NPI', 'Website', 'Source'];
  const sample = ['Memorial Hospital', 'hospital', 'Johnstown', '(814) 555-0100', 'Pat Lee', 'discharge planner', 'pat@example.com', 'working', 'ortho, priority', '', 'memorial.example', 'open house'];
  return `${headers.join(',')}\n${sample.join(',')}\n`;
}

function matchAccount(row, accounts) {
  if (row.npi) {
    const byNpi = accounts.find((a) => a.npi === row.npi);
    if (byNpi) return byNpi;
  }
  const key = identityKey(row.account_type, row.name, row.city);
  return accounts.find((a) => identityKey(a.account_type, a.name, a.city) === key) || null;
}

/**
 * Turn a mapped CSV into a preview. Nothing is written. Rows that match an
 * account already on the book update the blank fields and add a new contact
 * instead of creating a second account.
 */
export function planImport(text, mapping, { accounts = [], contacts = [] } = {}) {
  const table = parseCsv(text);
  if (table.length === 0) return { headers: [], preview: [], creates: 0, updates: 0, contacts: 0, errors: 0 };
  const headers = table[0].map((h) => collapse(h));
  const preview = [];
  const pending = [];
  for (let i = 1; i < table.length; i += 1) {
    const cells = table[i];
    const get = (field) => {
      const idx = mapping[field];
      return idx == null ? '' : collapse(cells[idx] ?? '');
    };
    const messages = [];
    const name = collapse(get('name'));
    if (!name) messages.push('Account name is required.');
    const typeRaw = get('account_type');
    const accountType = normalizeType(typeRaw || 'other');
    if (typeRaw && !accountType) messages.push(`Unknown type "${typeRaw}".`);
    const emailRaw = get('email');
    const email = normalizeEmail(emailRaw);
    if (emailRaw && !isValidEmail(emailRaw)) messages.push(`Invalid email "${emailRaw}".`);
    const npiRaw = get('npi');
    const npi = npiRaw ? normalizeNpi(npiRaw) : null;
    if (npiRaw && !npi) messages.push(`NPI "${npiRaw}" is not a valid 10-digit NPI.`);
    const stageRaw = get('stage');
    const stage = stageRaw ? normalizeStage(stageRaw) : null;
    if (stageRaw && !stage) messages.push(`Unknown stage "${stageRaw}".`);
    const record = {
      name,
      account_type: accountType || 'other',
      city: collapse(get('city')) || null,
      phone: normalizePhone(get('phone')),
      stage: stage || 'prospect',
      tags: tagsToStorage(get('tags')),
      npi,
      domain: normalizeDomain(get('domain')),
      source: collapse(get('source')) || 'import',
      contact_name: collapse(get('contact_name')),
      contact_role: normalizeRole(get('contact_role')),
      email,
    };
    const line = i + 1;
    if (messages.length) {
      preview.push({ line, status: 'error', messages, record });
      continue;
    }
    const onBook = matchAccount(record, accounts);
    const earlier = matchAccount(record, pending.map((p) => p.record));
    const existing = onBook || earlier;
    if (existing) {
      const patch = {};
      if (!normalizePhone(existing.phone) && record.phone) patch.phone = record.phone;
      if (!existing.city && record.city) patch.city = record.city;
      if (!existing.domain && record.domain) patch.domain = record.domain;
      if (!existing.npi && record.npi) patch.npi = record.npi;
      if (!existing.tags && record.tags) patch.tags = record.tags;
      const contactList = onBook ? contacts.filter((c) => sameId(c.account_id, existing.id)) : [];
      const emailTaken = record.email && contactList.some((c) => normalizeEmail(c.email) === record.email);
      const addContact = Boolean(record.contact_name) && !emailTaken;
      preview.push({
        line,
        status: 'update',
        messages: [addContact ? `Already on the book as ${existing.name}. The contact will be added.` : `Already on the book as ${existing.name}.`],
        record,
        accountId: onBook ? existing.id : null,
        followsLine: earlier ? earlier.line : null,
        patch,
        addContact,
      });
    } else {
      pending.push({ record: { ...record, line } });
      preview.push({ line, status: 'create', messages: [], record, addContact: Boolean(record.contact_name) });
    }
  }
  return {
    headers,
    preview,
    creates: preview.filter((p) => p.status === 'create').length,
    updates: preview.filter((p) => p.status === 'update').length,
    contacts: preview.filter((p) => p.addContact).length,
    errors: preview.filter((p) => p.status === 'error').length,
  };
}
