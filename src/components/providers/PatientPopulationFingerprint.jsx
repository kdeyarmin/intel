import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, Brain, HeartPulse } from 'lucide-react';

export default function PatientPopulationFingerprint({ provider, taxonomy, utilization, referrals }) {
  // Derive indicators from available data
  const indicators = [];

  // Geriatric-heavy indicator
  const patientVolume = utilization?.total_medicare_beneficiaries || 0;
  const servicesPerPatient = patientVolume > 0 
    ? ((utilization?.total_services || 0) / patientVolume) 
    : 0;

  if (patientVolume >= 300 || servicesPerPatient >= 12) {
    indicators.push({
      type: 'Geriatric-Heavy Practice',
      icon: Users,
      color: 'bg-blue-100 text-blue-800',
      description: 'High Medicare patient volume suggests geriatric focus',
      confidence: patientVolume >= 500 ? 'High' : 'Moderate'
    });
  }

  // Behavioral health indicator (from taxonomy)
  const behavioralSpecialties = [
    'psychiatry', 'psychology', 'behavioral health', 'mental health', 
    'addiction', 'substance abuse', 'counseling'
  ];
  const hasBehavioralSpecialty = taxonomy?.some(t => 
    behavioralSpecialties.some(s => 
      (t.taxonomy_description || '').toLowerCase().includes(s)
    )
  );

  if (hasBehavioralSpecialty) {
    indicators.push({
      type: 'Behavioral Health Focus',
      icon: Brain,
      color: 'bg-purple-100 text-purple-800',
      description: 'Specialty indicates mental health/behavioral services',
      confidence: 'High'
    });
  }

  // Chronic disease complexity (from high service intensity + referral patterns)
  const hasHighReferrals = (referrals?.total_referrals || 0) >= 50;
  const hasHighIntensity = servicesPerPatient >= 10;

  if (hasHighIntensity || hasHighReferrals) {
    indicators.push({
      type: 'Complex Chronic Conditions',
      icon: HeartPulse,
      color: 'bg-red-100 text-red-800',
      description: hasHighReferrals 
        ? 'High referral volume suggests complex patient needs'
        : 'High service intensity indicates chronic disease management',
      confidence: (hasHighIntensity && hasHighReferrals) ? 'High' : 'Moderate'
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Patient Population Fingerprint
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {indicators.length === 0 ? (
          <p className="text-sm text-gray-500">
            Insufficient data to generate population insights
          </p>
        ) : (
          indicators.map((indicator, idx) => {
            const Icon = indicator.icon;
            return (
              <div key={idx} className="p-3 rounded-lg border">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Icon className="h-5 w-5" />
                    <span className="font-medium">{indicator.type}</span>
                  </div>
                  <Badge className={indicator.color}>{indicator.confidence}</Badge>
                </div>
                <p className="text-sm text-gray-600 ml-7">{indicator.description}</p>
              </div>
            );
          })
        )}

        {indicators.length > 0 && (
          <div className="pt-3 border-t">
            <p className="text-xs text-gray-500">
              Indicators derived from specialty classification, Medicare utilization patterns, and referral behavior
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}