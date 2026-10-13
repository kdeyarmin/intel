// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { formatCellValue } from '../src/pages/FacilityDetail';
import ProviderCMSDataCard from '../src/components/providers/ProviderCMSDataCard';

afterEach(cleanup);

describe('CMS identifier formatting', () => {
  it.each([
    ['data_year', 2024, '2024'],
    ['ZIP Code', '02108', '02108'],
    ['ZIP+4', '02108-1234', '02108-1234'],
    ['provider_id', '001234', '001234'],
    ['Provider Number', '001234', '001234'],
    ['NPI', 1234567890, '1234567890'],
    ['county_fips', '01001', '01001'],
    ['CCN', '012345', '012345'],
  ])('preserves %s in facility raw data', (key, value, expected) => {
    expect(formatCellValue(key, value)).toBe(expected);
  });

  it('keeps separators for quantities and does not turn missing values into zero', () => {
    expect(formatCellValue('total_services', 1234)).toBe((1234).toLocaleString());
    expect(formatCellValue('data_year', null)).toBe('—');
    expect(formatCellValue('ZIP Code', '')).toBe('—');
  });

  it('preserves years and identifiers in expanded provider CMS data', () => {
    render(
      <ProviderCMSDataCard clinicianData={{
        has_data: true,
        by_type: {
          clinician_national_file: [{
            data_year: 2024,
            raw_data: { Year: 2024, 'ZIP Code': '02108', 'Provider Number': '001234', NPI: 1234567890, total_services: 1234 },
          }],
        },
      }} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Clinician Profile/ }));
    for (const value of ['02108', '001234', '1234567890', (1234).toLocaleString()]) {
      expect(screen.getByText(value)).toBeInTheDocument();
    }
    expect(screen.getAllByText('2024')).toHaveLength(2);
    expect(document.body).not.toHaveTextContent('2,024');
  });
});
