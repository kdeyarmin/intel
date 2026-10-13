// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const state = vi.hoisted(() => ({ doc: null, logo: vi.fn(async () => null), withLogo: false }));
vi.mock('@/lib/AuthContext', () => ({
  useOptionalAuth: () => ({ user: { role: 'user' } }),
}));
vi.mock('@/components/exports/exportUtils', () => ({ pdfLogo: state.logo }));
vi.mock('jspdf', async (original) => {
  const { jsPDF } = await original();
  return {
    jsPDF: function (options) {
      state.doc = new jsPDF(options);
      state.doc.save = vi.fn();
      if (state.withLogo) {
        state.doc.getImageProperties = vi.fn(() => ({ width: 400, height: 100 }));
        state.doc.addImage = vi.fn();
      }
      return state.doc;
    },
  };
});

import Help from '../src/pages/Help';

afterEach(() => {
  cleanup();
  state.withLogo = false;
  state.logo.mockReset().mockResolvedValue(null);
});

describe('User guide PDF branding', () => {
  it('generates a real guide with the company name and a footer on every content page', async () => {
    render(<MemoryRouter><Help /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Download PDF Guide' }));
    await waitFor(() => expect(state.doc?.save).toHaveBeenCalledWith('CareMetric_Healthcare_Advisors_User_Guide.pdf'));
    const output = state.doc.output();
    expect(output).toMatch(/^%PDF-/);
    expect(output).toContain('/Author (CareMetric Healthcare Advisors)');
    expect(output).not.toMatch(/CareMetric AI|CareMetric Intel/);
    expect(output.match(/caremetric\.ai/g)).toHaveLength(state.doc.getNumberOfPages() - 1);
    expect(output).toContain('No patient-level data.');
  });

  it('fits the existing wordmark without distorting its proportions', async () => {
    state.withLogo = true;
    state.logo.mockResolvedValue('company-wordmark');
    render(<MemoryRouter><Help /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Download PDF Guide' }));
    await waitFor(() => expect(state.doc?.save).toHaveBeenCalled());
    expect(state.doc.addImage).toHaveBeenCalledWith('company-wordmark', 'PNG', 20, 20, 75, 18.75);
  });
});
