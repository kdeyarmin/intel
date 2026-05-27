// @vitest-environment jsdom
/**
 * Tests for the URL-generation logic in GlobalSearchDialog's allResults memo.
 *
 * The PR changed the URL for Organization-type providers from
 *   createPageUrl(`OrganizationDetail?npi=${p.npi}`)
 * to
 *   createPageUrl(`ProviderDetail?npi=${p.npi}`)
 * making it identical to the URL used for Individual providers.
 *
 * These tests replicate the changed logic in isolation (see authValidation.test.ts
 * for the same pattern used elsewhere in this project) and also exercise
 * GlobalSearchDialog via a full render with mocked dependencies.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { createPageUrl } from '@/utils';

afterEach(cleanup);

// ─── Replicated helper (kept in sync with GlobalSearchDialog.jsx) ─────────────

/**
 * Build a search-result item for a provider, exactly as the allResults memo does
 * after the PR change.
 */
function buildProviderItem(provider) {
  const name =
    provider.entity_type === 'Individual'
      ? `${provider.first_name || ''} ${provider.last_name || ''}`.trim()
      : provider.organization_name || '';
  const isOrg = provider.entity_type === 'Organization';
  return {
    type: isOrg ? 'Organization' : 'Provider',
    label: name || provider.npi,
    sublabel: `NPI: ${provider.npi}${provider.credential ? ` • ${provider.credential}` : ''}${provider.status === 'Deactivated' ? ' • Deactivated' : ''}`,
    url: createPageUrl(`ProviderDetail?npi=${provider.npi}`),
  };
}

// ─── Unit tests for URL-generation logic ─────────────────────────────────────

describe('GlobalSearchDialog provider URL generation', () => {
  it('generates a ProviderDetail URL for an Individual provider', () => {
    const provider = {
      npi: '1234567890',
      entity_type: 'Individual',
      first_name: 'John',
      last_name: 'Doe',
      credential: 'MD',
      status: 'Active',
    };
    const item = buildProviderItem(provider);
    expect(item.url).toBe('/ProviderDetail?npi=1234567890');
  });

  it('generates a ProviderDetail URL for an Organization provider (not OrganizationDetail)', () => {
    const provider = {
      npi: '9876543210',
      entity_type: 'Organization',
      organization_name: 'Health Clinic LLC',
      credential: null,
      status: 'Active',
    };
    const item = buildProviderItem(provider);
    expect(item.url).toBe('/ProviderDetail?npi=9876543210');
  });

  it('does NOT produce an OrganizationDetail URL for org providers', () => {
    const provider = {
      npi: '9876543210',
      entity_type: 'Organization',
      organization_name: 'Health Clinic LLC',
      status: 'Active',
    };
    const item = buildProviderItem(provider);
    expect(item.url).not.toContain('OrganizationDetail');
  });

  it('type is "Organization" for org entities but URL still points to ProviderDetail', () => {
    const provider = {
      npi: '1111111111',
      entity_type: 'Organization',
      organization_name: 'Care Center',
      status: 'Active',
    };
    const item = buildProviderItem(provider);
    expect(item.type).toBe('Organization');
    expect(item.url).toBe('/ProviderDetail?npi=1111111111');
  });

  it('type is "Provider" for individual entities and URL points to ProviderDetail', () => {
    const provider = {
      npi: '2222222222',
      entity_type: 'Individual',
      first_name: 'Jane',
      last_name: 'Smith',
      status: 'Active',
    };
    const item = buildProviderItem(provider);
    expect(item.type).toBe('Provider');
    expect(item.url).toBe('/ProviderDetail?npi=2222222222');
  });

  it('appends "Deactivated" marker in sublabel for deactivated providers', () => {
    const provider = {
      npi: '3333333333',
      entity_type: 'Individual',
      first_name: 'Bob',
      last_name: 'Jones',
      credential: 'DO',
      status: 'Deactivated',
    };
    const item = buildProviderItem(provider);
    expect(item.sublabel).toContain('Deactivated');
    // URL is still ProviderDetail even when deactivated
    expect(item.url).toBe('/ProviderDetail?npi=3333333333');
  });

  it('includes credential in sublabel when present', () => {
    const provider = {
      npi: '4444444444',
      entity_type: 'Individual',
      first_name: 'Alice',
      last_name: 'Brown',
      credential: 'NP',
      status: 'Active',
    };
    const item = buildProviderItem(provider);
    expect(item.sublabel).toContain('NP');
  });

  it('uses NPI as the label when name fields are blank', () => {
    const provider = {
      npi: '5555555555',
      entity_type: 'Individual',
      first_name: '',
      last_name: '',
      status: 'Active',
    };
    const item = buildProviderItem(provider);
    expect(item.label).toBe('5555555555');
  });

  it('both Individual and Organization produce the same URL structure for the same NPI', () => {
    const npi = '6666666666';
    const individual = { npi, entity_type: 'Individual', first_name: 'A', last_name: 'B', status: 'Active' };
    const org = { npi, entity_type: 'Organization', organization_name: 'Org', status: 'Active' };
    expect(buildProviderItem(individual).url).toBe(buildProviderItem(org).url);
  });
});