import React, { useState, useMemo, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Loader2, AlertCircle, Upload, Database } from 'lucide-react';
import ImportCategoryCards from '../components/dataCenter/ImportCategoryCards';
import QuickImportFlow from '../components/dataCenter/QuickImportFlow';
import RecentImportsList from '../components/dataCenter/RecentImportsList';

export default function DataCenter() {
  const [activeCategory, setActiveCategory] = useState(null);
  const queryClient = useQueryClient();

  const { data: batches = [], isLoading } = useQuery({
    queryKey: ['dataCenterBatches'],
    queryFn: () => base44.entities.ImportBatch.list('-created_date', 100),
    refetchInterval: 10000,
  });

  useEffect(() => {
    const unsub = base44.entities.ImportBatch.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: ['dataCenterBatches'] });
    });
    return unsub;
  }, [queryClient]);

  const stats = useMemo(() => {
    const active = batches.filter(b => b.status === 'processing' || b.status === 'validating').length;
    const completed = batches.filter(b => b.status === 'completed').length;
    const failed = batches.filter(b => b.status === 'failed').length;
    const totalImported = batches.reduce((s, b) => s + (b.imported_rows || 0), 0);
    return { active, completed, failed, totalImported };
  }, [batches]);

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="mb-0">
        <div className="flex items-center gap-3 mb-1">
          <div className="p-2 rounded-xl bg-cyan-500/10">
            <Database className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Data Center</h1>
            <p className="text-sm text-slate-400 mt-0.5">One place to import all your data — pick a category, upload, and go</p>
          </div>
        </div>
      </div>

      {/* Stats Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-[#141d30] border-slate-700/50">
          <CardContent className="pt-3 pb-3">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">Active</p>
            <div className="flex items-center gap-2 mt-1">
              {stats.active > 0 ? <Loader2 className="w-4 h-4 text-blue-400 animate-spin" /> : <div className="w-4 h-4" />}
              <span className="text-xl font-bold text-blue-400">{stats.active}</span>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-[#141d30] border-slate-700/50">
          <CardContent className="pt-3 pb-3">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">Completed</p>
            <div className="flex items-center gap-2 mt-1">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span className="text-xl font-bold text-emerald-400">{stats.completed}</span>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-[#141d30] border-slate-700/50">
          <CardContent className="pt-3 pb-3">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">Failed</p>
            <div className="flex items-center gap-2 mt-1">
              <AlertCircle className="w-4 h-4 text-red-400" />
              <span className="text-xl font-bold text-red-400">{stats.failed}</span>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-[#141d30] border-slate-700/50">
          <CardContent className="pt-3 pb-3">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">Records Imported</p>
            <div className="flex items-center gap-2 mt-1">
              <Upload className="w-4 h-4 text-cyan-400" />
              <span className="text-xl font-bold text-white">{stats.totalImported.toLocaleString()}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Import Categories or Active Flow */}
      {activeCategory ? (
        <QuickImportFlow
          category={activeCategory}
          onClose={() => setActiveCategory(null)}
          onComplete={() => {
            setActiveCategory(null);
            queryClient.invalidateQueries({ queryKey: ['dataCenterBatches'] });
          }}
        />
      ) : (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Choose a data source to import</h2>
          <ImportCategoryCards onSelectCategory={setActiveCategory} />
        </div>
      )}

      {/* Recent Imports with AI quality checks and destination links */}
      <RecentImportsList batches={batches} showLimit={10} />
    </div>
  );
}