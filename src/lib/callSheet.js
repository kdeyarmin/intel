import { base44 } from '@/api/base44Client';

/** Kinds a call sheet can pull for one county. `id` matches getMarketRoster. */
export const ROSTER_KINDS = [
  { id: 'hospital', label: 'Hospitals' },
  { id: 'hha', label: 'Home health' },
  { id: 'hospice', label: 'Hospice' },
  { id: 'snf', label: 'Nursing homes' },
  { id: 'irf', label: 'Inpatient rehab' },
  { id: 'ltch', label: 'Long-term care hospitals' },
  { id: 'clinician', label: 'Clinicians' },
  { id: 'dme', label: 'DME suppliers' },
  { id: 'licensed', label: 'Licensed homes' },
];

export const KIND_LABEL = Object.fromEntries(ROSTER_KINDS.map((k) => [k.id, k.label]));

/** Status on a saved account. Account is the chart of accounts; Call and Visit are the schedule. */
export const SHEET_STATUSES = [
  { id: 'new', label: 'Not scheduled' },
  { id: 'call', label: 'Call' },
  { id: 'visit', label: 'Visit' },
  { id: 'account', label: 'Account' },
];

export const STATUS_LABEL = Object.fromEntries(SHEET_STATUSES.map((s) => [s.id, s.label]));

const PAGE = 1000;

export async function listSheetAccounts(sheetId) {
  const rows = [];
  let lastId = 0;
  for (;;) {
    const page = await base44.entities.CallSheetAccount.filter(
      { sheet_id: Number(sheetId), id: { $gt: lastId } }, 'id', PAGE,
    );
    rows.push(...page);
    if (page.length < PAGE) return rows;
    lastId = page[page.length - 1].id;
  }
}

/** Rows not already on the sheet. Existing notes are left alone. */
export function newAccounts(existing, rows) {
  const have = new Set((existing || []).map((a) => `${a.account_type}:${a.account_key}`));
  const seen = new Set();
  const out = [];
  for (const row of rows || []) {
    if (!row?.account_key) continue;
    const id = `${row.account_type}:${row.account_key}`;
    if (have.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(row);
  }
  return out;
}

export function filterAccounts(rows, view) {
  const list = rows || [];
  if (view === 'schedule') return list.filter((r) => r.status === 'call' || r.status === 'visit' || r.next_date);
  if (view === 'accounts') return list.filter((r) => r.status === 'account');
  return list;
}

export function sortAccounts(rows, view) {
  const copy = [...(rows || [])];
  if (view === 'schedule') {
    return copy.sort((a, b) => String(a.next_date || '9999-99-99').localeCompare(String(b.next_date || '9999-99-99')) || String(a.name || '').localeCompare(String(b.name || '')));
  }
  return copy.sort((a, b) => String(a.account_type || '').localeCompare(String(b.account_type || '')) || String(a.name || '').localeCompare(String(b.name || '')));
}
