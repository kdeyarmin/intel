import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { User, MapPin, Phone, Award, TrendingUp } from 'lucide-react';
import ScoreBreakdown from '../components/providers/ScoreBreakdown';

export default function ProviderDetail() {
  const [provider, setProvider] = useState(null);
  const [score, setScore] = useState(null);
  const [location, setLocation] = useState(null);
  const [utilization, setUtilization] = useState(null);
  const [referrals, setReferrals] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      const params = new URLSearchParams(window.location.search);
      const npi = params.get('npi');
      
      if (!npi) return;

      const [providerData, scoreData, locationData, utilizationData, referralData] = await Promise.all([
        base44.entities.Provider.filter({ npi }),
        base44.entities.LeadScore.filter({ npi }),
        base44.entities.ProviderLocation.filter({ npi }),
        base44.entities.CMSUtilization.filter({ npi }),
        base44.entities.CMSReferral.filter({ npi }),
      ]);

      setProvider(providerData[0]);
      setScore(scoreData[0]);
      setLocation(locationData[0]);
      setUtilization(utilizationData[0]);
      setReferrals(referralData[0]);
      setLoading(false);
    };

    loadData();
  }, []);

  if (loading) {
    return (
      <div className="p-8">
        <Skeleton className="h-10 w-64 mb-8" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-64" />)}
        </div>
      </div>
    );
  }

  if (!provider) {
    return (
      <div className="p-8">
        <p className="text-gray-500">Provider not found</p>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-teal-100 flex items-center justify-center">
            <User className="w-8 h-8 text-teal-600" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              {provider.entity_type === 'Individual' 
                ? `${provider.first_name} ${provider.last_name}, ${provider.credential || ''}`
                : provider.organization_name}
            </h1>
            <p className="text-gray-600">NPI: {provider.npi}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Score Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="w-5 h-5 text-teal-600" />
              CareMetric Fit Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            {score ? (
              <div className="text-center">
                <div className="text-5xl font-bold text-teal-600 mb-2">
                  {score.score?.toFixed(0)}
                  <span className="text-2xl text-gray-400">/100</span>
                </div>
                <p className="text-xs text-gray-500">
                  Last updated: {new Date(score.score_date).toLocaleDateString()}
                </p>
              </div>
            ) : (
              <p className="text-gray-500">No score available</p>
            )}
          </CardContent>
        </Card>

        {/* Score Breakdown */}
        {score?.score_breakdown && (
          <ScoreBreakdown 
            breakdown={score.score_breakdown} 
            reasons={score.reasons}
          />
        )}

        {/* Practice Info Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-blue-600" />
              Practice Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            {location ? (
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-500">Address</p>
                  <p className="font-medium">{location.address_1}</p>
                  {location.address_2 && <p className="font-medium">{location.address_2}</p>}
                  <p className="font-medium">
                    {location.city}, {location.state} {location.zip}
                  </p>
                </div>
                {location.phone && (
                  <div>
                    <p className="text-sm text-gray-500">Phone</p>
                    <p className="font-medium">{location.phone}</p>
                  </div>
                )}
                {location.fax && (
                  <div>
                    <p className="text-sm text-gray-500">Fax</p>
                    <p className="font-medium">{location.fax}</p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-gray-500">No location data available</p>
            )}
          </CardContent>
        </Card>

        {/* CMS Utilization Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-purple-600" />
              Medicare Utilization
            </CardTitle>
          </CardHeader>
          <CardContent>
            {utilization ? (
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Total Services</span>
                  <span className="font-semibold">{utilization.total_services?.toLocaleString() || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Medicare Beneficiaries</span>
                  <span className="font-semibold">{utilization.total_medicare_beneficiaries?.toLocaleString() || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Medicare Payment</span>
                  <span className="font-semibold">
                    ${utilization.total_medicare_payment?.toLocaleString() || 0}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Year</span>
                  <Badge>{utilization.year}</Badge>
                </div>
              </div>
            ) : (
              <p className="text-gray-500">No utilization data available</p>
            )}
          </CardContent>
        </Card>

        {/* CMS Referrals Card */}
        <Card>
          <CardHeader>
            <CardTitle>Referral Patterns</CardTitle>
          </CardHeader>
          <CardContent>
            {referrals ? (
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Total Referrals</span>
                  <span className="font-semibold">{referrals.total_referrals?.toLocaleString() || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Home Health</span>
                  <span className="font-semibold">{referrals.home_health_referrals?.toLocaleString() || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Hospice</span>
                  <span className="font-semibold">{referrals.hospice_referrals?.toLocaleString() || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">SNF</span>
                  <span className="font-semibold">{referrals.snf_referrals?.toLocaleString() || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Imaging</span>
                  <span className="font-semibold">{referrals.imaging_referrals?.toLocaleString() || 0}</span>
                </div>
              </div>
            ) : (
              <p className="text-gray-500">No referral data available</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}