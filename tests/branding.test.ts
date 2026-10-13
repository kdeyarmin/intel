import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CAREMETRIC_COMPANY, CAREMETRIC_LOGO_URL, CAREMETRIC_PRODUCT, CAREMETRIC_WEBSITE } from '../src/lib/branding';
import { approvedEmail, duplicateSubscriptionEmail, inviteEmail, resetEmail, signupPendingEmail } from '../server/lib/accountEmails';
import { SYSTEM_PROMPT } from '../server/lib/assistant/prompt';

function runtimeFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? runtimeFiles(path) : /\.(?:jsx?|tsx?|html|jsonc?)$/.test(entry.name) ? [path] : [];
  });
}

describe('CareMetric Intel branding', () => {
  it('keeps the product, company and canonical logo distinct', () => {
    expect(CAREMETRIC_PRODUCT).toBe('CareMetric Intel');
    expect(CAREMETRIC_COMPANY).toBe('CareMetric Healthcare Advisors');
    expect(CAREMETRIC_WEBSITE).toBe('https://caremetricintel.com/');
    expect(CAREMETRIC_LOGO_URL).toMatch(/d0d5af455_CareMetric\.png$/);
    expect(CAREMETRIC_LOGO_URL).not.toMatch(/favicon/i);
  });

  it('does not publish the retired branding in app, server or Base44 runtime files', () => {
    for (const path of ['index.html', '.env.example', 'README.md', 'CLAUDE.md', ...runtimeFiles('src'), ...runtimeFiles('server'), ...runtimeFiles('base44')]) {
      const source = readFileSync(path, 'utf8');
      expect(source, path).not.toMatch(/CareMetric AI|(?:www\.)?CareMetric\.ai|553986bd4_CareMetric_favicon/i);
      expect(source, path).not.toContain('Healthcare Provider Intelligence');
    }
  });

  it('uses the canonical favicon and production website in HTML metadata', () => {
    const html = readFileSync('index.html', 'utf8');
    expect(html).toContain(`<title>${CAREMETRIC_PRODUCT}</title>`);
    expect(html).toContain(`href="${CAREMETRIC_LOGO_URL}"`);
    expect(html).toContain(`content="${CAREMETRIC_WEBSITE}"`);
    expect(html).toContain(CAREMETRIC_COMPANY);
  });

  it('brands account emails without changing caller-controlled application links', () => {
    const base = 'https://tenant.example';
    const link = `${base}/reset-password?token=example`;
    const messages = [
      signupPendingEmail('admin@example.com', { email: 'new@example.com', full_name: 'New User' }, base),
      approvedEmail('new@example.com', base),
      resetEmail('new@example.com', link),
      inviteEmail('new@example.com', link, null),
      duplicateSubscriptionEmail('admin@example.com', { id: 1, name: 'Example Org' }, { kept: 'sub_new', previous: 'sub_old' }),
    ];
    for (const message of messages) {
      expect(message.subject).toContain(CAREMETRIC_PRODUCT);
      expect(message.text.endsWith(`\n\n${CAREMETRIC_COMPANY}\n${CAREMETRIC_WEBSITE}`)).toBe(true);
      expect(message.text.match(/CareMetric Healthcare Advisors/g)).toHaveLength(1);
      expect(message.text.match(/https:\/\/caremetricintel\.com\//g)).toHaveLength(1);
    }
    expect(messages[0].text).toContain(`${base}/AdminSettings`);
    expect(messages[1].text).toContain(`${base}/login`);
    expect(messages[2].text).toContain(link);
    expect(messages[3].text).toContain(link);
  });

  it('identifies the assistant with the product and company', () => {
    expect(SYSTEM_PROMPT).toContain('CareMetric Intel Assistant');
    expect(SYSTEM_PROMPT).toContain(CAREMETRIC_COMPANY);
    expect(SYSTEM_PROMPT).toContain(CAREMETRIC_WEBSITE);
  });
});
