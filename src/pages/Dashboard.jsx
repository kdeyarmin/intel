import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Activity, MapPin, Calendar } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import DataQualityWidget from '../components/dashboard/DataQualityWidget';

export default function Dashboard() {
  const { data: providers = [], isLoading: loadingProviders } = useQuery({
    queryKey: ['providers'],
    queryFn: () => base44.entities.Provider.list(),
  });

  const { data: utilization = [], isLoading: loadingUtil } = useQuery({
    queryKey: ['utilization'],
    queryFn: () => base44.entities.CMSUtilization.list(),
  });

  const { data: auditEvents = [] } = useQuery({
    queryKey: ['auditEvents'],
    queryFn: () => base44.entities.AuditEvent.list('-created_date', 1),
  });

  const totalProviders = providers.length;
  const activeMedicare = utilization.filter(u => u.total_medicare_beneficiaries > 0).length;
  
  const stateCount = {};
  providers.forEach(p => {
    const locations = [];
    base44.entities.ProviderLocation.filter({ npi: p.npi }).then(locs => {
      locs.forEach(loc => {
        if (loc.state) {
          stateCount[loc.state] = (stateCount[loc.state] || 0) + 1;
        }
      });
    });
  });

  const topStates = Object.entries(stateCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const lastRefresh = auditEvents[0]?.created_date 
    ? new Date(auditEvents[0].created_date).toLocaleDateString() 
    : 'Never';

  const kpis = [
    {
      title: 'Total Providers',
      value: totalProviders.toLocaleString(),
      icon: Users,
      color: 'bg-teal-500',
    },
    {
      title: 'Active Medicare',
      value: activeMedicare.toLocaleString(),
      icon: Activity,
      color: 'bg-blue-500',
    },
    {
      title: 'Top State',
      value: topStates[0]?.[0] || 'N/A',
      subtitle: topStates[0]?.[1] ? `${topStates[0][1]} providers` : '',
      icon: MapPin,
      color: 'bg-purple-500',
    },
    {
      title: 'Last Refresh',
      value: lastRefresh,
      icon: Calendar,
      color: 'bg-orange-500',
    },
  ];

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-1">CareMetric Provider Intelligence Overview</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Card key={kpi.title} className="overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-gray-600">
                    {kpi.title}
                  </CardTitle>
                  <div className={`${kpi.color} p-3 rounded-lg`}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {loadingProviders || loadingUtil ? (
                  <Skeleton className="h-8 w-24" />
                ) : (
                  <>
                    <div className="text-3xl font-bold text-gray-900">{kpi.value}</div>
                    {kpi.subtitle && (
                      <p className="text-sm text-gray-500 mt-1">{kpi.subtitle}</p>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Top States by Provider Count</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingProviders ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : (
              <div className="space-y-3">
                {topStates.length > 0 ? (
                  topStates.map(([state, count], index) => (
                    <div key={state} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-semibold">
                          {index + 1}
                        </div>
                        <span className="font-medium text-gray-900">{state}</span>
                      </div>
                      <span className="text-gray-600">{count} providers</span>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-500 text-center py-8">No data available</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {auditEvents.length > 0 ? (
              <div className="space-y-3">
                {auditEvents.slice(0, 5).map((event) => (
                  <div key={event.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                    <div className="w-2 h-2 rounded-full bg-teal-500 mt-2" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900 capitalize">
                        {event.event_type?.replace('_', ' ')}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {event.user_email} • {new Date(event.created_date).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-8">No recent activity</p>
            )}
          </CardContent>
        </Card>

        <DataQualityWidget />
      </div>
    </div>
  );
}