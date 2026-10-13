import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const repo = new URL('../', import.meta.url);

describe('CareMetric Healthcare Advisors branding', () => {
  it('uses the company identity and logo in the browser shell', async () => {
    const [html, shell, branding] = await Promise.all([
      readFile(new URL('index.html', repo), 'utf8'),
      readFile(new URL('src/components/layout/AppLayout.jsx', repo), 'utf8'),
      readFile(new URL('src/lib/branding.js', repo), 'utf8'),
    ]);

    expect(html).toContain('<title>CareMetric Healthcare Advisors</title>');
    expect(html).toContain('d0d5af455_CareMetric.png');
    expect(html).not.toContain('base44.com/logo_v2.svg');
    expect(shell).toContain('{BRAND_NAME}');
    expect(shell).toContain('Data sources: CMS, NPPES and U.S. Census Bureau');
    expect(shell).not.toContain('Analysis by CareMetric Healthcare Advisors');
    expect(shell).not.toContain('BillingStatusWidget');
    expect(branding).toContain("BRAND_NAME = 'CareMetric Healthcare Advisors'");
  });
});
