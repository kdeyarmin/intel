import { describe, it, expect } from 'vitest';
import { DATASET_CONFIG } from '../src/components/customReports/reportConfig.jsx';

// ---------------------------------------------------------------------------
// reportConfig – PR change: outreach_metrics entity was renamed from
// 'Campaign' to 'OutreachCampaign' to match the unified outreach entity.
// ---------------------------------------------------------------------------
describe('DATASET_CONFIG.outreach_metrics', () => {
  it('uses OutreachCampaign as the entity (not the legacy Campaign)', () => {
    expect(DATASET_CONFIG.outreach_metrics.entity).toBe('OutreachCampaign');
  });

  it('does NOT reference the legacy Campaign entity', () => {
    expect(DATASET_CONFIG.outreach_metrics.entity).not.toBe('Campaign');
  });

  it('has the expected label "Outreach Metrics"', () => {
    expect(DATASET_CONFIG.outreach_metrics.label).toBe('Outreach Metrics');
  });

  it('exposes the standard outreach email metrics', () => {
    const keys = DATASET_CONFIG.outreach_metrics.metrics.map((m: { key: string }) => m.key);
    expect(keys).toContain('emails_sent');
    expect(keys).toContain('emails_opened');
    expect(keys).toContain('emails_responded');
    expect(keys).toContain('emails_bounced');
  });

  it('exposes conversion and financial metrics', () => {
    const keys = DATASET_CONFIG.outreach_metrics.metrics.map((m: { key: string }) => m.key);
    expect(keys).toContain('conversions');
    expect(keys).toContain('budget');
    expect(keys).toContain('revenue_generated');
  });

  it('can be grouped by campaign status', () => {
    const groupKeys = DATASET_CONFIG.outreach_metrics.groupOptions.map(
      (g: { key: string }) => g.key,
    );
    expect(groupKeys).toContain('status');
  });
});

// ---------------------------------------------------------------------------
// Regression: no other dataset entry should reference the legacy Campaign entity
// ---------------------------------------------------------------------------
describe('DATASET_CONFIG – Campaign entity removed from all entries', () => {
  it('no dataset entry uses the legacy "Campaign" entity string', () => {
    const legacyRefs = Object.entries(DATASET_CONFIG).filter(
      ([, cfg]: [string, any]) => cfg.entity === 'Campaign',
    );
    expect(legacyRefs).toHaveLength(0);
  });
});
