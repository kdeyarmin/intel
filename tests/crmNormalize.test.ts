import { describe, expect, it } from 'vitest';
import { CrmValidationError, normalizeCrmWrite } from '../server/lib/crmNormalize';

describe('CRM write normalization', () => {
  it('canonicalizes an account and refuses a bad NPI or stage', () => {
    const data: Record<string, unknown> = {
      name: '  Acme   Home Health  ',
      city: ' Erie ',
      phone: '814.555.0100',
      domain: 'https://www.acme.example/path',
      tags: 'Ortho, ortho; Priority',
      stage: 'In Progress',
      npi: '1526018159',
      source: ' open house ',
    };
    normalizeCrmWrite('CrmAccount', data);
    expect(data).toMatchObject({
      name: 'Acme Home Health',
      city: 'Erie',
      phone: '(814) 555-0100',
      domain: 'acme.example',
      tags: 'ortho, priority',
      stage: 'working',
      npi: '1526018159',
      source: 'open house',
    });

    expect(() => normalizeCrmWrite('CrmAccount', { npi: '1234567890' })).toThrow(CrmValidationError);
    expect(() => normalizeCrmWrite('CrmAccount', { stage: 'frozen' })).toThrow(/stage/i);
    expect(() => normalizeCrmWrite('CrmAccount', { name: '   ' })).toThrow(/name/i);
  });

  it('lowercases a contact email and refuses one without a domain', () => {
    const data: Record<string, unknown> = { name: ' Pat Lee ', email: 'Pat@Hospital.Example', phone: '8145550101' };
    normalizeCrmWrite('CrmContact', data);
    expect(data).toMatchObject({ name: 'Pat Lee', email: 'pat@hospital.example', phone: '(814) 555-0101' });
    expect(() => normalizeCrmWrite('CrmContact', { email: 'pat@' })).toThrow(/email/i);
  });

  it('accepts a calendar day and refuses a glued or impossible date', () => {
    const activity: Record<string, unknown> = { activity_date: '2026-10-23', kind: 'visit' };
    normalizeCrmWrite('CrmActivity', activity);
    expect(activity).toMatchObject({ activity_date: '2026-10-23', kind: 'visit' });
    expect(() => normalizeCrmWrite('CrmActivity', { activity_date: '232026-10-16' })).toThrow(/YYYY-MM-DD/);
    expect(() => normalizeCrmWrite('CrmActivity', { activity_date: '2026-02-31' })).toThrow(/YYYY-MM-DD/);
    expect(() => normalizeCrmWrite('CrmActivity', { kind: 'email' })).toThrow(/activity/i);

    const referral: Record<string, unknown> = { received_on: '2026-10-16', admitted_on: '' };
    normalizeCrmWrite('CrmReferral', referral);
    expect(referral).toMatchObject({ received_on: '2026-10-16', admitted_on: null });
  });

  it('leaves unrelated entities alone', () => {
    const data = { phone: '8145550100' };
    normalizeCrmWrite('LeadList', data);
    expect(data.phone).toBe('8145550100');
  });
});
