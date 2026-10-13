import { eligibilityLabels } from '@/lib/referralSummary';
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Lightbulb, TrendingUp } from 'lucide-react';

export default function WhyThisProvider({ score, utilization, referrals, orderReferring = null, taxonomy }) {
  const reasons = [];

  // Score-based
  if (score?.score >= 80) {
    reasons.push('Exceptional CareMetric Intel Fit Score indicates strong alignment with target profile');
  } else if (score?.score >= 60) {
    reasons.push('Good CareMetric Intel Fit Score suggests potential partnership opportunity');
  }

  // Volume-based
  const patientVolume = utilization?.total_medicare_beneficiaries || 0;
  if (patientVolume >= 500) {
    reasons.push(`High patient volume (${patientVolume.toLocaleString()} Medicare beneficiaries) demonstrates practice capacity`);
  } else if (patientVolume >= 200) {
    reasons.push(`Moderate patient volume (${patientVolume.toLocaleString()} beneficiaries) indicates established practice`);
  }

  // Shared-patient and eligibility based. `referrals` is the latest year's
  // shared-patient snapshot (patterns, not confirmed referrals).
  const sharedPatients = referrals?.total_referrals || 0;
  const partners = referrals?.partners || 0;
  const eligible = eligibilityLabels(orderReferring);
  const postAcuteEligible = eligible.filter((l) => l === 'Home Health' || l === 'Hospice');
  if (postAcuteEligible.length) {
    reasons.push(`Eligible to order and refer Medicare ${postAcuteEligible.join(' and ').toLowerCase()}`);
  }
  if (sharedPatients >= 50) {
    reasons.push(`Shares Medicare patients widely (${sharedPatients.toLocaleString()} shared-patient encounters${partners ? ` across ${partners} partner providers` : ''}, data year ${referrals.year})`);
  }

  // Specialty-based
  const primaryTaxonomy = taxonomy?.find(t => t.is_primary) || taxonomy?.[0];
  if (primaryTaxonomy) {
    const specialty = primaryTaxonomy.taxonomy_description || 'Primary care';
    const targetSpecialties = ['family medicine', 'internal medicine', 'geriatric', 'cardiology', 'oncology'];
    const isTargetSpecialty = targetSpecialties.some(s => 
      specialty.toLowerCase().includes(s)
    );
    if (isTargetSpecialty) {
      reasons.push(`${specialty} specialty aligns with high-need patient populations`);
    }
  }

  // Service intensity
  const servicesPerPatient = patientVolume > 0 
    ? ((utilization?.total_services || 0) / patientVolume).toFixed(1)
    : 0;
  if (servicesPerPatient >= 10) {
    reasons.push(`High service intensity (${servicesPerPatient} services/patient) suggests complex patient management`);
  }

  // Score breakdown insights
  if (score?.score_breakdown) {
    const topFactors = Object.entries(score.score_breakdown)
      .filter(([_key, val]) => val.contribution >= 15)
      .map(([key]) => key.replace(/_/g, ' '));
    
    if (topFactors.length > 0) {
      reasons.push(`Strong performance in: ${topFactors.slice(0, 2).join(', ')}`);
    }
  }

  return (
    <Card className="border-teal-500/30 bg-teal-900/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-teal-400">
          <Lightbulb className="h-5 w-5" />
          Why This Provider?
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {reasons.length === 0 ? (
          <p className="text-sm text-teal-400">
            Limited data available for provider assessment
          </p>
        ) : (
          <>
            <div className="space-y-2">
              {reasons.map((reason, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <div className="mt-1 h-1.5 w-1.5 rounded-full bg-teal-600 flex-shrink-0" />
                  <p className="text-sm text-teal-400">{reason}</p>
                </div>
              ))}
            </div>

            {score?.score && (
              <div className="pt-3 border-t border-teal-500/30">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-teal-400">Overall Assessment</span>
                  <Badge className="bg-teal-700 text-white">
                    <TrendingUp className="h-3 w-3 mr-1" />
                    {score.score >= 80 ? 'Excellent Fit' : score.score >= 60 ? 'Good Fit' : 'Potential Fit'}
                  </Badge>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}