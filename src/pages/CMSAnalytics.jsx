import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Database, Activity, Users, DollarSign, Building2, ArrowRightLeft, MapPin, FileText, Pill, Globe } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend, Treemap
} from 'recharts';
import PageHeader from '../components/shared/PageHeader';

const COLORS = ['#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#ef4444', '#f97316', '#14b8a6', '#a855f7', '#6366f1', '#84cc16', '#e879f9', '#22d3ee', '#fbbf24'];

function formatCurrency(v) {
  if (v >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v}`;
}

function formatNumber(v) {
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return String(v);
}

function KPICard({ icon: Icon, label, value, color }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-xs text-slate-400">{label}</p>
          <p className="text-xl lg:text-2xl font-bold text-slate-100">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

const AGGREGATE_DATASET_CONFIG = {
  market_saturation_county: { label: 'Market Saturation (County)', icon: MapPin, iconCls: 'text-emerald-400', badgeCls: 'bg-emerald-900/30 text-emerald-400 border-emerald-500/30', description: 'Provider market saturation analysis by county' },
  market_saturation_cbsa: { label: 'Market Saturation (CBSA)', icon: Globe, iconCls: 'text-emerald-400', badgeCls: 'bg-emerald-900/30 text-emerald-400 border-emerald-500/30', description: 'Provider market saturation by core-based statistical area' },
  medicare_fee_for_service_enrollment: { label: 'FFS Enrollment', icon: Users, iconCls: 'text-blue-400', badgeCls: 'bg-blue-900/30 text-blue-400 border-blue-500/30', description: 'Medicare fee-for-service enrollment by geography' },
  medicare_monthly_enrollment: { label: 'Monthly Enrollment', icon: Users, iconCls: 'text-blue-400', badgeCls: 'bg-blue-900/30 text-blue-400 border-blue-500/30', description: 'Medicare monthly enrollment trends' },
  nppes_registry: { label: 'NPPES Registry', icon: FileText, iconCls: 'text-slate-400', badgeCls: 'bg-slate-700/30 text-slate-400 border-slate-500/30', description: 'National provider registry reference data' },
  provider_taxonomy_crosswalk: { label: 'Taxonomy Crosswalk', icon: FileText, iconCls: 'text-slate-400', badgeCls: 'bg-slate-700/30 text-slate-400 border-slate-500/30', description: 'Provider taxonomy classification reference' },
};

function AggregateDatasetSection({ datasets }) {
  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Globe className="w-4 h-4 text-emerald-400" />
          Geographic & Reference Datasets
        </CardTitle>
        <CardDescription>Market analysis, enrollment, and reference data imported from CMS</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {datasets.map(ds => {
            const config = AGGREGATE_DATASET_CONFIG[ds.facility_type] || {
              label: ds.facility_type.replace(/_/g, ' '),
              icon: Database,
              iconCls: 'text-slate-400',
              badgeCls: 'bg-slate-700/30 text-slate-400 border-slate-500/30',
              description: '',
            };
            const Icon = config.icon;
            return (
              <div key={ds.facility_type} className="p-4 rounded-lg border border-slate-700/50 bg-slate-800/30">
                <div className="flex items-center gap-2 mb-2">
                  <Icon className={`w-4 h-4 ${config.iconCls}`} />
                  <p className="text-sm text-slate-200 font-medium">{config.label}</p>
                </div>
                {config.description && (
                  <p className="text-[10px] text-slate-400 mb-2">{config.description}</p>
                )}
                <div className="flex items-center gap-3">
                  <div>
                    <p className="text-lg font-bold text-slate-100">{formatNumber(ds.record_count)}</p>
                    <p className="text-[10px] text-slate-400">records</p>
                  </div>
                  {ds.state_count > 0 && (
                    <div className="border-l border-slate-700/50 pl-3">
                      <p className="text-sm font-semibold text-slate-200">{ds.state_count}</p>
                      <p className="text-[10px] text-slate-400">states</p>
                    </div>
                  )}
                  {ds.latest_year && (
                    <div className="border-l border-slate-700/50 pl-3">
                      <p className="text-sm font-semibold text-slate-200">{ds.latest_year}</p>
                      <p className="text-[10px] text-slate-400">latest</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default function CMSAnalytics() {
  const { data, isLoading } = useQuery({
    queryKey: ['cmsAnalytics'],
    queryFn: () => base44.functions.invoke('getCMSAnalytics', {}),
    staleTime: 300000,
  });

  const analytics = data?.data || data || {};
  const utilization = analytics.utilization || {};
  const referrals = analytics.referrals || {};
  const facilities = analytics.facilities || {};
  const tableCounts = analytics.tableCounts || {};
  const summary = utilization.summary || {};
  const topServices = utilization.topServices || [];
  const topReferred = referrals.topReferred || [];
  const facilityTypes = facilities.byType || [];
  const aggregateDatasets = analytics.aggregateDatasets || [];

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      <PageHeader
        title="CMS Data Analytics"
        subtitle="Visualize Medicare datasets across programs and years"
        icon={BarChart3}
        breadcrumbs={[{ label: 'Analytics', page: 'AdvancedAnalytics' }, { label: 'CMS Data' }]}
      />

      {isLoading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1,2,3,4].map(i => <Skeleton key={i} className="h-20" />)}
          </div>
          <Skeleton className="h-80" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KPICard
              icon={Activity}
              label="Service Types"
              value={formatNumber(summary.unique_service_types || 0)}
              color="bg-cyan-500/20 text-cyan-400"
            />
            <KPICard
              icon={Users}
              label="Unique Providers"
              value={formatNumber(summary.unique_providers || 0)}
              color="bg-blue-500/20 text-blue-400"
            />
            <KPICard
              icon={DollarSign}
              label="Total Medicare Payments"
              value={formatCurrency(summary.total_payments || 0)}
              color="bg-emerald-500/20 text-emerald-400"
            />
            <KPICard
              icon={Database}
              label="Total Records"
              value={formatNumber(
                (tableCounts.provider_service_utilization || 0) +
                (tableCounts.cms_referrals || 0) +
                (tableCounts.medicare_facilities || 0)
              )}
              color="bg-violet-500/20 text-violet-400"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <div className="w-2 h-2 bg-cyan-500 rounded-full" />
                  Top Specialties by Medicare Payment
                </CardTitle>
                <CardDescription>Provider service utilization across {formatNumber(summary.unique_providers || 0)} providers</CardDescription>
              </CardHeader>
              <CardContent>
                {topServices.length === 0 ? (
                  <div className="text-center py-12 text-slate-400 text-sm">No utilization data available</div>
                ) : (
                  <ResponsiveContainer width="100%" height={360}>
                    <BarChart data={topServices.slice(0, 12)} layout="vertical" margin={{ left: 120, right: 20, top: 5, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis type="number" fontSize={10} tick={{ fill: '#64748b' }}
                        tickFormatter={formatCurrency}
                      />
                      <YAxis type="category" dataKey="service_type" fontSize={10} tick={{ fill: '#94a3b8' }} width={115} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                        labelStyle={{ color: '#e2e8f0' }}
                        formatter={(v, name) => [name === 'total_payments' ? formatCurrency(v) : formatNumber(v), name === 'total_payments' ? 'Payments' : name === 'total_services' ? 'Services' : 'Providers']}
                      />
                      <Bar dataKey="total_payments" fill="#06b6d4" name="total_payments" radius={[0,4,4,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <div className="w-2 h-2 bg-violet-500 rounded-full" />
                  Service Volume by Specialty
                </CardTitle>
                <CardDescription>Total services rendered per specialty</CardDescription>
              </CardHeader>
              <CardContent>
                {topServices.length === 0 ? (
                  <div className="text-center py-12 text-slate-400 text-sm">No data available</div>
                ) : (
                  <ResponsiveContainer width="100%" height={360}>
                    <PieChart>
                      <Pie
                        data={topServices.slice(0, 10).map(s => ({ ...s, name: s.service_type }))}
                        cx="50%" cy="50%" outerRadius={120} innerRadius={60}
                        dataKey="total_services" paddingAngle={2}
                      >
                        {topServices.slice(0, 10).map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                        formatter={(v) => [formatNumber(v), 'Services']}
                      />
                      <Legend
                        formatter={(value) => <span className="text-xs text-slate-400">{value}</span>}
                        wrapperStyle={{ fontSize: 10 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full" />
                  Provider Count by Specialty
                </CardTitle>
                <CardDescription>Number of providers billing per specialty</CardDescription>
              </CardHeader>
              <CardContent>
                {topServices.length === 0 ? (
                  <div className="text-center py-12 text-slate-400 text-sm">No data available</div>
                ) : (
                  <ResponsiveContainer width="100%" height={360}>
                    <BarChart data={topServices.slice(0, 12)} margin={{ top: 5, right: 10, left: 10, bottom: 80 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="service_type" fontSize={9} tick={{ fill: '#64748b', angle: -45, textAnchor: 'end' }} interval={0} height={80} />
                      <YAxis fontSize={10} tick={{ fill: '#64748b' }} tickFormatter={formatNumber} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                        formatter={(v) => [formatNumber(v), 'Providers']}
                      />
                      <Bar dataKey="provider_count" fill="#10b981" radius={[4,4,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <div className="w-2 h-2 bg-amber-500 rounded-full" />
                  Top Referred-To Providers
                </CardTitle>
                <CardDescription>Providers receiving the most referrals ({formatNumber(referrals.totalRecords || 0)} total referral records)</CardDescription>
              </CardHeader>
              <CardContent>
                {topReferred.length === 0 ? (
                  <div className="text-center py-12 text-slate-400 text-sm">No referral data available</div>
                ) : (
                  <ResponsiveContainer width="100%" height={360}>
                    <BarChart data={topReferred.map(r => ({ ...r, label: `...${r.npi.slice(-4)}` }))} layout="vertical" margin={{ left: 50, right: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis type="number" fontSize={10} tick={{ fill: '#64748b' }} tickFormatter={formatNumber} />
                      <YAxis type="category" dataKey="label" fontSize={10} tick={{ fill: '#94a3b8' }} width={45} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                        labelFormatter={(_, payload) => payload?.[0]?.payload?.npi || ''}
                        formatter={(v) => [formatNumber(v), 'Referral Records']}
                      />
                      <Bar dataKey="referral_records" fill="#f59e0b" radius={[0,4,4,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <div className="w-2 h-2 bg-rose-500 rounded-full" />
                  Medicare Facility Data by Type
                </CardTitle>
                <CardDescription>Distribution of {formatNumber(tableCounts.medicare_facilities || 0)} facility records across dataset types</CardDescription>
              </CardHeader>
              <CardContent>
                {facilityTypes.length === 0 ? (
                  <div className="text-center py-12 text-slate-400 text-sm">No facility data available</div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={facilityTypes} margin={{ top: 5, right: 10, left: 10, bottom: 80 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="type" fontSize={9} tick={{ fill: '#64748b', angle: -45, textAnchor: 'end' }} interval={0} height={80} />
                      <YAxis fontSize={10} tick={{ fill: '#64748b' }} tickFormatter={formatNumber} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                        formatter={(v) => [formatNumber(v), 'Records']}
                      />
                      <Bar dataKey="count" radius={[4,4,0,0]}>
                        {facilityTypes.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Database className="w-4 h-4 text-slate-400" />
                  Dataset Summary
                </CardTitle>
                <CardDescription>Record counts across all CMS data tables</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {[
                    { label: 'Provider Service Utilization', count: tableCounts.provider_service_utilization, color: 'bg-cyan-500' },
                    { label: 'Medicare Facilities', count: tableCounts.medicare_facilities, color: 'bg-violet-500' },
                    { label: 'CMS Referrals', count: tableCounts.cms_referrals, color: 'bg-amber-500' },
                  ].map(ds => (
                    <div key={ds.label} className="p-4 rounded-lg border border-slate-700/50 bg-slate-800/30">
                      <div className="flex items-center gap-2 mb-2">
                        <div className={`w-2 h-2 rounded-full ${ds.color}`} />
                        <p className="text-sm text-slate-300 font-medium">{ds.label}</p>
                      </div>
                      <p className="text-2xl font-bold text-slate-100">{formatNumber(ds.count || 0)}</p>
                      <p className="text-xs text-slate-400 mt-1">{(ds.count || 0).toLocaleString()} records</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {aggregateDatasets.length > 0 && (
              <AggregateDatasetSection datasets={aggregateDatasets} />
            )}
          </div>
        </>
      )}
    </div>
  );
}
