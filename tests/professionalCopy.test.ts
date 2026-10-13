import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { REPORT_CATALOG } from '../src/lib/marketBriefs.js';

const readSource = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('CareMetric Intel professional copy', () => {
  it('uses professional titles and reasons throughout the market report catalog', () => {
    const copy = REPORT_CATALOG.map(({ title, reason }) => `${title} ${reason}`).join(' ');
    expect(copy).not.toMatch(/open or staff|billing hospices|clinicians to call/i);
    expect(REPORT_CATALOG.find(({ id }) => id === 'expand-hospice')?.title)
      .toBe('Counties with high or rising hospice utilization');
    expect(REPORT_CATALOG.find(({ id }) => id === 'calls-hha')?.title)
      .toBe('Clinicians with home health certification activity');
  });

  it('uses the approved product and website branding in app and exported reports', () => {
    const paths = [
      '../src/components/layout/AppLayout.jsx',
      '../src/components/auth/AuthShell.jsx',
      '../src/components/auth/LegalPages.jsx',
      '../src/components/auth/PendingApproval.jsx',
      '../src/pages/Login.jsx',
      '../src/pages/Help.jsx',
      '../src/components/reports/ComprehensiveReport.jsx',
      '../src/components/reports/ReportDocument.jsx',
      '../src/components/reports/reportPdf.js',
      '../src/components/exports/exportUtils.jsx',
    ];
    const sources = paths.map(readSource);
    expect(sources.join('\n')).not.toMatch(/CareMetric AI|CareMetric\.ai|www\.CareMetric\.ai/);

    const footer = sources[0];
    expect(footer).toContain('CareMetric Intel');
    expect(footer).toContain('https://caremetricintel.com/');
    expect(footer).toContain('CareMetric Healthcare Advisors');
    expect(footer).toContain('https://caremetricadvisors.com/');
  });

  it('uses patient-centered labels and avoids duplicate disclaimer copy in the app footer', () => {
    const marketBriefs = readSource('../src/pages/MarketBriefs.jsx');
    const footer = readSource('../src/components/layout/AppLayout.jsx');
    expect(marketBriefs).toContain("'Medicare patients'");
    expect(marketBriefs).toContain('Medicare patient counts increased');
    expect(marketBriefs).not.toMatch(/Use rose;|Clinicians to call|None on file/);
    expect(footer).not.toContain('confirmed referral relationships');
  });
});
