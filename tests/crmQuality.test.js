import { describe, expect, it } from 'vitest';
import { accountKey } from '../src/lib/marketingReport.js';
import {
  accountQuality,
  engagementScore,
  findDuplicateGroups,
  importTemplateCsv,
  isValidEmail,
  normalizeAccountName,
  normalizeEmail,
  normalizePhone,
  phoneDigits,
  planImport,
  planMerge,
  stableAccountKey,
  suggestMapping,
} from '../src/lib/crmQuality.js';

const NPI = '1526018159';

describe('crm data quality', () => {
  it('stores one phone format for the spellings a spreadsheet uses', () => {
    const forms = ['(814) 555-0100', '814.555.0100', '8145550100', '1-814-555-0100', '814 555 0100'];
    const normalized = forms.map(normalizePhone);
    expect(new Set(normalized)).toEqual(new Set(['(814) 555-0100']));
    expect(phoneDigits('814.555.0100')).toBe(phoneDigits('(814) 555-0100'));
  });

  it('keeps a short or international number instead of blanking it', () => {
    expect(normalizePhone('555-0100')).toBe('555-0100');
    expect(normalizePhone('+44 20 7946 0958')).toBe('+44 20 7946 0958');
    expect(normalizePhone('  ')).toBeNull();
  });

  it('lowercases emails and rejects a missing domain', () => {
    expect(normalizeEmail(' Pat@Hospital.Example ')).toBe('pat@hospital.example');
    expect(isValidEmail('pat@hospital.example')).toBe(true);
    expect(isValidEmail('')).toBe(true);
    expect(isValidEmail('pat@')).toBe(false);
  });

  it('treats legal suffixes and punctuation as the same company', () => {
    expect(normalizeAccountName("The Memorial Hospital, Inc.")).toBe(normalizeAccountName('memorial hospital'));
    expect(normalizeAccountName("St. Mary's Home Health LLC")).toBe(normalizeAccountName('St Marys Home Health'));
  });

  it('does not collapse two long account names that share a prefix', () => {
    const north = 'Memorial Hospital of the Greater Johnstown Region North Campus Building';
    const south = 'Memorial Hospital of the Greater Johnstown Region South Campus Building';
    const a = accountKey('hospital', north, 'Johnstown');
    const b = accountKey('hospital', south, 'Johnstown');
    expect(a).not.toBe(b);
    expect(a.length).toBeLessThanOrEqual(64);
    expect(b.length).toBeLessThanOrEqual(64);
    expect(stableAccountKey('snf', 'Quiet Manor', 'Windber')).toBe('manual:snf|quiet manor|windber');
  });

  it('groups the same facility under two names, and the same NPI', () => {
    const groups = findDuplicateGroups([
      { id: 1, name: 'Acme Home Health, LLC', account_type: 'hha', city: 'Erie', npi: null },
      { id: 2, name: 'Acme Home Health', account_type: 'hha', city: 'Erie', npi: NPI },
      { id: 3, name: 'Other Clinic', account_type: 'clinician', city: 'Erie', npi: NPI },
      { id: 4, name: 'Quiet Manor', account_type: 'snf', city: 'Windber', npi: null },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].map((a) => a.id).sort()).toEqual([1, 2, 3]);
  });

  it('flags a stale account and withholds an engagement score until someone logs work', () => {
    const account = { phone: '' };
    const flags = accountQuality({ account, contacts: [], activities: [], now: new Date('2026-10-16T12:00:00') });
    expect(flags.map((f) => f.id)).toEqual(['no_phone', 'no_contact', 'stale']);
    expect(engagementScore({ activities: [], referrals: [], now: new Date('2026-10-16T12:00:00') })).toEqual({ score: null, label: 'No activity' });
    const active = engagementScore({
      activities: [{ kind: 'visit', done: true, activity_date: '2026-10-10' }],
      referrals: [{ outcome: 'admitted', received_on: '2026-10-01', admitted_on: '2026-10-02' }],
      contacts: [{ email: 'a@b.co' }],
      now: new Date('2026-10-16T12:00:00'),
    });
    expect(active.score).toBeGreaterThanOrEqual(70);
    expect(active.label).toBe('Healthy');
  });

  it('previews an import: maps columns, rejects bad rows, and updates a duplicate instead of creating one', () => {
    const csv = [
      'Facility,Kind,Town,Tel,Person,Email,NPI',
      'Acme Home Health LLC,home health,Erie,(814) 555-0199,Pat Lee,PAT@ACME.EXAMPLE,',
      ',hospital,Erie,555,Sam,sam@acme.example,',
      'New Hospice,hospice,Erie,8145550101,Jo,not-an-email,1234567890',
      `Directory Doc,physician,Erie,814-555-0102,Ann,ann@example.com,${NPI}`,
    ].join('\n');
    const headers = csv.split('\n')[0].split(',');
    const mapping = suggestMapping(headers);
    expect(mapping).toMatchObject({ name: 0, account_type: 1, city: 2, phone: 3, contact_name: 4, email: 5, npi: 6 });
    const plan = planImport(csv, mapping, {
      accounts: [{ id: 9, name: 'Acme Home Health', account_type: 'hha', city: 'Erie', phone: null }],
      contacts: [],
    });
    expect(plan.errors).toBe(2);
    expect(plan.creates).toBe(1);
    expect(plan.updates).toBe(1);
    expect(plan.preview[0]).toMatchObject({ status: 'update', accountId: 9, addContact: true });
    expect(plan.preview[0].patch.phone).toBe('(814) 555-0199');
    expect(plan.preview[1].status).toBe('error');
    expect(plan.preview[2].messages.join(' ')).toMatch(/email/i);
    expect(plan.preview[2].messages.join(' ')).toMatch(/NPI/i);
    expect(plan.preview[3]).toMatchObject({ status: 'create', record: { npi: NPI, account_type: 'clinician', phone: '(814) 555-0102' } });
    expect(importTemplateCsv()).toMatch(/Account name,Type,City/);
  });

  it('plans a merge that moves the history and fills only blank fields', () => {
    const plan = planMerge(
      { id: 1, name: 'Acme', phone: '(814) 555-0100', city: 'Erie', tags: 'ortho', npi: null },
      { id: 2, name: 'Acme LLC', phone: '(814) 555-0199', city: '', tags: 'priority', npi: NPI, domain: 'https://www.acme.example/about' },
      {
        contacts: [{ id: 5, account_id: 2 }, { id: 6, account_id: 1 }],
        activities: [{ id: 7, account_id: 2 }],
        referrals: [{ id: 8, account_id: 2 }],
      },
    );
    expect(plan.move).toEqual({ contacts: [5], activities: [7], referrals: [8] });
    expect(plan.fill.phone).toBeUndefined();
    expect(plan.fill.npi).toBe(NPI);
    expect(plan.fill.domain).toBe('acme.example');
    expect(plan.fill.tags).toBe('ortho, priority');
  });
});
