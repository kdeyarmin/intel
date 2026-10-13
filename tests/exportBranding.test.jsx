// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';

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

import { exportPDF } from '../src/components/exports/exportUtils';
import { CAREMETRIC_LOGO_URL } from '../src/lib/branding';

it('brands generic PDF exports and preserves the logo aspect ratio and identifier spelling', async () => {
  const fetch = vi.fn(async () => ({ blob: async () => new Blob(['logo'], { type: 'image/png' }) }));
  vi.stubGlobal('fetch', fetch);
  try {
    await exportPDF([{ year: 2025, zip: '02108', npi: '1234567890', ccn: '01A234' }], [
      { key: 'year', label: 'Year' }, { key: 'zip', label: 'ZIP' }, { key: 'npi', label: 'NPI' }, { key: 'ccn', label: 'CCN' },
    ], 'example', 'Market Report');
    expect(fetch).toHaveBeenCalledWith(CAREMETRIC_LOGO_URL);
    expect(state.doc.addImage).toHaveBeenCalledWith(expect.any(String), 'PNG', 10, 9, 40, 10);
    const output = state.doc.output();
    for (const text of ['CareMetric Intel', 'CareMetric Healthcare Advisors', 'https://caremetricintel.com/', '2025', '02108', '1234567890', '01A234']) expect(output).toContain(text);
    expect(output).not.toMatch(/CareMetric AI|CareMetric\.ai|2,025/);
    expect(state.doc.save).toHaveBeenCalledWith('example.pdf');
  } finally {
    vi.unstubAllGlobals();
  }
});
