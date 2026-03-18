import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, Building2, CheckCircle } from 'lucide-react';

export default function ReferralLikelihoodSignals({ utilization, _referrals, taxonomy }) {
  const signals = [];

  const patientVolume = utilization?.total_medicare_beneficiaries || 0;
  const totalServices = utilization?.total_services || 0;
  const servicesPerPatient = patientVolume > 0 ? (totalServices / patientVolume) : 0;

  // High E/M visit indicator (services per patient as proxy)
  if (servicesPerPatient >= 8) {
    signals.push({
      label: 'High E/M Visit Pattern',
      icon: TrendingUp,
      color: 'text-green-600',
      description: `${servicesPerPatient.toFixed(1)} services per patient suggests frequent patient encounters`,
      strength: servicesPerPatient >= 12 ? 'Strong' : 'Moderate'
    });
  }

  // Medicare-heavy patient base
  const medicarePercentage = patientVolume >= 200 ? 100 : patientVolume >= 100 ? 80 : 60;
  if (patientVolume >= 100) {
    signals.push({
      label: 'Medicare-Heavy Patient Base',
      icon: CheckCircle,
      color: 'text-blue-600',
      description: `${patientVolume} Medicare beneficiaries (est. ${medicarePercentage}% of practice)`,
      strength: patientVolume >= 500 ? 'Strong' : 'Moderate'
    });
  }

  // Office-based vs facility-based (inferred from specialty)
  const facilitySpecialties = ['hospitalist', 'emergency', 'anesthesiology', 'radiology', 'pathology'];
  const officeSpecialties = ['family medicine', 'internal medicine', 'pediatrics', 'psychiatry'];
  
  const primaryTaxonomy = taxonomy?.find(t => t.primary_flag) || taxonomy?.[0];
  const taxonomyDesc = (primaryTaxonomy?.taxonomy_description || '').toLowerCase();
  
  const isFacilityBased = facilitySpecialties.some(s => taxonomyDesc.includes(s));
  const isOfficeBased = officeSpecialties.some(s => taxonomyDesc.includes(s));

  if (isOfficeBased && !isFacilityBased) {
    signals.push({
      label: 'Office-Based Practice',
      icon: Building2,
      color: 'text-teal-600',
      description: 'Primary care or outpatient specialty indicates office-based workflow',
      strength: 'Strong'
    });
  } else if (isFacilityBased) {
    signals.push({
      label: 'Facility-Based Practice',
      icon: Building2,
      color: 'text-orange-600',
      description: 'Hospital-based specialty may have different referral patterns',
      strength: 'Moderate'
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Referral Likelihood Signals
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {signals.length === 0 ? (
          <p className="text-sm text-gray-500">
            Insufficient data to generate referral likelihood signals
          </p>
        ) : (
          <>
            {signals.map((signal, idx) => {
              const Icon = signal.icon;
              return (
                <div key={idx} className="p-3 rounded-lg border">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Icon className={`h-5 w-5 ${signal.color}`} />
                      <span className="font-medium">{signal.label}</span>
                    </div>
                    <Badge variant={signal.strength === 'Strong' ? 'default' : 'outline'}>
                      {signal.strength}
                    </Badge>
                  </div>
                  <p className="text-sm text-gray-600 ml-7">{signal.description}</p>
                </div>
              );
            })}

            <div className="pt-3 border-t">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Overall Referral Propensity</span>
                <Badge className="bg-teal-100 text-teal-800">
                  {signals.filter(s => s.strength === 'Strong').length >= 2 ? 'High' : 'Moderate'}
                </Badge>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}