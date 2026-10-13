import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const pages = new URL('../src/pages/', import.meta.url);
const source = (name: string) => readFileSync(new URL(name, pages), 'utf8');

describe('professional page wording', () => {
  it('uses no retired branding in the reviewed pages', () => {
    const excluded = new Set(['Help.jsx', 'Login.jsx', 'Landing.jsx']);
    for (const name of readdirSync(pages).filter((name) => name.endsWith('.jsx') && !excluded.has(name))) {
      expect(source(name), name).not.toMatch(/CareMetric (?:AI|Intel)\b/);
    }
  });

  it('gives the dashboard a branded, specific overview without changing its access checks', () => {
    expect(source('Dashboard.jsx')).toContain('CareMetric Healthcare Advisors — provider data, outreach activity, and data health');
    expect(source('Dashboard.jsx')).toContain('enabled: isAdmin');
    expect(source('Dashboard.jsx')).toContain('Facilities for this business line');
  });

  it('describes sample-based analytics and recorded audit events without claiming complete coverage', () => {
    expect(source('AdvancedAnalytics.jsx')).toContain('using loaded data samples');
    expect(source('AdvancedAnalytics.jsx')).toContain('uses samples from the national dataset');
    expect(source('SecurityAudit.jsx')).toContain('500 most recent recorded events available to your account');
    expect(source('SecurityAudit.jsx')).toContain("AuditEvent.list('-created_date', 500)");
  });

  it('preserves distinctions between estimates, scores, and confirmed referrals', () => {
    expect(source('ReferralNetworkIntelligence.jsx')).toContain('shared-patient patterns');
    expect(source('ReferralNetworkIntelligence.jsx')).toContain('not confirmed referrals');
    expect(source('ScoringRules.jsx')).toContain('scores are not referral predictions');
    expect(source('DataQuality.jsx')).toContain('AI-assisted correction suggestions');
  });
});
