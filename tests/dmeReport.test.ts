/**
 * Tests for the pure DME report helpers (server/functions/dmeReportHelpers.ts).
 *
 * These run in the default node environment and import only the dependency-free
 * helper module (no db / Anthropic), mirroring how the edge-function helpers are
 * unit-tested elsewhere in the suite.
 */
import { describe, it, expect } from 'vitest';
import {
  DME_FACILITY_TYPE,
  DME_EMAIL_SOURCE,
  extractDMEContact,
  rankEmailCandidates,
  confidenceToScore,
  computeJobProgress,
  normalizeState,
} from '../server/functions/dmeReportHelpers';

describe('DME constants', () => {
  it('uses the CMS DMEPOS supplier directory facility type', () => {
    expect(DME_FACILITY_TYPE).toBe('medical_equipment_suppliers');
  });
  it('tags found emails with a distinct enrichment source', () => {
    expect(DME_EMAIL_SOURCE).toBe('dme_email_finder');
  });
});

describe('extractDMEContact', () => {
  it('pulls npi, phone, website and email from varied raw_data keys', () => {
    const raw = {
      NPI: '1234567890',
      PRACTICE_TELEPHONE_NUMBER: '(555) 123-4567',
      Business_Website: 'https://acme-dme.com',
      Contact_Email: 'info@acme-dme.com',
      irrelevant: 'x',
    };
    const c = extractDMEContact(raw);
    expect(c.npi).toBe('1234567890');
    expect(c.phone).toBe('(555) 123-4567');
    expect(c.website).toBe('https://acme-dme.com');
    expect(c.email).toBe('info@acme-dme.com');
  });

  it('detects an email even when the key does not say "email"', () => {
    const c = extractDMEContact({ contact: 'reach us at sales@supplier.org please' });
    expect(c.email).toBe('sales@supplier.org');
  });

  it('rejects a non-10-digit NPI value', () => {
    const c = extractDMEContact({ npi_number: '12345' });
    expect(c.npi).toBeNull();
  });

  it('parses a JSON string raw_data', () => {
    const c = extractDMEContact('{"NPI":"9876543210","phone":"555-000-1111"}');
    expect(c.npi).toBe('9876543210');
    expect(c.phone).toBe('555-000-1111');
  });

  it('returns all-null for empty / invalid input', () => {
    expect(extractDMEContact(null)).toEqual({ npi: null, phone: null, website: null, email: null });
    expect(extractDMEContact('not json')).toEqual({ npi: null, phone: null, website: null, email: null });
  });
});

describe('rankEmailCandidates', () => {
  it('orders by validation status then confidence', () => {
    const ranked = rankEmailCandidates([
      { email: 'low@a.com', validation_status: 'risky', confidence: 'low' },
      { email: 'best@a.com', validation_status: 'valid', confidence: 'high' },
      { email: 'mid@a.com', validation_status: 'valid', confidence: 'medium' },
    ]);
    expect(ranked.map((e) => e.email)).toEqual(['best@a.com', 'mid@a.com', 'low@a.com']);
  });

  it('does not mutate the input array', () => {
    const input = [
      { email: 'a@a.com', validation_status: 'risky', confidence: 'low' },
      { email: 'b@a.com', validation_status: 'valid', confidence: 'high' },
    ];
    const copy = [...input];
    rankEmailCandidates(input);
    expect(input).toEqual(copy);
  });
});

describe('confidenceToScore', () => {
  it('maps labels to numeric scores', () => {
    expect(confidenceToScore('high')).toBe(0.9);
    expect(confidenceToScore('medium')).toBe(0.6);
    expect(confidenceToScore('low')).toBe(0.3);
  });
  it('returns null for unknown/missing labels', () => {
    expect(confidenceToScore(null)).toBeNull();
    expect(confidenceToScore('verified')).toBeNull();
  });
});

describe('normalizeState', () => {
  it('uppercases valid 2-letter codes', () => {
    expect(normalizeState('pa')).toBe('PA');
    expect(normalizeState(' ny ')).toBe('NY');
  });
  it('rejects anything that is not a 2-letter code', () => {
    expect(normalizeState('')).toBeNull();
    expect(normalizeState('Penn')).toBeNull();
    expect(normalizeState(123 as unknown as string)).toBeNull();
  });
});

describe('computeJobProgress', () => {
  it('computes percent from processed/total', () => {
    const p = computeJobProgress({ total_items: 200, processed_items: 50, success_count: 30, error_count: 2 });
    expect(p).toEqual({ total: 200, processed: 50, found: 30, errors: 2, percent: 25 });
  });
  it('is safe when total is zero or metadata missing', () => {
    expect(computeJobProgress(null)).toEqual({ total: 0, processed: 0, found: 0, errors: 0, percent: 0 });
    expect(computeJobProgress({ total_items: 0, processed_items: 5 }).percent).toBe(0);
  });
  it('caps percent at 100', () => {
    expect(computeJobProgress({ total_items: 10, processed_items: 25 }).percent).toBe(100);
  });
});
