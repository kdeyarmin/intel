import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { Building2, Database, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import DataSourcesFooter from '../components/compliance/DataSourcesFooter';
import PageHeader from '../components/shared/PageHeader';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell
} from 'recharts';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

export default function MAInpatientDashboard() {
  const [facilityFilter, setFacilityFilter] = useState('all');

  const { data: facilities = [], isLoading } = useQuery({
    queryKey: ['ma-facilities'],
    queryFn: () => base44.entities.MedicareFacility.list('-id', 500),
    staleTime: 120000,
  });

  const { data: recentBatches = [] } = useQuery({
    queryKey: ['ma-import-batches'],
    queryFn: () => base44.entities.ImportBatch.filter({ import_type: 'medicare_ma_inpatient' }, '-created_date', 10),
    staleTime: 120000,
  });

  const filteredData = useMemo(() => {
    if (facilityFilter === 'all') return facilities;
    return facilities.filter(f => f.facility_type === facilityFilter);
  }, [facilities, facilityFilter]);

  const facilityTypes = useMemo(() => {
    const types = {};
    facilities.forEach(f => {
      const t = f.facility_type || 'Unknown';
      types[t] = (types[t] || 0) + 1;
    });
    return Object.entries(types)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [facilities]);

  const stateDistribution = useMemo(() => {
    const states = {};
    filteredData.forEach(f => {
      const s = f.state || 'Unknown';
      states[s] = (states[s] || 0) + 1;
    });
    return Object.entries(states)
      .map(([state, count]) => ({ state, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);
  }, [filteredData]);

  const totalFacilities = filteredData.length;
  const uniqueStates = new Set(filteredData.map(f => f.state).filter(Boolean)).size;
  const uniqueTypes = new Set(filteredData.map(f => f.facility_type).filter(Boolean)).size;

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      <PageHeader
        title="Medicare Facility Intelligence"
        subtitle="Hospital and facility data from Medicare datasets"
        icon={Building2}
        breadcrumbs={[{ label: 'Analytics' }, { label: 'Facilities' }]}
      />

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-20 bg-slate-700/50" />)}
          </div>
          <Skeleton className="h-64 bg-slate-700/50" />
        </div>
      ) : facilities.length === 0 ? (
        <Card className="border-amber-800/30 bg-amber-900/10">
          <CardContent className="py-12 text-center">
            <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-white mb-2">No Facility Data Available</h3>
            <p className="text-sm text-slate-400 max-w-md mx-auto">
              Medicare facility records haven't been imported yet. Import data through the Data Center to populate this dashboard.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card>
              <CardContent className="py-4 px-4">
                <p className="text-xs text-slate-400">Total Records</p>
                <p className="text-2xl font-bold text-white">{totalFacilities.toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4 px-4">
                <p className="text-xs text-slate-400">Unique States</p>
                <p className="text-2xl font-bold text-white">{uniqueStates}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4 px-4">
                <p className="text-xs text-slate-400">Facility Types</p>
                <p className="text-2xl font-bold text-white">{uniqueTypes}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4 px-4">
                <p className="text-xs text-slate-400">Import Batches</p>
                <p className="text-2xl font-bold text-white">{recentBatches.length}</p>
              </CardContent>
            </Card>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-slate-400">Filter by type:</span>
            <button
              onClick={() => setFacilityFilter('all')}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${facilityFilter === 'all' ? 'bg-cyan-600 border-cyan-600 text-white' : 'border-slate-600 text-slate-400 hover:text-white'}`}
            >
              All
            </button>
            {facilityTypes.slice(0, 8).map(ft => (
              <button
                key={ft.name}
                onClick={() => setFacilityFilter(ft.name)}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${facilityFilter === ft.name ? 'bg-cyan-600 border-cyan-600 text-white' : 'border-slate-600 text-slate-400 hover:text-white'}`}
              >
                {ft.name} ({ft.count})
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Facilities by Type</CardTitle>
              </CardHeader>
              <CardContent>
                {facilityTypes.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie data={facilityTypes.slice(0, 8)} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}>
                        {facilityTypes.slice(0, 8).map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-64 flex items-center justify-center text-sm text-slate-400">No type data</div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Top States by Facility Count</CardTitle>
              </CardHeader>
              <CardContent>
                {stateDistribution.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={stateDistribution} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="state" width={50} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-64 flex items-center justify-center text-sm text-slate-400">No state data</div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Database className="w-4 h-4" /> Recent Records
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="text-left py-2 text-slate-400 font-medium">Provider ID</th>
                      <th className="text-left py-2 text-slate-400 font-medium">Facility Type</th>
                      <th className="text-left py-2 text-slate-400 font-medium">State</th>
                      <th className="text-left py-2 text-slate-400 font-medium">Dataset</th>
                      <th className="text-right py-2 text-slate-400 font-medium">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredData.slice(0, 20).map(f => (
                      <tr key={f.id} className="border-b border-slate-800 hover:bg-slate-800/50">
                        <td className="py-1.5 font-mono text-cyan-400">{f.provider_id || '-'}</td>
                        <td className="py-1.5 text-slate-300">{f.facility_type || '-'}</td>
                        <td className="py-1.5 text-slate-300">{f.state || '-'}</td>
                        <td className="py-1.5 text-slate-400">{f.dataset_name || '-'}</td>
                        <td className="py-1.5 text-right text-slate-500">{f.created_date ? new Date(f.created_date).toLocaleDateString() : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filteredData.length > 20 && (
                <p className="text-[10px] text-slate-500 text-center mt-2">Showing 20 of {filteredData.length.toLocaleString()} records</p>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <DataSourcesFooter />
    </div>
  );
}
