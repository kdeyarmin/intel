import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CAREMETRIC_FAVICON_URL, CAREMETRIC_NAME } from '../src/lib/branding';

describe('Company browser branding', () => {
  it('uses the company name, emblem favicon, and a professional description', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    expect(html).toContain(`<title>${CAREMETRIC_NAME}</title>`);
    expect(html).toContain(`type="image/png" href="${CAREMETRIC_FAVICON_URL}"`);
    expect(html).toContain('name="description"');
    expect(html).not.toMatch(/base44\.com\/logo|CareMetric AI|CareMetric Intel/);
  });
});
