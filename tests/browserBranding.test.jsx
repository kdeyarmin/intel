// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CAREMETRIC_FAVICON_URL } from '../src/lib/branding';
import { checkAndNotify } from '../src/components/imports/AlertNotificationSettings';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const html = readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
const head = new DOMParser().parseFromString(html, 'text/html');
const manifest = JSON.parse(readFileSync(path.resolve(__dirname, '../public/manifest.json'), 'utf8'));

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('browser branding', () => {
  it('uses the professional title and existing CareMetric favicon', () => {
    expect(head.title).toBe('CareMetric Healthcare Advisors');
    const icon = head.querySelector('link[rel="icon"]');
    expect(icon.getAttribute('href')).toBe(CAREMETRIC_FAVICON_URL);
    expect(icon.getAttribute('type')).toBe('image/png');
    expect(icon.getAttribute('sizes')).toBe('256x256');
    expect(html).not.toContain('https://base44.com/logo_v2.svg');
  });

  it('serves a matching branded manifest at the linked path', () => {
    expect(head.querySelector('link[rel="manifest"]').getAttribute('href')).toBe('/manifest.json');
    expect(manifest.name).toBe(head.title);
    expect(manifest.short_name).toBe('CareMetric AI');
    expect(manifest.icons).toContainEqual({
      src: CAREMETRIC_FAVICON_URL,
      sizes: '256x256',
      type: 'image/png',
      purpose: 'any',
    });
  });

  it('brands standalone public pages without changing their headings', () => {
    const source = readFileSync(path.resolve(__dirname, '../server/routes/public.ts'), 'utf8');
    expect(source).toContain('<title>${escapeHtml(title)} | CareMetric Healthcare Advisors</title>');
    expect(source).toContain(`href="${CAREMETRIC_FAVICON_URL}"`);
    expect(source).toContain('<h1>${escapeHtml(title)}</h1>');
  });

  it.each(['completed', 'failed'])('uses the branded icon for %s notifications', (status) => {
    const Notification = vi.fn(function () {});
    Notification.permission = 'granted';
    vi.stubGlobal('Notification', Notification);

    checkAndNotify({ status, import_type: 'Test import' }, 'processing');

    expect(Notification).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      icon: CAREMETRIC_FAVICON_URL,
    }));
  });
});
