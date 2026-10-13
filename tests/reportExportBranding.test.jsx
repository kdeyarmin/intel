// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const state = vi.hoisted(() => ({ doc: null }));
vi.mock('@/api/base44Client', () => ({ base44: {} }));
vi.mock('jspdf', async (original) => {
  const { jsPDF } = await original();
  return {
    jsPDF: function (options) {
      state.doc = new jsPDF(options);
      state.doc.save = vi.fn();
      state.doc.getImageProperties = vi.fn(() => ({ width: 400, height: 100 }));
      state.doc.addImage = vi.fn();
      return state.doc;
    },
  };
});

import { exportAttribution, exportPDF } from '../src/components/exports/exportUtils';
import ComplianceDisclaimer from '../src/components/compliance/ComplianceDisclaimer';
import BulkEmailActions from '../src/components/emailBot/BulkEmailActions';
import { CAREMETRIC_NAME } from '../src/lib/branding';
import {
  approvedEmail, duplicateSubscriptionEmail, inviteEmail, resetEmail, signupPendingEmail,
} from '../server/lib/accountEmails';
import { appendComplianceFooter } from '../server/functions/outreachHelpers';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('professional report and communication branding', () => {
  it('brands every export PDF page and preserves the company wordmark aspect ratio', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ blob: async () => new Blob(['logo'], { type: 'image/png' }) })));
    const rows = Array.from({ length: 100 }, (_, i) => ({ name: `Provider ${i}` }));
    await exportPDF(rows, [{ key: 'name', label: 'Provider' }], 'provider-export', 'Provider Directory');
    const pages = state.doc.getNumberOfPages();
    expect(pages).toBeGreaterThan(1);
    expect(state.doc.addImage).toHaveBeenCalledTimes(pages);
    expect(state.doc.addImage).toHaveBeenCalledWith(expect.any(String), 'PNG', 14, 9, 40, 10);
    for (let page = 1; page <= pages; page++) {
      const content = state.doc.internal.pages[page].join('\n');
      expect(content).toContain(CAREMETRIC_NAME);
      expect(content).toContain('Healthcare Provider Intelligence');
      expect(content).toContain('not CMS publications');
      expect(content).toContain('Confidential');
      expect(content).not.toContain('CareMetric AI');
    }
    expect(state.doc.save).toHaveBeenCalledWith('provider-export.pdf');
  });

  it('keeps the export source, Medicare coverage, suppression and date limitations', () => {
    expect(exportAttribution(new Date('2026-10-13T00:00:00Z'))).toBe(
      'Source: CareMetric Healthcare Advisors analytics derived from public CMS, NPPES and U.S. Census data, not CMS publications. Medicare figures are fee-for-service unless noted; counts under 11 are suppressed. Exported 2026-10-13.',
    );
  });

  it('includes the branded source line in provider email exports without changing the data columns', async () => {
    let blob;
    vi.stubGlobal('URL', class extends URL {
      static createObjectURL(file) { blob = file; return 'blob:test'; }
      static revokeObjectURL() {}
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<BulkEmailActions providers={[{
      id: 1, npi: '1234567893', entity_type: 'Individual', first_name: 'Ada', last_name: 'Lovelace',
      email: 'ada@example.org', email_validation_status: 'valid',
    }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Export All (1)' }));
    const csv = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(blob);
    });
    expect(csv).toContain('NPI,Name,Email,Validation Status,Confidence,Source,Reason');
    expect(csv).toContain('"1234567893","Ada Lovelace","ada@example.org","valid"');
    expect(csv.endsWith(`"${exportAttribution()}"`)).toBe(true);
  });

  it('brands market disclosures without losing their proxy and referral limitations', () => {
    render(<ComplianceDisclaimer variant="market" />);
    const disclosure = screen.getByRole('note').textContent;
    for (const text of [CAREMETRIC_NAME, 'not CMS publications', 'CMS suppresses counts under 11', 'no patient-level data', 'not confirmed referrals', 'not a count of transfers']) {
      expect(disclosure).toContain(text);
    }
  });

  it('brands all account emails while preserving reset and invitation links', () => {
    const base = 'https://app.example.org';
    const emails = [
      signupPendingEmail('admin@example.org', { email: 'user@example.org', full_name: 'User' }, base),
      approvedEmail('user@example.org', base),
      resetEmail('user@example.org', `${base}/reset-password?token=test`),
      inviteEmail('user@example.org', `${base}/accept-invite?token=test`, 'Owner'),
      duplicateSubscriptionEmail('admin@example.org', { id: 1, name: 'Example' }, { kept: 'sub_new', previous: 'sub_old' }),
    ];
    for (const email of emails) {
      expect(email.subject).toContain(CAREMETRIC_NAME);
      expect(email.subject).not.toContain('CareMetric AI');
    }
    expect(emails[2].text).toContain(`${base}/reset-password?token=test`);
    expect(emails[3].text).toContain(`${base}/accept-invite?token=test`);
  });

  it('uses the company as the default outreach identity without replacing customer senders', () => {
    const opts = { physicalAddress: '1 Main St', unsubscribeUrl: 'https://app.example.org/unsubscribe' };
    const branded = appendComplianceFooter({ text: 'Hello', html: 'Hello' }, opts);
    expect(branded.text).toContain(CAREMETRIC_NAME);
    expect(branded.html).toContain(CAREMETRIC_NAME);
    expect(branded.text).toContain(opts.physicalAddress);
    expect(branded.html).toContain(opts.unsubscribeUrl);
    const customer = appendComplianceFooter({ text: 'Hello', html: 'Hello' }, { ...opts, senderName: 'Example Agency' });
    expect(customer.text).toContain('Example Agency is reaching out');
    expect(customer.text).not.toContain(CAREMETRIC_NAME);
  });
});
