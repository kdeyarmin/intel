// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import ProviderCMSDataCard from '../src/components/providers/ProviderCMSDataCard';

afterEach(cleanup);

it('keeps CMS identifiers and years ungrouped while formatting patient counts', () => {
  render(<ProviderCMSDataCard clinicianData={{
    has_data: true,
    by_type: { clinician_national_file: [{
      data_year: 2025,
      raw_data: { Year: 2025, 'ZIP Code': '02108', 'Associate ID': '0012345678', Rfrg_NPI: '1234567890', CCN: '01A234', patients: 12345 },
    }] },
  }} />);
  fireEvent.click(screen.getByRole('button', { name: /Clinician Profile/ }));
  for (const text of ['02108', '0012345678', '1234567890', '01A234', '12,345']) expect(screen.getByText(text)).toBeTruthy();
  expect(screen.queryByText('2,025')).toBeNull();
});
