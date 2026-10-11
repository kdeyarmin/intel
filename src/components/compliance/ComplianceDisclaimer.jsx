import React from 'react';
import { Info } from 'lucide-react';

/**
 * What the figures are and aren't. Every market view shows it; the plain
 * variant is for provider and territory pages.
 */
export default function ComplianceDisclaimer({ variant = 'plain', className = '' }) {
  const market = variant === 'market';
  return (
    <p role="note" className={`flex items-start gap-1.5 text-[11px] text-slate-400 ${className}`}>
      <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
      <span>
        CareMetric analytics derived from public CMS, NPPES and U.S. Census files, not CMS publications. Medicare figures cover
        fee-for-service beneficiaries only (plus Medicare Advantage where CMS includes it); CMS suppresses counts under 11 before
        publishing, and no patient-level data is used. Shared-patient patterns are not confirmed referrals.
        {market && ' Hospital sources show where a hospital’s inpatients live; the discharge mix is post-discharge Medicare spend by setting, a proxy for where patients go next, not a count of transfers.'}
      </span>
    </p>
  );
}
