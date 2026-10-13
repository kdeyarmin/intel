// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CAREMETRIC_LOGO_URL } from '../src/lib/branding';

const state = vi.hoisted(() => ({ doc: null, imageSize: { width: 400, height: 100 } }));
vi.mock('@/api/base44Client', () => ({ base44: {} }));
vi.mock('jspdf', async (original) => {
  const { jsPDF } = await original();
  return {
    jsPDF: function (options) {
      state.doc = new jsPDF(options);
      state.doc.save = vi.fn();
      state.doc.getImageProperties = vi.fn(() => state.imageSize);
      state.doc.addImage = vi.fn();
      vi.spyOn(state.doc, 'roundedRect');
      return state.doc;
    },
  };
});

import { exportPDF } from '../src/components/exports/exportUtils';

afterEach(() => vi.unstubAllGlobals());

describe('shared PDF branding', () => {
  it('preserves the official wordmark proportions and gives it a white backing', async () => {
    const fetchLogo = vi.fn(async () => ({ blob: async () => new Blob(['logo'], { type: 'image/png' }) }));
    vi.stubGlobal('fetch', fetchLogo);
    await exportPDF([{ name: 'Example provider' }], [{ key: 'name', label: 'Name' }], 'providers', 'Provider report');
    expect(fetchLogo).toHaveBeenCalledWith(CAREMETRIC_LOGO_URL);
    expect(state.doc.addImage).toHaveBeenCalledWith(expect.any(String), 'PNG', 11, 8.375, 45, 11.25);
    expect(state.doc.roundedRect).toHaveBeenCalledWith(10, 7.375, 47, 13.25, 1, 1, 'F');
    expect(state.doc.output()).toContain('Healthcare Provider Intelligence');
    expect(state.doc.output()).toContain('CareMetric AI');
    expect(state.doc.save).toHaveBeenCalledWith('providers.pdf');
  });
});
