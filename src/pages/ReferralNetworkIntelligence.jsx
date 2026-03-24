import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Network, Crown, ArrowRightLeft, MapPin, AlertTriangle, Sparkles } from 'lucide-react';

import NetworkKPIs from '../components/referralNetwork/NetworkKPIs';
import NetworkFilters from '../components/referralNetwork/NetworkFilters';
import NetworkGraph from '../components/referralNetwork/NetworkGraph';
import HubAnalysisTable from '../components/referralNetwork/HubAnalysisTable';
import ReferralFlowSankey from '../components/referralNetwork/ReferralFlowSankey';
import NodeDetailPanel from '../components/referralNetwork/NodeDetailPanel';
import GeographicHeatmap from '../components/referralNetwork/GeographicHeatmap';
import CareGapAnalysis from '../components/referralNetwork/CareGapAnalysis';
import NetworkInsightsDashboard from '../components/network/NetworkInsightsDashboard';
import DataSourcesFooter from '../components/compliance/DataSourcesFooter';
import NetworkInfluencerAnalysis from '../components/referralNetwork/NetworkInfluencerAnalysis';
import NetworkGapAnalysis from '../components/referralNetwork/NetworkGapAnalysis';
import AINetworkRecommendations from '../components/referralNetwork/AINetworkRecommendations';
import PageHeader from '../components/shared/PageHeader';

const HUB_THRESHOLD_PERCENTILE = 0.85;

export default function ReferralNetworkIntelligence() {
  const [tab, setTab] = useState('graph');
  const [search, setSearch] = useState('');
  const [entityType, setEntityType] = useState('all');
  const [stateFilter, setStateFilter] = useState('all');
  const [specialty, setSpecialty] = useState('all');
  const [minVolume, setMinVolume] = useState(0);
  const [selectedNode, setSelectedNode] = useState(null);
  const [hubSortKey, setHubSortKey] = useState('hubScore');
  const [hubSortDir, setHubSortDir] = useState('desc');

  const { data: networkData, isLoading: loading, isError, error, refetch } = useQuery({
    queryKey: ['rnNetworkData'],
    queryFn: async () => {
      const result = await base44.functions.invoke('getReferralNetworkData', {});
      return result.data || result;
    },
    staleTime: 300000,
    retry: 2,
  });

  const availableStates = useMemo(() => {
    if (!networkData?.nodes) return [];
    return [...new Set(networkData.nodes.map(n => n.state).filter(Boolean))].sort();
  }, [networkData]);

  const availableSpecialties = useMemo(() => {
    if (!networkData?.nodes) return [];
    return [...new Set(networkData.nodes.map(n => n.specialty).filter(Boolean))].sort();
  }, [networkData]);

  const { allNodes, allEdges } = useMemo(() => {
    if (!networkData?.nodes) return { allNodes: [], allEdges: [] };

    const nodesArr = networkData.nodes.map(n => {
      const outbound = n.referralCount || 0;
      const inbound = n.entityType === 'Organization' ? Math.round(outbound * 0.6) : Math.round(outbound * 0.2);
      return { npi: n.npi, label: n.label, entityType: n.entityType, state: n.state, city: n.city, specialty: n.specialty, outbound, inbound, totalVolume: outbound, connections: 0, hubScore: 0, isHub: false };
    });

    const byState = {};
    nodesArr.forEach(n => { const st = n.state || '__none'; if (!byState[st]) byState[st] = []; byState[st].push(n); });
    const edgesArr = [];
    Object.values(byState).forEach(stateNodes => {
      const sorted = [...stateNodes].sort((a, b) => b.totalVolume - a.totalVolume);
      for (let i = 0; i < Math.min(sorted.length, 15); i++) {
        for (let j = i + 1; j < Math.min(sorted.length, 15); j++) {
          const vol = Math.min(sorted[i].totalVolume, sorted[j].totalVolume);
          if (vol > 0) {
            const weight = (sorted[i].entityType !== sorted[j].entityType) ? 1.5 : 1;
            edgesArr.push({ source: sorted[i].npi, target: sorted[j].npi, volume: Math.round(vol * weight * 0.3) });
          }
        }
      }
    });

    const connCount = {};
    edgesArr.forEach(e => { connCount[e.source] = (connCount[e.source] || 0) + 1; connCount[e.target] = (connCount[e.target] || 0) + 1; });
    nodesArr.forEach(n => { n.connections = connCount[n.npi] || 0; });

    const maxVol = Math.max(...nodesArr.map(n => n.totalVolume), 1);
    const maxConn = Math.max(...nodesArr.map(n => n.connections), 1);
    nodesArr.forEach(n => { n.hubScore = Math.round((n.totalVolume / maxVol * 60) + (n.connections / maxConn * 40)); });

    const sortedByScore = [...nodesArr].sort((a, b) => b.hubScore - a.hubScore);
    const hubCutoff = Math.floor(sortedByScore.length * (1 - HUB_THRESHOLD_PERCENTILE));
    sortedByScore.slice(0, Math.max(hubCutoff, 3)).forEach(n => { n.isHub = true; });

    return { allNodes: nodesArr, allEdges: edgesArr };
  }, [networkData]);

  const { filteredNodes, filteredEdges } = useMemo(() => {
    let fn = allNodes;
    if (search) { const q = search.toLowerCase(); fn = fn.filter(n => n.label.toLowerCase().includes(q) || n.npi.includes(q)); }
    if (entityType !== 'all') fn = fn.filter(n => n.entityType === entityType);
    if (stateFilter !== 'all') fn = fn.filter(n => n.state === stateFilter);
    if (specialty !== 'all') fn = fn.filter(n => n.specialty === specialty);
    if (minVolume > 0) fn = fn.filter(n => n.totalVolume >= minVolume);
    const npiSet = new Set(fn.map(n => n.npi));
    const fe = allEdges.filter(e => npiSet.has(e.source) && npiSet.has(e.target));
    return { filteredNodes: fn, filteredEdges: fe };
  }, [allNodes, allEdges, search, entityType, stateFilter, specialty, minVolume]);

  const hubList = useMemo(() => {
    return filteredNodes.filter(n => n.hubScore > 0).sort((a, b) => hubSortDir === 'desc' ? b[hubSortKey] - a[hubSortKey] : a[hubSortKey] - b[hubSortKey]);
  }, [filteredNodes, hubSortKey, hubSortDir]);

  const toggleHubSort = (key) => {
    if (hubSortKey === key) setHubSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setHubSortKey(key); setHubSortDir('desc'); }
  };

  const totalReferralVolume = filteredNodes.reduce((s, n) => s + n.totalVolume, 0);
  const hubCount = filteredNodes.filter(n => n.isHub).length;
  const avgConnections = filteredNodes.length > 0 ? filteredNodes.reduce((s, n) => s + n.connections, 0) / filteredNodes.length : 0;

  const resetFilters = () => { setSearch(''); setEntityType('all'); setStateFilter('all'); setSpecialty('all'); setMinVolume(0); };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-5">
      <PageHeader
        title="Referral Network Analysis"
        subtitle="Visualize referral patterns, identify hubs, geographic clustering, and care gaps"
        icon={Network}
        breadcrumbs={[{ label: 'Analytics', page: 'AdvancedAnalytics' }, { label: 'Network' }]}
      />

      {isError ? (
        <div className="bg-red-900/20 border border-red-700/50 rounded-lg p-6 text-center space-y-3">
          <AlertTriangle className="w-8 h-8 text-red-400 mx-auto" />
          <p className="text-red-300 text-sm">Failed to load referral network data</p>
          <button onClick={() => refetch()} className="px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-300 rounded-md text-xs transition-colors">
            Retry
          </button>
        </div>
      ) : loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-20 bg-slate-700/50" />)}</div>
          <Skeleton className="h-12 bg-slate-700/50" />
          <Skeleton className="h-[500px] bg-slate-700/50" />
        </div>
      ) : (
        <>
          <NetworkKPIs
            totalProviders={filteredNodes.length}
            totalReferrals={totalReferralVolume}
            hubCount={hubCount}
            avgConnections={avgConnections}
          />

          <NetworkFilters
            search={search} onSearchChange={setSearch}
            entityType={entityType} onEntityTypeChange={setEntityType}
            state={stateFilter} onStateChange={setStateFilter}
            specialty={specialty} onSpecialtyChange={setSpecialty}
            minVolume={minVolume} onMinVolumeChange={setMinVolume}
            states={availableStates} specialties={availableSpecialties}
            onReset={resetFilters} totalNodes={allNodes.length} filteredNodes={filteredNodes.length}
          />

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="bg-slate-800/50 h-auto flex flex-wrap justify-start gap-1 p-1">
              <TabsTrigger value="graph" className="gap-1.5 text-xs">
                <Network className="w-3.5 h-3.5" /> Network Graph
              </TabsTrigger>
              <TabsTrigger value="hubs" className="gap-1.5 text-xs">
                <Crown className="w-3.5 h-3.5" /> Hub Analysis
              </TabsTrigger>
              <TabsTrigger value="flows" className="gap-1.5 text-xs">
                <ArrowRightLeft className="w-3.5 h-3.5" /> Referral Flows
              </TabsTrigger>
              <TabsTrigger value="geographic" className="gap-1.5 text-xs">
                <MapPin className="w-3.5 h-3.5" /> Geographic
              </TabsTrigger>
              <TabsTrigger value="gaps" className="gap-1.5 text-xs">
                <AlertTriangle className="w-3.5 h-3.5" /> Care Gaps
              </TabsTrigger>
              <TabsTrigger value="insights" className="gap-1.5 text-xs">
                <Sparkles className="w-3.5 h-3.5" /> AI Insights
              </TabsTrigger>
              <TabsTrigger value="influencers" className="gap-1.5 text-xs">
                <Crown className="w-3.5 h-3.5" /> Influencers
              </TabsTrigger>
              <TabsTrigger value="recommendations" className="gap-1.5 text-xs">
                <Sparkles className="w-3.5 h-3.5" /> Recommendations
              </TabsTrigger>
            </TabsList>

            <TabsContent value="graph" className="mt-4">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                <div className={selectedNode ? 'lg:col-span-8' : 'lg:col-span-12'}>
                  <NetworkGraph
                    nodes={filteredNodes.slice(0, 60)}
                    edges={filteredEdges.slice(0, 200)}
                    onNodeClick={(n) => setSelectedNode(n.npi === selectedNode?.npi ? null : n)}
                  />
                </div>
                {selectedNode && (
                  <div className="lg:col-span-4">
                    <NodeDetailPanel node={selectedNode} edges={allEdges} nodes={allNodes} onClose={() => setSelectedNode(null)} />
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="hubs" className="mt-4">
              <HubAnalysisTable hubs={hubList.slice(0, 30)} sortKey={hubSortKey} sortDir={hubSortDir} onSort={toggleHubSort} />
            </TabsContent>

            <TabsContent value="flows" className="mt-4">
              <ReferralFlowSankey edges={filteredEdges} nodes={filteredNodes} />
            </TabsContent>

            <TabsContent value="geographic" className="mt-4">
              <GeographicHeatmap nodes={filteredNodes} />
            </TabsContent>

            <TabsContent value="gaps" className="mt-4">
              <CareGapAnalysis nodes={filteredNodes} typeBreakdown={networkData?.typeBreakdown} />
            </TabsContent>

            <TabsContent value="insights" className="mt-4">
              <NetworkInsightsDashboard nodes={filteredNodes} edges={filteredEdges} />
            </TabsContent>

            <TabsContent value="influencers" className="mt-4">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                  <NetworkInfluencerAnalysis onInfluencerSelect={(npi) => {
                    const node = allNodes.find(n => n.npi === npi);
                    setSelectedNode(node);
                  }} />
                </div>
                <div>
                  <NetworkGapAnalysis />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="recommendations" className="mt-4">
              <AINetworkRecommendations />
            </TabsContent>
          </Tabs>
        </>
      )}

      <DataSourcesFooter />
    </div>
  );
}