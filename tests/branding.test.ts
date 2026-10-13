import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CAREMETRIC_LOGO_URL } from '../src/lib/branding';

describe('CareMetric browser branding', () => {
  it('uses the product title and the official logo instead of the Base44 favicon', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    expect(html).toContain('<title>CareMetric AI</title>');
    expect(html).toContain(`type="image/png" href="${CAREMETRIC_LOGO_URL}"`);
    expect(html).not.toContain('base44.com');
  });

  it('removes the billing status widget rather than leaving an unused surface', () => {
    expect(existsSync(new URL('../src/components/layout/BillingStatusWidget.jsx', import.meta.url))).toBe(false);
    const layout = readFileSync(new URL('../src/components/layout/AppLayout.jsx', import.meta.url), 'utf8');
    expect(layout).not.toContain('BillingStatusWidget');
    expect(layout).not.toContain('favicon_256x256');
    expect(layout).not.toContain('mixBlendMode');
  });
});
