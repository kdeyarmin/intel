import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Network, MapPin, AlertCircle, TrendingUp } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function ReferralNetworkIntelligence() {
  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Network className="h-8 w-8 text-teal-600" />
          <h1 className="text-3xl font-bold text-gray-900">Referral Network Intelligence</h1>
          <Badge className="bg-orange-100 text-orange-800">Coming Soon</Badge>
        </div>
        <p className="text-gray-600">
          Analyze referral patterns, agency relationships, and market opportunities
        </p>
      </div>

      <Alert className="mb-6 bg-blue-50 border-blue-200">
        <AlertCircle className="h-4 w-4 text-blue-600" />
        <AlertDescription className="text-blue-900">
          This module will be activated once Medicare claims data integration is available. 
          The features below show what will be tracked.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Provider-Agency Relationship Map */}
        <Card className="border-2 border-dashed border-gray-300 bg-gray-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-gray-700">
              <Network className="h-5 w-5" />
              Provider → Agency Relationship Map
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-white rounded-lg p-4 border border-gray-200">
              <h3 className="font-semibold text-gray-900 mb-2">What This Will Show:</h3>
              <ul className="text-sm text-gray-600 space-y-1.5 list-disc list-inside">
                <li>Network graph of referring providers and their destination agencies</li>
                <li>Referral volume by provider-agency pair (claims-based)</li>
                <li>Provider concentration metrics (% of referrals to top agencies)</li>
                <li>Time-series trends in referral patterns</li>
              </ul>
            </div>
            <div className="text-xs text-gray-500 italic">
              📊 Visualization: Interactive network diagram with nodes sized by referral volume
            </div>
          </CardContent>
        </Card>

        {/* Top Receiving Agencies */}
        <Card className="border-2 border-dashed border-gray-300 bg-gray-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-gray-700">
              <TrendingUp className="h-5 w-5" />
              Top Receiving Agencies
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-white rounded-lg p-4 border border-gray-200">
              <h3 className="font-semibold text-gray-900 mb-2">What This Will Show:</h3>
              <ul className="text-sm text-gray-600 space-y-1.5 list-disc list-inside">
                <li>Ranked list of Home Health & Hospice agencies by inbound referrals</li>
                <li>Geographic proximity to referring providers (distance analysis)</li>
                <li>Market density: referrals per square mile</li>
                <li>Agency market share by county/ZIP</li>
              </ul>
            </div>
            <div className="text-xs text-gray-500 italic">
              📊 Visualization: Table with map overlay showing agency service areas
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Referral Leakage Analysis */}
      <Card className="border-2 border-dashed border-gray-300 bg-gray-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-gray-700">
            <MapPin className="h-5 w-5" />
            Referral Leakage Analysis
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <h3 className="font-semibold text-gray-900 mb-2">What This Will Show:</h3>
            <ul className="text-sm text-gray-600 space-y-1.5 list-disc list-inside">
              <li>Providers referring outside Pennsylvania priority territory</li>
              <li>Out-of-state vs in-state referral volume breakdown</li>
              <li>Distance-based leakage: referrals to agencies 50+ miles away</li>
              <li>Opportunity sizing: estimated recoverable referral volume</li>
              <li>Competitive threat analysis: agencies capturing PA-based referrals</li>
            </ul>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <p className="text-sm text-amber-900">
              <strong>Use Case:</strong> Identify high-value providers currently referring to competitors or 
              out-of-territory agencies. Prioritize outreach to recover leakage.
            </p>
          </div>
          <div className="text-xs text-gray-500 italic">
            📊 Visualization: Geographic heat map showing referral flow patterns with leakage indicators
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6 bg-teal-50 border-teal-200">
        <CardHeader>
          <CardTitle className="text-teal-900">Data Requirements</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-teal-800 mb-3">
            To activate this module, the following data sources are required:
          </p>
          <ul className="text-sm text-teal-700 space-y-2">
            <li className="flex items-start gap-2">
              <Badge variant="outline" className="mt-0.5">Required</Badge>
              <span>Medicare Part A claims data (Home Health & Hospice episodes)</span>
            </li>
            <li className="flex items-start gap-2">
              <Badge variant="outline" className="mt-0.5">Required</Badge>
              <span>Referring physician NPI on claims (ordering/referring field)</span>
            </li>
            <li className="flex items-start gap-2">
              <Badge variant="outline" className="mt-0.5">Optional</Badge>
              <span>Agency service area definitions (ZIP/county coverage)</span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}