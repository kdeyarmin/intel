export const CENTRAL_SUPPORT_HUB_ORIGIN = 'https://support-hub-web-production.up.railway.app';
export const CENTRAL_SUPPORT_PHONE = '+18775212890';
export const CENTRAL_SUPPORT_PHONE_DISPLAY = '(877) 521-2890';
export const CENTRAL_SUPPORT_EMAIL = 'support@caremetric.ai';

export const CAREMETRIC_INTEL_PRODUCT = 'caremetric-intel';
export const CAREMETRIC_INTEL_PRODUCTION_APP_ID = '6993c62145573ca8a97ad4a9';
export const CAREMETRIC_INTEL_PRODUCTION_HOST = 'caremetricintel.com';

/**
 * Match the one verified CareMetric Intel production identity. This controls
 * whether central contact routes are shown at all.
 */
export function isVerifiedCareMetricIntelProduction({
  appId,
  environment,
  hostname,
  isDevelopment = false,
} = {}) {
  const normalizedHostname = typeof hostname === 'string'
    ? hostname.trim().toLowerCase().replace(/\.$/, '')
    : '';

  return !(
    isDevelopment
    || appId !== CAREMETRIC_INTEL_PRODUCTION_APP_ID
    || environment !== 'production'
    || normalizedHostname !== CAREMETRIC_INTEL_PRODUCTION_HOST
  );
}

/**
 * The external Hub launcher is enabled only for the verified production
 * identity. An explicit value other than `true` is a fail-closed kill switch;
 * central phone and email remain available independently.
 */
export function resolveCentralSupportActivation(input = {}) {
  if (!isVerifiedCareMetricIntelProduction(input)) return false;
  return input.flag == null || input.flag === 'true';
}

/**
 * Build a fixed, first-party Help Hub URL. There are deliberately no input
 * parameters, so user, tenant, provider, patient, record, query/hash, token,
 * or free-text context cannot be attached by a caller.
 */
export function buildCareMetricIntelSupportUrl() {
  const url = new URL('/help', CENTRAL_SUPPORT_HUB_ORIGIN);
  url.searchParams.set('product', CAREMETRIC_INTEL_PRODUCT);
  url.searchParams.set('route', '/Help');
  url.searchParams.set('locale', 'en-US');
  url.searchParams.set('environment', 'production');
  return url.toString();
}
