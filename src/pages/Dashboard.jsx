import React, { useMemo } from 'react';
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
    staleTime: 60000,
  });

  const { data: utilization = [], isLoading: loadingUtil } = useQuery({
    queryKey: ['utilization'],
    queryFn: () => base44.entities.CMSUtilization.list(),
    staleTime: 60000,
  });

  const { data: locations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: () => base44.entities.ProviderLocation.list(),
    staleTime: 60000,
  });

  const { data: auditEvents = [] } = useQuery({
    queryKey: ['auditEvents'],
    queryFn: () => base44.entities.AuditEvent.list('-created_date', 5),
    staleTime: 60000,
  });

  const totalProviders = providers.length;
  const activeMedicare = utilization.filter(u => u.total_medicare_beneficiaries > 0).length;
  
  const topStates = useMemo(() => {
    const stateCount = {};
    locations.forEach(loc => {
      if (loc.state) {
        stateCount[loc.state] = (stateCount[loc.state] || 0) + 1;
      }
    });
    return Object.entries(stateCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [locations]);

  const lastRefresh = auditEvents[0]?.created_date 
    ? new Date(auditEvents[0].created_date).toLocaleDateString() 
    : 'Never';

  const kpis = [
    {
      title: 'Total Providers',
      value: totalProviders.toLocaleString(),
      icon: Users,
      gradient: 'bg-gray-100',
      textColor: 'text-gray-900',
      subtextColor: 'text-gray-500',
      iconBg: 'bg-blue-100',
      iconColor: 'text-blue-600',
    },
    {
      title: 'Active Medicare',
      value: activeMedicare.toLocaleString(),
      icon: Activity,
      gradient: 'bg-gray-100',
      textColor: 'text-gray-900',
      subtextColor: 'text-gray-500',
      iconBg: 'bg-indigo-100',
      iconColor: 'text-indigo-600',
    },
    {
      title: 'Top State',
      value: topStates[0]?.[0] || 'N/A',
      subtitle: topStates[0]?.[1] ? `${topStates[0][1]} providers` : '',
      icon: MapPin,
      gradient: 'bg-gray-100',
      textColor: 'text-gray-900',
      subtextColor: 'text-gray-500',
      iconBg: 'bg-sky-100',
      iconColor: 'text-sky-600',
    },
    {
      title: 'Last Refresh',
      value: lastRefresh,
      icon: Calendar,
      gradient: 'bg-gray-100',
      textColor: 'text-gray-900',
      subtextColor: 'text-gray-500',
      iconBg: 'bg-violet-100',
      iconColor: 'text-violet-600',
    },
  ];

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-1">CareMetric Provider Intelligence Overview</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Card key={kpi.title} className={`overflow-hidden border shadow-sm ${kpi.gradient}`}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className={`text-sm font-medium ${kpi.subtextColor}`}>
                    {kpi.title}
                  </CardTitle>
                  <div className={`${kpi.iconBg} p-2.5 rounded-lg`}>
                    <Icon className={`w-5 h-5 ${kpi.iconColor}`} />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {loadingProviders || loadingUtil ? (
                  <Skeleton className="h-8 w-24" />
                ) : (
                  <>
                    <div className={`text-3xl font-bold ${kpi.textColor}`}>{kpi.value}</div>
                    {kpi.subtitle && (
                      <p className={`text-sm ${kpi.subtextColor} mt-1`}>{kpi.subtitle}</p>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card className="bg-white border-gray-200/80 shadow-sm">
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
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-semibold">
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

        <Card className="bg-white border-gray-200/80 shadow-sm">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {auditEvents.length > 0 ? (
              <div className="space-y-3">
                {auditEvents.slice(0, 5).map((event) => (
                  <div key={event.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                    <div className="w-2 h-2 rounded-full bg-blue-500 mt-2" />
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
      </div>

      <div className="grid grid-cols-1 gap-6">
        <DataQualityWidget />
      </div>


    </div>
  );
}