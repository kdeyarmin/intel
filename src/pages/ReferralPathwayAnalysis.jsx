import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  TrendingUp, 
  AlertTriangle, 
  Target, 
  Network, 
  Search,
  RefreshCw,
  Building2,
  ArrowRight
} from 'lucide-react';
import ComplianceDisclaimer from '../components/compliance/ComplianceDisclaimer';

export default function ReferralPathwayAnalysis() {
  const [searchNPI, setSearchNPI] = useState('');
  const [selectedNPI, setSelectedNPI] = useState(null);
  const queryClient = useQueryClient();

  const { data: providers = [] } = useQuery({
    queryKey: ['rpaProviders'],
    queryFn: () => base44.entities.Provider.list('-created_date', 500),
    staleTime: 120000,
  });

  const { data: analyses = [], isLoading: loadingAnalyses } = useQuery({
    queryKey: ['referralAnalyses'],
    queryFn: () => base44.entities.ReferralPathwayAnalysis.list('-analysis_date', 50),
  });

  const { data: preferredAgencies = [] } = useQuery({
    queryKey: ['preferredAgencies'],
    queryFn: () => base44.entities.PreferredAgency.filter({ active: true }),
  });

  const analyzeMutation = useMutation({
    mutationFn: async (npi) => {
      const response = await base44.functions.invoke('analyzeReferralPathways', {
        provider_npi: npi,
        force_refresh: true
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['referralAnalyses']);
    },
  });

  const handleAnalyze = async () => {
    if (!searchNPI) {
      alert('Please enter a provider NPI');
      return;
    }
    setSelectedNPI(searchNPI);
    await analyzeMutation.mutateAsync(searchNPI);
  };

  const selectedAnalysis = selectedNPI 
    ? analyses.find(a => a.provider_npi === selectedNPI)
    : null;

  const selectedProvider = selectedNPI
    ? providers.find(p => p.npi === selectedNPI)
    : null;

  const providerName = selectedProvider?.entity_type === 'Organization'
    ? selectedProvider.organization_name
    : `${selectedProvider?.first_name || ''} ${selectedProvider?.last_name || ''}`.trim();

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">AI Referral Pathway Analysis</h1>
        <p className="text-gray-600 mt-1">
          AI-powered analysis of referral patterns, predictions, and network leakage detection
        </p>
      </div>

      <div className="mb-6">
        <ComplianceDisclaimer />
      </div>

      {/* Search & Analyze */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Analyze Provider Referral Patterns
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <Input
              placeholder="Enter Provider NPI"
              value={searchNPI}
              onChange={(e) => setSearchNPI(e.target.value)}
              className="flex-1"
            />
            <Button 
              onClick={handleAnalyze}
              disabled={analyzeMutation.isPending}
              className="bg-teal-600 hover:bg-teal-700"
            >
              {analyzeMutation.isPending ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Target className="w-4 h-4 mr-2" />
                  Analyze
                </>
              )}
            </Button>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            AI will analyze referral history, predict next destinations, and detect network leakage
          </p>
        </CardContent>
      </Card>

      {/* Analysis Results */}
      {analyzeMutation.isPending && (
        <div className="space-y-6">
          <Skeleton className="h-48" />
          <Skeleton className="h-64" />
        </div>
      )}

      {selectedAnalysis && !analyzeMutation.isPending && (
        <div className="space-y-6">
          {/* Provider Header */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{providerName || `Provider ${selectedNPI}`}</CardTitle>
                  <p className="text-sm text-gray-500 mt-1">
                    NPI: {selectedNPI} • Analysis: {new Date(selectedAnalysis.analysis_date).toLocaleDateString()}
                  </p>
                </div>
                <Badge className={selectedAnalysis.leakage_detected ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}>
                  {selectedAnalysis.leakage_detected ? 'Leakage Detected' : 'Network Aligned'}
                </Badge>
              </div>
            </CardHeader>
          </Card>

          {/* Leakage Alert */}
          {selectedAnalysis.leakage_detected && (
            <Alert className="border-red-200 bg-red-50">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-900">
                <strong>Network Leakage Detected:</strong>{' '}
                {selectedAnalysis.leakage_details?.out_of_network_percentage?.toFixed(1)}% 
                ({selectedAnalysis.leakage_details?.out_of_network_count} referrals) going outside preferred network
              </AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Destinations */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Top Referral Destinations
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {selectedAnalysis.top_destinations?.slice(0, 5).map((dest, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold ${
                          dest.in_network ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {idx + 1}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{dest.agency_name}</p>
                          <p className="text-xs text-gray-500">{dest.agency_type}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-gray-900">{dest.percentage?.toFixed(1)}%</p>
                        <p className="text-xs text-gray-500">{dest.referral_count} referrals</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* AI Prediction */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  AI-Predicted Next Referral
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="p-4 bg-gradient-to-br from-teal-50 to-blue-50 rounded-lg border border-teal-200">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-gray-900">
                      {selectedAnalysis.predicted_next_referral?.agency_name}
                    </h3>
                    <Badge className="bg-teal-600">
                      {selectedAnalysis.predicted_next_referral?.probability?.toFixed(0)}% likely
                    </Badge>
                  </div>
                  <p className="text-sm text-gray-600 mb-3">
                    {selectedAnalysis.predicted_next_referral?.agency_type}
                  </p>
                  <div className="p-3 bg-white/70 rounded border border-teal-100">
                    <p className="text-xs font-medium text-gray-700 mb-1">AI Reasoning:</p>
                    <p className="text-xs text-gray-600">
                      {selectedAnalysis.predicted_next_referral?.reasoning}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Referral Pattern */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Network className="h-5 w-5" />
                Referral Pattern Analysis
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="p-3 bg-blue-50 rounded-lg">
                  <p className="text-xs text-blue-600 font-medium">Pattern Type</p>
                  <p className="text-lg font-bold text-blue-900 mt-1">
                    {selectedAnalysis.referral_pattern}
                  </p>
                </div>
                <div className="p-3 bg-purple-50 rounded-lg">
                  <p className="text-xs text-purple-600 font-medium">Total Analyzed</p>
                  <p className="text-lg font-bold text-purple-900 mt-1">
                    {selectedAnalysis.total_referrals_analyzed} referrals
                  </p>
                </div>
                <div className="p-3 bg-green-50 rounded-lg">
                  <p className="text-xs text-green-600 font-medium">In-Network Rate</p>
                  <p className="text-lg font-bold text-green-900 mt-1">
                    {selectedAnalysis.leakage_details?.out_of_network_percentage 
                      ? (100 - selectedAnalysis.leakage_details.out_of_network_percentage).toFixed(1)
                      : '100'}%
                  </p>
                </div>
              </div>

              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-sm font-medium text-gray-700 mb-2">AI Insights:</p>
                <p className="text-sm text-gray-600">{selectedAnalysis.ai_insights}</p>
              </div>
            </CardContent>
          </Card>

          {/* Recommendations */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                AI Engagement Recommendations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {selectedAnalysis.recommendations?.map((rec, idx) => (
                  <div key={idx} className="flex items-start gap-3 p-3 bg-gradient-to-r from-teal-50 to-blue-50 rounded-lg">
                    <ArrowRight className="w-5 h-5 text-teal-600 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-gray-700">{rec}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Leakage Details */}
          {selectedAnalysis.leakage_detected && selectedAnalysis.leakage_details?.top_leakage_destinations?.length > 0 && (
            <Card className="border-red-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-red-900">
                  <AlertTriangle className="h-5 w-5" />
                  Top Leakage Destinations
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {selectedAnalysis.leakage_details.top_leakage_destinations.map((dest, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                      <p className="font-medium text-gray-900">{dest.agency_name}</p>
                      <Badge variant="outline" className="border-red-300 text-red-700">
                        {dest.referral_count} referrals
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Recent Analyses */}
      {!selectedNPI && !analyzeMutation.isPending && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Analyses</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingAnalyses ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-16" />)}
              </div>
            ) : analyses.length === 0 ? (
              <p className="text-gray-500 text-center py-8">
                No analyses yet. Enter a provider NPI above to start.
              </p>
            ) : (
              <div className="space-y-2">
                {analyses.slice(0, 10).map((analysis) => {
                  const provider = providers.find(p => p.npi === analysis.provider_npi);
                  const name = provider?.entity_type === 'Organization'
                    ? provider.organization_name
                    : `${provider?.first_name || ''} ${provider?.last_name || ''}`.trim() || analysis.provider_npi;

                  return (
                    <div 
                      key={analysis.id}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer"
                      onClick={() => setSelectedNPI(analysis.provider_npi)}
                    >
                      <div>
                        <p className="font-medium text-gray-900">{name}</p>
                        <p className="text-xs text-gray-500">
                          NPI: {analysis.provider_npi} • {new Date(analysis.analysis_date).toLocaleDateString()}
                        </p>
                      </div>
                      <Badge className={analysis.leakage_detected ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}>
                        {analysis.leakage_detected ? 'Leakage' : 'Aligned'}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Preferred Network Summary */}
      {preferredAgencies.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Preferred Agency Network ({preferredAgencies.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {preferredAgencies.slice(0, 6).map((agency) => (
                <div key={agency.id} className="p-3 bg-gradient-to-br from-green-50 to-teal-50 rounded-lg border border-green-200">
                  <p className="font-medium text-gray-900">{agency.agency_name}</p>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-xs text-gray-600">{agency.agency_type}</p>
                    <Badge variant="outline" className="text-xs">
                      {agency.network_tier}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}