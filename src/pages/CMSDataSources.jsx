import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import PageHeader from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import {
  Database, Search, Download, CheckCircle2, Clock, AlertCircle,
  ChevronDown, ChevronRight, Filter, ArrowUpDown, Building2, Heart,
  Home, Stethoscope, Activity, Users, Pill, CircleDot
} from 'lucide-react';

const CATEGORY_ICONS = {
  "Physicians & Clinicians": Stethoscope,
  "Hospitals": Building2,
  "Home Health": Home,
  "Hospice": Heart,
  "Nursing Homes & SNF": Users,
  "Dialysis": CircleDot,
  "Other Facilities": Activity,
  "Medicare Programs": Pill,
};

const CATEGORY_COLORS = {
  "Physicians & Clinicians": "cyan",
  "Hospitals": "blue",
  "Home Health": "green",
  "Hospice": "violet",
  "Nursing Homes & SNF": "orange",
  "Dialysis": "red",
  "Other Facilities": "yellow",
  "Medicare Programs": "light-blue",
};

const PRIORITY_CONFIG = {
  high: { label: "High Priority", className: "bg-cyan-900/30 text-cyan-400 border-cyan-800/50" },
  medium: { label: "Medium", className: "bg-slate-800/50 text-slate-400 border-slate-700/50" },
  low: { label: "Low", className: "bg-slate-900/50 text-slate-500 border-slate-800/50" },
};

export default function CMSDataSources() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedPriority, setSelectedPriority] = useState('all');
  const [expandedCategories, setExpandedCategories] = useState(new Set());
  const [importingIds, setImportingIds] = useState(new Set());
  const [sortBy, setSortBy] = useState('priority');

  const { data: catalog, isLoading: catalogLoading } = useQuery({
    queryKey: ['cmsCatalog'],
    queryFn: () => base44.functions.invoke('getCMSDatasetCatalog', {}),
  });

  const { data: batches } = useQuery({
    queryKey: ['importBatches'],
    queryFn: () => base44.entities.ImportBatch.list('-created_date', 200),
    refetchInterval: 10000,
  });

  const importMutation = useMutation({
    mutationFn: async ({ importType, year }) => {
      return base44.functions.invoke('triggerImport', {
        import_type: importType,
        year: year || new Date().getFullYear() - 2,
      });
    },
    onSuccess: (data, variables) => {
      toast.success(`Import started for ${variables.importType}`);
      setImportingIds(prev => { const n = new Set(prev); n.delete(variables.importType); return n; });
      queryClient.invalidateQueries({ queryKey: ['importBatches'] });
    },
    onError: (error, variables) => {
      const msg = error?.data?.message || error?.data?.error || error?.message || 'Import failed';
      if (error?.status === 409 || error?.data?.conflict || msg.includes('already in progress')) {
        toast.info('This import is already running');
      } else {
        toast.error(msg);
      }
      setImportingIds(prev => { const n = new Set(prev); n.delete(variables.importType); return n; });
    },
  });

  const batchStatusMap = useMemo(() => {
    const map = {};
    if (batches) {
      for (const b of batches) {
        const key = b.import_type;
        if (!map[key] || new Date(b.created_date) > new Date(map[key].created_date)) {
          map[key] = b;
        }
      }
    }
    return map;
  }, [batches]);

  const datasets = catalog?.data?.datasets || catalog?.datasets || [];
  const categories = catalog?.data?.categories || catalog?.categories || [];

  const filteredDatasets = useMemo(() => {
    let filtered = datasets;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(ds =>
        ds.title.toLowerCase().includes(q) ||
        ds.description.toLowerCase().includes(q) ||
        ds.id.toLowerCase().includes(q)
      );
    }
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(ds => ds.category === selectedCategory);
    }
    if (selectedPriority !== 'all') {
      filtered = filtered.filter(ds => ds.priority === selectedPriority);
    }
    if (sortBy === 'priority') {
      const order = { high: 0, medium: 1, low: 2 };
      filtered = [...filtered].sort((a, b) => (order[a.priority] || 2) - (order[b.priority] || 2));
    } else if (sortBy === 'name') {
      filtered = [...filtered].sort((a, b) => a.title.localeCompare(b.title));
    } else if (sortBy === 'records') {
      const parseRecords = (r) => {
        const s = (r || '').replace(/[^0-9.KMB]/gi, '');
        let n = parseFloat(s) || 0;
        if (s.includes('B')) n *= 1e9;
        else if (s.includes('M')) n *= 1e6;
        else if (s.includes('K')) n *= 1e3;
        return n;
      };
      filtered = [...filtered].sort((a, b) => parseRecords(b.records) - parseRecords(a.records));
    }
    return filtered;
  }, [datasets, searchQuery, selectedCategory, selectedPriority, sortBy]);

  const groupedDatasets = useMemo(() => {
    const groups = {};
    for (const ds of filteredDatasets) {
      if (!groups[ds.category]) groups[ds.category] = [];
      groups[ds.category].push(ds);
    }
    return groups;
  }, [filteredDatasets]);

  const toggleCategory = (cat) => {
    setExpandedCategories(prev => {
      const n = new Set(prev);
      if (n.has(cat)) n.delete(cat); else n.add(cat);
      return n;
    });
  };

  const handleImport = (ds) => {
    setImportingIds(prev => new Set(prev).add(ds.id));
    importMutation.mutate({ importType: ds.id });
  };

  const getStatusInfo = (dsId) => {
    const batch = batchStatusMap[dsId];
    if (!batch) return null;
    return batch;
  };

  const allExpanded = Object.keys(groupedDatasets).length === expandedCategories.size;
  const toggleAll = () => {
    if (allExpanded) {
      setExpandedCategories(new Set());
    } else {
      setExpandedCategories(new Set(Object.keys(groupedDatasets)));
    }
  };

  const categoryStats = useMemo(() => {
    const stats = {};
    for (const ds of datasets) {
      if (!stats[ds.category]) stats[ds.category] = { total: 0, imported: 0, processing: 0 };
      stats[ds.category].total++;
      const batch = batchStatusMap[ds.id];
      if (batch?.status === 'completed') stats[ds.category].imported++;
      if (batch?.status === 'processing') stats[ds.category].processing++;
    }
    return stats;
  }, [datasets, batchStatusMap]);

  if (catalogLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <PageHeader title="CMS Dataset Catalog" icon={Database} breadcrumbs={[{ label: 'Admin', path: '#' }, { label: 'CMS Dataset Catalog' }]} />
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title="CMS Dataset Catalog"
        icon={Database}
        breadcrumbs={[{ label: 'Admin', path: '#' }, { label: 'CMS Dataset Catalog' }]}
      >
        <div className="flex items-center gap-3 text-sm text-slate-400">
          <span>{datasets.length} datasets available</span>
          <span className="text-slate-600">|</span>
          <span className="text-green-400">{Object.values(batchStatusMap).filter(b => b.status === 'completed').length} imported</span>
          <span className="text-cyan-400">{Object.values(batchStatusMap).filter(b => b.status === 'processing').length} active</span>
        </div>
      </PageHeader>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[250px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <Input
            placeholder="Search datasets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-slate-900 border-slate-800 text-slate-200 placeholder:text-slate-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-500" />
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-md px-3 py-2 text-sm text-slate-300 focus:outline-none focus:ring-1 focus:ring-cyan-500"
          >
            <option value="all">All Categories</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        <select
          value={selectedPriority}
          onChange={(e) => setSelectedPriority(e.target.value)}
          className="bg-slate-900 border border-slate-800 rounded-md px-3 py-2 text-sm text-slate-300 focus:outline-none focus:ring-1 focus:ring-cyan-500"
        >
          <option value="all">All Priorities</option>
          <option value="high">High Priority</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>

        <div className="flex items-center gap-2">
          <ArrowUpDown className="w-4 h-4 text-slate-500" />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-md px-3 py-2 text-sm text-slate-300 focus:outline-none focus:ring-1 focus:ring-cyan-500"
          >
            <option value="priority">Sort by Priority</option>
            <option value="name">Sort by Name</option>
            <option value="records">Sort by Size</option>
          </select>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={toggleAll}
          className="text-slate-400 hover:text-slate-200"
        >
          {allExpanded ? 'Collapse All' : 'Expand All'}
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-3">
        {categories.map(cat => {
          const stats = categoryStats[cat] || { total: 0, imported: 0, processing: 0 };
          const IconComp = CATEGORY_ICONS[cat] || Database;
          const isActive = selectedCategory === cat;
          return (
            <button
              key={cat}
              onClick={() => setSelectedCategory(isActive ? 'all' : cat)}
              className={`flex flex-col items-center gap-2 p-3 rounded-lg border transition-all text-center ${
                isActive
                  ? 'bg-cyan-900/30 border-cyan-700/50 text-cyan-400'
                  : 'bg-slate-900/50 border-slate-800/50 text-slate-400 hover:border-slate-700 hover:text-slate-300'
              }`}
            >
              <IconComp className="w-5 h-5" />
              <span className="text-xs font-medium leading-tight">{cat}</span>
              <div className="flex items-center gap-1.5 text-[10px]">
                <span>{stats.total}</span>
                {stats.imported > 0 && <span className="text-green-400">({stats.imported})</span>}
                {stats.processing > 0 && <span className="text-cyan-400 animate-pulse">({stats.processing})</span>}
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-4">
        {Object.entries(groupedDatasets).map(([category, items]) => {
          const isExpanded = expandedCategories.has(category) || selectedCategory !== 'all' || searchQuery;
          const IconComp = CATEGORY_ICONS[category] || Database;
          const stats = categoryStats[category] || { total: 0, imported: 0, processing: 0 };

          return (
            <Card key={category} className="bg-slate-900/80 border-slate-800">
              <button
                onClick={() => toggleCategory(category)}
                className="w-full flex items-center justify-between p-4 hover:bg-slate-800/30 transition-colors rounded-t-lg"
              >
                <div className="flex items-center gap-3">
                  {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
                  <IconComp className="w-5 h-5 text-cyan-400" />
                  <span className="font-semibold text-slate-200">{category}</span>
                  <Badge variant="outline" className="border-slate-700 text-slate-400 text-xs">
                    {items.length} dataset{items.length !== 1 ? 's' : ''}
                  </Badge>
                  {stats.imported > 0 && (
                    <Badge className="bg-green-900/30 text-green-400 border-green-800/50 text-xs">
                      {stats.imported} imported
                    </Badge>
                  )}
                  {stats.processing > 0 && (
                    <Badge className="bg-cyan-900/30 text-cyan-400 border-cyan-800/50 text-xs animate-pulse">
                      {stats.processing} importing
                    </Badge>
                  )}
                </div>
              </button>

              {isExpanded && (
                <CardContent className="p-0">
                  <div className="border-t border-slate-800">
                    {items.map((ds, idx) => {
                      const statusBatch = getStatusInfo(ds.id);
                      const isImporting = importingIds.has(ds.id);
                      const isProcessing = statusBatch?.status === 'processing';
                      const isCompleted = statusBatch?.status === 'completed';
                      const isFailed = statusBatch?.status === 'failed';
                      const priorityCfg = PRIORITY_CONFIG[ds.priority] || PRIORITY_CONFIG.low;

                      return (
                        <div
                          key={ds.id}
                          className={`flex items-start gap-4 px-5 py-4 ${idx > 0 ? 'border-t border-slate-800/50' : ''} hover:bg-slate-800/20 transition-colors`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="font-medium text-slate-200 truncate">{ds.title}</h4>
                              <Badge className={`text-[10px] px-1.5 py-0 ${priorityCfg.className}`}>
                                {priorityCfg.label}
                              </Badge>
                            </div>
                            <p className="text-sm text-slate-500 line-clamp-2 mb-2">{ds.description}</p>
                            <div className="flex items-center gap-4 text-xs text-slate-500">
                              <span className="font-mono">{ds.records} records</span>
                              <span className="text-slate-700">|</span>
                              <span className="font-mono text-slate-600">{ds.id}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            {isCompleted && (
                              <div className="flex items-center gap-2 text-xs">
                                <CheckCircle2 className="w-4 h-4 text-green-400" />
                                <div className="text-right">
                                  <div className="text-green-400 font-medium">Imported</div>
                                  <div className="text-slate-500">{(statusBatch.imported_rows || 0).toLocaleString()} rows</div>
                                </div>
                              </div>
                            )}
                            {isProcessing && (
                              <div className="flex items-center gap-2 text-xs">
                                <Clock className="w-4 h-4 text-cyan-400 animate-pulse" />
                                <div className="text-right">
                                  <div className="text-cyan-400 font-medium">Importing...</div>
                                  <div className="text-slate-500">{(statusBatch.imported_rows || 0).toLocaleString()} rows</div>
                                </div>
                              </div>
                            )}
                            {isFailed && (
                              <div className="flex items-center gap-2 text-xs">
                                <AlertCircle className="w-4 h-4 text-red-400" />
                                <span className="text-red-400">Failed</span>
                              </div>
                            )}

                            <Button
                              size="sm"
                              disabled={isImporting || isProcessing}
                              onClick={() => handleImport(ds)}
                              className={`min-w-[100px] ${
                                isCompleted
                                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                                  : isProcessing
                                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                  : 'bg-cyan-600 hover:bg-cyan-700 text-white'
                              }`}
                            >
                              {isImporting ? (
                                <span className="flex items-center gap-2">
                                  <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                  Starting...
                                </span>
                              ) : isProcessing ? (
                                'Running...'
                              ) : isCompleted ? (
                                <span className="flex items-center gap-1.5">
                                  <Download className="w-3.5 h-3.5" />
                                  Re-import
                                </span>
                              ) : (
                                <span className="flex items-center gap-1.5">
                                  <Download className="w-3.5 h-3.5" />
                                  Import
                                </span>
                              )}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      {filteredDatasets.length === 0 && (
        <div className="text-center py-16 text-slate-500">
          <Database className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg">No datasets match your filters</p>
          <p className="text-sm mt-1">Try adjusting your search or filter criteria</p>
        </div>
      )}
    </div>
  );
}
