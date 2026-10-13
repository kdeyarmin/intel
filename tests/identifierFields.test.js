import { describe, expect, it } from 'vitest';
import { isIdentifierField } from '../src/lib/identifierFields.js';

describe('identifier fields', () => {
  it.each([
    'ZIP CODE', 'zip', 'zip_code', 'ZipCode', 'Rndrng_Prvdr_Zip5', 'postal_code',
    'associate_id', 'Associate ID', 'enrollmentId', 'NPI', 'Rndrng_NPI', 'CCN',
    'county_fips', 'CBSA', 'TIN', 'EIN', 'HCPCS_Cd', 'DRG Code', 'measure_id',
    'provider_number', 'MEDICARE_PROV_NUM', 'license_number', 'RPT_REC_NUM',
    'data_year', 'Year', 'Graduation year', 'fiscalYear', 'phone', 'telephone_number', 'fax',
  ])('recognizes %s as a non-quantity field', (key) => {
    expect(isIdentifierField(key)).toBe(true);
  });

  it.each([
    'total_discharges', 'total_payments', 'total_services', 'total_unique_benes',
    'quality_rating', 'avg_length_of_stay', 'number_of_providers', 'years_in_practice',
  ])('leaves quantity field %s eligible for numeric formatting', (key) => {
    expect(isIdentifierField(key)).toBe(false);
  });
});
