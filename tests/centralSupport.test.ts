import { describe, expect, it } from 'vitest';
import {
  buildCareMetricIntelSupportUrl,
  CAREMETRIC_INTEL_PRODUCTION_APP_ID,
  CENTRAL_SUPPORT_EMAIL,
  CENTRAL_SUPPORT_PHONE,
  resolveCentralSupportActivation,
} from '../src/lib/centralSupport';

const PRODUCTION_INPUT = {
  appId: CAREMETRIC_INTEL_PRODUCTION_APP_ID,
  environment: 'production',
  hostname: 'caremetricintel.com',
};

describe('CareMetric Intel central support integration', () => {
  it('builds a permanent first-party URL with only static, non-identifying context', () => {
    const url = new URL(buildCareMetricIntelSupportUrl());

    expect(url.origin).toBe('https://support-hub-web-production.up.railway.app');
    expect(url.pathname).toBe('/help');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      product: 'caremetric-intel',
      route: '/Help',
      locale: 'en-US',
      environment: 'production',
    });
    expect([...url.searchParams.keys()]).toEqual(['product', 'route', 'locale', 'environment']);
    expect(buildCareMetricIntelSupportUrl.length).toBe(0);
    expect(url.toString()).not.toMatch(/localhost|user|tenant|provider|patient|record|token|email/i);
  });

  it('uses the owner-verified support phone and email', () => {
    expect(CENTRAL_SUPPORT_PHONE).toBe('+18775212890');
    expect(CENTRAL_SUPPORT_EMAIL).toBe('support@caremetric.ai');
  });

  it('activates only for the verified production app and host', () => {
    expect(resolveCentralSupportActivation(PRODUCTION_INPUT)).toBe(true);
    expect(resolveCentralSupportActivation({ ...PRODUCTION_INPUT, flag: 'true' })).toBe(true);
    expect(resolveCentralSupportActivation({ ...PRODUCTION_INPUT, hostname: 'CAREMetricIntel.com.' })).toBe(true);
  });

  it.each([
    { ...PRODUCTION_INPUT, appId: 'another-app' },
    { ...PRODUCTION_INPUT, environment: 'staging' },
    { ...PRODUCTION_INPUT, hostname: 'preview.base44.app' },
    { ...PRODUCTION_INPUT, hostname: 'intel-iota-two.vercel.app' },
    { ...PRODUCTION_INPUT, flag: 'false' },
    { ...PRODUCTION_INPUT, flag: 'TRUE' },
    { ...PRODUCTION_INPUT, isDevelopment: true },
  ])('fails closed outside the verified production identity: %o', (input) => {
    expect(resolveCentralSupportActivation(input)).toBe(false);
  });
});
