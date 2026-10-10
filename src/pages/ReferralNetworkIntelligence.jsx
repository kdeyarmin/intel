import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { invokeOrThrow } from '@/api/functionResult';
import { base44 } from '@/api/base44Client';
import { useUrlState } from '@/hooks/useUrlState';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Network, Crown, ArrowRightLeft, MapPin, AlertTriangle, Sparkles, Target, Database } from 'lucide-react';

import NetworkKPIs from '../components/referralNetwork/NetworkKPIs';
import NetworkFilters from '../components/referralNetwork/NetworkFilters';
import NetworkScopeBar from '../components/referralNetwork/NetworkScopeBar';
import AnalysisScopeNote from '../components/referralNetwork/AnalysisScopeNote';
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
import SingleProviderPathway from '../components/referralNetwork/SingleProviderPathway';
import PageHeader from '../components/shared/PageHeader';

// Scope and filters live in the URL so a network view can be shared.
const URL_DEFAULTS = { tab: 'graph', state: '', list: '', npi: '', q: '', type: 'all', group: 'all', min: 0 };
const GRAPH_NODES = 60;
const GRAPH_EDGES = 200;

/**
 * What the view leaves out: the server returns the busiest providers (and the
 * heaviest relationships between them), and the graph draws the busiest of
 * those and at most `edgeMax` of the relationships among the ones it draws
 * (`edgesBetween`, counted before that cap).
 */
export function graphNote(summary, loaded, { graphMax = GRAPH_NODES, edgeMax = GRAPH_EDGES, edgesBetween = 0 } = {}) {
  const shown = [];
  if (summary.network_nodes > loaded) {
    shown.push(`the ${loaded.toLocaleString()} busiest of ${summary.network_nodes.toLocaleString()} providers`);
  }
  if (summary.network_edges > summary.shown_edges) {
    shown.push(`${summary.shown_edges.toLocaleString()} of ${summary.network_edges.toLocaleString()} relationships`);
  }
  let text = shown.length ? `Showing ${shown.join(' and ')}` : '';
  const draws = [];
  if (loaded > graphMax) draws.push(`the busiest ${graphMax}`);
  if (edgesBetween > edgeMax) {
    draws.push(`${edgeMax} of ${edgesBetween.toLocaleString()} relationships${loaded > graphMax ? ' between them' : ''}`);
  }
  if (draws.length) text += `${text ? '; the' : 'The'} graph draws ${draws.join(' and ')}`;
  return text ? `${text}.` : null;
}

export default function ReferralNetworkIntelligence() {
  const [url, setUrl] = useUrlState(URL_DEFAULTS);
  const [selectedNpi, setSelectedNpi] = useState(null);
  const [hubSortKey, setHubSortKey] = useState('hubScore');
  const [hubSortDir, setHubSortDir] = useState('desc');

  // Same rules as the server: a positive whole-number list id and a 10-digit
  // NPI. Anything else in a shared URL is ignored rather than shown as a scope.
  const leadListId = /^[1-9]\d{0,9}$/.test(url.list) ? Number(url.list) : null;
  const focusNpi = /^\d{10}$/.test(url.npi) ? url.npi : null;
  const scope = { state: url.state || null, lead_list_id: leadListId, npi: focusNpi };

  const { data: leadLists = [] } = useQuery({
    queryKey: ['leadListsForNetwork'],
    queryFn: () => base44.entities.LeadList.list('-created_date', 100),
    staleTime: 300000,
  });
  const leadListName = leadListId ? leadLists.find((l) => l.id === leadListId)?.name || `#${leadListId}` : null;

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['referralNetwork', scope.state, scope.lead_list_id, scope.npi],
    queryFn: () => invokeOrThrow('getReferralNetworkData', Object.fromEntries(Object.entries(scope).filter(([, v]) => v))),
    staleTime: 300000,
    retry: (count, err) => count < 1 && err?.status !== 429,
  });

  const nodes = useMemo(() => data?.nodes ?? [], [data]);
  const edges = useMemo(() => data?.edges ?? [], [data]);

  const specialtyGroups = useMemo(() => {
    const seen = new Map();
    for (const n of nodes) if (n.specialtyGroup && n.specialtyGroup !== 'other') seen.set(n.specialtyGroup, n.specialtyGroupLabel);
    return [...seen].map(([key, label]) => ({ key, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [nodes]);

  const { filteredNodes, filteredEdges } = useMemo(() => {
    let fn = nodes;
    const q = url.q.trim().toLowerCase();
    if (q) fn = fn.filter((n) => (n.label || '').toLowerCase().includes(q) || n.npi.includes(q));
    if (url.type !== 'all') fn = fn.filter((n) => n.entityType === url.type);
    if (url.group !== 'all') fn = fn.filter((n) => n.specialtyGroup === url.group);
    if (url.min > 0) fn = fn.filter((n) => (n.totalVolume || 0) >= url.min);
    const keep = new Set(fn.map((n) => n.npi));
    return { filteredNodes: fn, filteredEdges: edges.filter((e) => keep.has(e.source) && keep.has(e.target)) };
  }, [nodes, edges, url.q, url.type, url.group, url.min]);

  const hubList = useMemo(() => {
    const dir = hubSortDir === 'desc' ? -1 : 1;
    return [...filteredNodes].sort((a, b) => dir * ((Number(a[hubSortKey]) || 0) - (Number(b[hubSortKey]) || 0)));
  }, [filteredNodes, hubSortKey, hubSortDir]);

  // The graph draws the busiest providers; keep the edges between them.
  const graphNodes = useMemo(() => [...filteredNodes].sort((a, b) => b.totalVolume - a.totalVolume).slice(0, GRAPH_NODES), [filteredNodes]);
  const edgesBetweenDrawn = useMemo(() => {
    const keep = new Set(graphNodes.map((n) => n.npi));
    return filteredEdges.filter((e) => keep.has(e.source) && keep.has(e.target));
  }, [graphNodes, filteredEdges]);
  const graphEdges = useMemo(() => edgesBetweenDrawn.slice(0, GRAPH_EDGES), [edgesBetweenDrawn]);

  const selectedNode = selectedNpi ? nodes.find((n) => n.npi === selectedNpi) || null : null;
  const focusNode = focusNpi ? nodes.find((n) => n.npi === focusNpi) || { label: focusNpi } : null;

  const toggleHubSort = (key) => {
    if (hubSortKey === key) setHubSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    else { setHubSortKey(key); setHubSortDir('desc'); }
  };
  const changeScope = (patch) => { setSelectedNpi(null); setUrl(patch); };
  const resetFilters = () => setUrl({ q: '', type: 'all', group: 'all', min: 0 });

  const hubCount = filteredNodes.filter((n) => n.isHub).length;
  const avgPartners = filteredNodes.length ? filteredNodes.reduce((s, n) => s + (Number(n.partners) || 0), 0) / filteredNodes.length : 0;

  let body;
  if (isError) {
    body = (
      <div className="bg-red-900/30 border border-red-500/30 rounded-lg p-6 text-center space-y-3" role="alert">
        <AlertTriangle className="w-8 h-8 text-red-400 mx-auto" aria-hidden="true" />
        <p className="text-red-400 text-sm">Couldn't load the referral network: {error?.message || 'unknown error'}</p>
        <button type="button" onClick={() => refetch()} className="px-4 py-2 bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded-md text-xs">
          Try again
        </button>
      </div>
    );
  } else if (isLoading) {
    body = (
      <div className="space-y-4" aria-label="Loading referral network">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-20 bg-slate-700/50" />)}</div>
        <Skeleton className="h-12 bg-slate-700/50" />
        <Skeleton className="h-[500px] bg-slate-700/50" />
      </div>
    );
  } else if (data?.notConfigured) {
    body = (
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-8 text-center space-y-2">
        <Database className="w-8 h-8 text-slate-400 mx-auto" aria-hidden="true" />
        <p className="text-slate-200 text-sm font-medium">No referral data yet</p>
        <p className="text-slate-400 text-sm max-w-lg mx-auto">{data.message}</p>
      </div>
    );
  } else {
    body = (
      <>
        <div className="flex flex-wrap items-center gap-3">
          <AnalysisScopeNote analysis={data} />
          {data?.summary && graphNote(data.summary, nodes.length, { edgesBetween: edgesBetweenDrawn.length }) && (
            <span className="text-xs text-slate-400">{graphNote(data.summary, nodes.length, { edgesBetween: edgesBetweenDrawn.length })}</span>
          )}
          {isFetching && <span className="text-xs text-slate-400">Refreshing…</span>}
        </div>

        <NetworkKPIs summary={data?.summary} hubCount={hubCount} avgPartners={avgPartners} />

        {nodes.length === 0 ? (
          <p className="text-sm text-slate-400 bg-slate-800/50 border border-slate-700/50 rounded-lg p-6 text-center">
            No referral relationships were found for this scope. Try another state or lead list.
          </p>
        ) : (
          <>
            <NetworkFilters
              search={url.q} onSearchChange={(q) => setUrl({ q })}
              entityType={url.type} onEntityTypeChange={(type) => setUrl({ type })}
              specialty={url.group} onSpecialtyChange={(group) => setUrl({ group })}
              minVolume={url.min} onMinVolumeChange={(min) => setUrl({ min })}
              specialties={specialtyGroups}
              onReset={resetFilters} totalNodes={nodes.length} filteredNodes={filteredNodes.length}
            />

            <Tabs value={url.tab} onValueChange={(tab) => setUrl({ tab })}>
              <TabsList className="bg-slate-800/50 h-auto flex flex-wrap justify-start gap-1 p-1">
                <TabsTrigger value="graph" className="gap-1.5 text-xs"><Network className="w-3.5 h-3.5" aria-hidden="true" /> Network graph</TabsTrigger>
                <TabsTrigger value="hubs" className="gap-1.5 text-xs"><Crown className="w-3.5 h-3.5" aria-hidden="true" /> Hubs</TabsTrigger>
                <TabsTrigger value="flows" className="gap-1.5 text-xs"><ArrowRightLeft className="w-3.5 h-3.5" aria-hidden="true" /> Top flows</TabsTrigger>
                <TabsTrigger value="geographic" className="gap-1.5 text-xs"><MapPin className="w-3.5 h-3.5" aria-hidden="true" /> Geography</TabsTrigger>
                <TabsTrigger value="gaps" className="gap-1.5 text-xs"><AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" /> Specialty coverage</TabsTrigger>
                <TabsTrigger value="insights" className="gap-1.5 text-xs"><Sparkles className="w-3.5 h-3.5" aria-hidden="true" /> AI insights</TabsTrigger>
                <TabsTrigger value="influencers" className="gap-1.5 text-xs"><Crown className="w-3.5 h-3.5" aria-hidden="true" /> Influencers</TabsTrigger>
                <TabsTrigger value="single" className="gap-1.5 text-xs"><Target className="w-3.5 h-3.5" aria-hidden="true" /> Single provider</TabsTrigger>
              </TabsList>

              <TabsContent value="graph" className="mt-4">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                  <div className={selectedNode ? 'lg:col-span-8' : 'lg:col-span-12'}>
                    <NetworkGraph
                      nodes={graphNodes}
                      edges={graphEdges}
                      onNodeClick={(n) => setSelectedNpi(n.npi === selectedNpi ? null : n.npi)}
                    />
                    {filteredNodes.length > GRAPH_NODES && (
                      <p className="mt-2 text-xs text-slate-400">The graph draws the {GRAPH_NODES} busiest providers; the Hubs tab lists all {filteredNodes.length}.</p>
                    )}
                  </div>
                  {selectedNode && (
                    <div className="lg:col-span-4">
                      <NodeDetailPanel
                        node={selectedNode}
                        edges={edges}
                        nodes={nodes}
                        onClose={() => setSelectedNpi(null)}
                        onFocus={selectedNode.npi === focusNpi ? null : (n) => changeScope({ npi: n.npi })}
                      />
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="hubs" className="mt-4">
                <HubAnalysisTable hubs={hubList} sortKey={hubSortKey} sortDir={hubSortDir} onSort={toggleHubSort} />
              </TabsContent>

              <TabsContent value="flows" className="mt-4">
                <ReferralFlowSankey edges={filteredEdges} nodes={filteredNodes} />
              </TabsContent>

              <TabsContent value="geographic" className="mt-4">
                <GeographicHeatmap nodes={filteredNodes} />
              </TabsContent>

              <TabsContent value="gaps" className="mt-4">
                <CareGapAnalysis nodes={filteredNodes} />
              </TabsContent>

              <TabsContent value="insights" className="mt-4 space-y-5">
                <AINetworkRecommendations state={scope.state} leadListId={leadListId} leadListName={leadListName} />
                <NetworkInsightsDashboard nodes={filteredNodes} edges={filteredEdges} summary={data?.summary} />
              </TabsContent>

              <TabsContent value="influencers" className="mt-4">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2">
                    <NetworkInfluencerAnalysis
                      state={scope.state}
                      leadListId={leadListId}
                      leadListName={leadListName}
                      onInfluencerSelect={(npi) => { setSelectedNpi(npi); setUrl({ tab: 'graph' }); }}
                    />
                  </div>
                  <div>
                    <NetworkGapAnalysis state={scope.state} leadListId={leadListId} leadListName={leadListName} />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="single" className="mt-4">
                <SingleProviderPathway />
              </TabsContent>
            </Tabs>
          </>
        )}
      </>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-5">
      <PageHeader
        title="Referral Network Analysis"
        subtitle="Who shares patients with whom: hubs, flows, geography and specialty coverage"
        icon={Network}
        breadcrumbs={[{ label: 'Analytics', page: 'AdvancedAnalytics' }, { label: 'Network' }]}
      />
      <NetworkScopeBar state={url.state} leadListId={leadListId} focus={focusNode} leadLists={leadLists} onChange={changeScope} />
      {body}
      <DataSourcesFooter />
    </div>
  );
}
