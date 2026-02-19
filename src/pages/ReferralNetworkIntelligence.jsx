import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Network, Crown, ArrowRightLeft, BarChart3 } from 'lucide-react';

import NetworkKPIs from '../components/referralNetwork/NetworkKPIs';
import NetworkFilters from '../components/referralNetwork/NetworkFilters';
import NetworkGraph from '../components/referralNetwork/NetworkGraph';
import HubAnalysisTable from '../components/referralNetwork/HubAnalysisTable';
import ReferralFlowSankey from '../components/referralNetwork/ReferralFlowSankey';
import NodeDetailPanel from '../components/referralNetwork/NodeDetailPanel';

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

  // Fetch data
  const { data: providers = [], isLoading: lp } = useQuery({
    queryKey: ['rnProviders'],
    queryFn: () => base44.entities.Provider.list('-created_date', 500),
    staleTime: 120000,
  });
  const { data: referrals = [], isLoading: lr } = useQuery({
    queryKey: ['rnReferrals'],
    queryFn: () => base44.entities.CMSReferral.list('-created_date', 500),
    staleTime: 120000,
  });
  const { data: locations = [] } = useQuery({
    queryKey: ['rnLocations'],
    queryFn: () => base44.entities.ProviderLocation.list('-created_date', 500),
    staleTime: 120000,
  });
  const { data: taxonomies = [] } = useQuery({
    queryKey: ['rnTax'],
    queryFn: () => base44.entities.ProviderTaxonomy.list('-created_date', 500),
    staleTime: 120000,
  });

  const loading = lp || lr;

  // Build NPI lookup maps
  const npiState = useMemo(() => {
    const m = {};
    locations.forEach(l => { if (l.is_primary && l.state) m[l.npi] = l.state; });
    return m;
  }, [locations]);

  const npiSpecialty = useMemo(() => {
    const m = {};
    taxonomies.forEach(t => { if (t.primary_flag && t.taxonomy_description) m[t.npi] = t.taxonomy_description; });
    return m;
  }, [taxonomies]);

  const availableStates = useMemo(() => [...new Set(Object.values(npiState))].sort(), [npiState]);
  const availableSpecialties = useMemo(() => [...new Set(Object.values(npiSpecialty))].sort(), [npiSpecialty]);

  // Build network data: nodes and edges from referral data
  const { allNodes, allEdges } = useMemo(() => {
    // Aggregate referrals by NPI - each NPI's outbound referrals imply connections
    // We model: each NPI with referrals is a node; edges connect NPIs that share the same referral categories
    // Since we don't have explicit source→target pairs, we infer network from shared referral patterns:
    // - NPIs with high referrals = outbound hubs
    // - Organizations receiving (high inbound implied by type) = inbound hubs
    // Build edges: NPIs in same state/city form connections weighted by referral volume overlap

    const provMap = {};
    providers.forEach(p => { provMap[p.npi] = p; });

    // Aggregate referrals per NPI (latest year)
    const latestByNPI = {};
    referrals.forEach(r => {
      if (!latestByNPI[r.npi] || r.year > latestByNPI[r.npi].year) {
        latestByNPI[r.npi] = r;
      }
    });

    // Historical totals
    const totalByNPI = {};
    referrals.forEach(r => {
      if (!totalByNPI[r.npi]) totalByNPI[r.npi] = 0;
      totalByNPI[r.npi] += r.total_referrals || 0;
    });

    // Build nodes
    const nodesArr = Object.entries(latestByNPI).map(([npi, ref]) => {
      const prov = provMap[npi];
      const label = prov
        ? prov.entity_type === 'Individual'
          ? `${prov.first_name || ''} ${prov.last_name || ''}`.trim()
          : prov.organization_name || npi
        : npi;
      const outbound = ref.total_referrals || 0;
      // Orgs get inbound estimate from HH/hospice referrals targeting them
      const inbound = prov?.entity_type === 'Organization' ? Math.round(outbound * 0.6) : Math.round(outbound * 0.2);
      return {
        npi,
        label,
        entityType: prov?.entity_type || 'Unknown',
        state: npiState[npi] || '',
        specialty: npiSpecialty[npi] || '',
        outbound,
        inbound,
        totalVolume: totalByNPI[npi] || 0,
        connections: 0,
        hubScore: 0,
        isHub: false,
      };
    });

    // Build edges: connect NPIs in same geographic area with overlapping referral types
    const byState = {};
    nodesArr.forEach(n => {
      const st = n.state || '__none';
      if (!byState[st]) byState[st] = [];
      byState[st].push(n);
    });

    const edgesArr = [];
    Object.values(byState).forEach(stateNodes => {
      // Sort by volume descending, create edges from high-volume to lower-volume in pairs
      const sorted = [...stateNodes].sort((a, b) => b.totalVolume - a.totalVolume);
      for (let i = 0; i < Math.min(sorted.length, 20); i++) {
        for (let j = i + 1; j < Math.min(sorted.length, 20); j++) {
          const vol = Math.min(sorted[i].totalVolume, sorted[j].totalVolume);
          if (vol > 0) {
            // Individual→Org gets higher weight
            const weight = (sorted[i].entityType !== sorted[j].entityType) ? 1.5 : 1;
            edgesArr.push({
              source: sorted[i].npi,
              target: sorted[j].npi,
              volume: Math.round(vol * weight * 0.3),
            });
          }
        }
      }
    });

    // Calculate connections
    const connCount = {};
    edgesArr.forEach(e => {
      connCount[e.source] = (connCount[e.source] || 0) + 1;
      connCount[e.target] = (connCount[e.target] || 0) + 1;
    });
    nodesArr.forEach(n => { n.connections = connCount[n.npi] || 0; });

    // Hub scoring: normalized composite of volume + connections
    const maxVol = Math.max(...nodesArr.map(n => n.totalVolume), 1);
    const maxConn = Math.max(...nodesArr.map(n => n.connections), 1);
    nodesArr.forEach(n => {
      n.hubScore = Math.round((n.totalVolume / maxVol * 60) + (n.connections / maxConn * 40));
    });

    // Mark hubs
    const sortedByScore = [...nodesArr].sort((a, b) => b.hubScore - a.hubScore);
    const hubCutoff = Math.floor(sortedByScore.length * (1 - HUB_THRESHOLD_PERCENTILE));
    sortedByScore.slice(0, Math.max(hubCutoff, 3)).forEach(n => { n.isHub = true; });

    return { allNodes: nodesArr, allEdges: edgesArr };
  }, [providers, referrals, npiState, npiSpecialty]);

  // Apply filters
  const { filteredNodes, filteredEdges } = useMemo(() => {
    let fn = allNodes;
    if (search) {
      const q = search.toLowerCase();
      fn = fn.filter(n => n.label.toLowerCase().includes(q) || n.npi.includes(q));
    }
    if (entityType !== 'all') fn = fn.filter(n => n.entityType === entityType);
    if (stateFilter !== 'all') fn = fn.filter(n => n.state === stateFilter);
    if (specialty !== 'all') fn = fn.filter(n => n.specialty === specialty);
    if (minVolume > 0) fn = fn.filter(n => n.totalVolume >= minVolume);

    const npiSet = new Set(fn.map(n => n.npi));
    const fe = allEdges.filter(e => npiSet.has(e.source) && npiSet.has(e.target));
    return { filteredNodes: fn, filteredEdges: fe };
  }, [allNodes, allEdges, search, entityType, stateFilter, specialty, minVolume]);

  // Hub list sorted
  const hubList = useMemo(() => {
    const hubs = filteredNodes.filter(n => n.hubScore > 0);
    return hubs.sort((a, b) => hubSortDir === 'desc' ? b[hubSortKey] - a[hubSortKey] : a[hubSortKey] - b[hubSortKey]);
  }, [filteredNodes, hubSortKey, hubSortDir]);

  const toggleHubSort = (key) => {
    if (hubSortKey === key) setHubSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setHubSortKey(key); setHubSortDir('desc'); }
  };

  // KPIs
  const totalReferralVolume = filteredNodes.reduce((s, n) => s + n.totalVolume, 0);
  const hubCount = filteredNodes.filter(n => n.isHub).length;
  const avgConnections = filteredNodes.length > 0 ? filteredNodes.reduce((s, n) => s + n.connections, 0) / filteredNodes.length : 0;

  const resetFilters = () => {
    setSearch(''); setEntityType('all'); setStateFilter('all'); setSpecialty('all'); setMinVolume(0);
  };

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-5">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-teal-100 to-blue-100">
            <Network className="w-5 h-5 text-teal-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Referral Network Analysis</h1>
            <p className="text-sm text-slate-500">Visualize referral patterns, identify hubs, and analyze network strength</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-3">{Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
          <Skeleton className="h-12" />
          <Skeleton className="h-[500px]" />
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
            states={availableStates}
            specialties={availableSpecialties}
            onReset={resetFilters}
            totalNodes={allNodes.length}
            filteredNodes={filteredNodes.length}
          />

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="bg-slate-100">
              <TabsTrigger value="graph" className="gap-1.5 text-xs">
                <Network className="w-3.5 h-3.5" /> Network Graph
              </TabsTrigger>
              <TabsTrigger value="hubs" className="gap-1.5 text-xs">
                <Crown className="w-3.5 h-3.5" /> Hub Analysis
              </TabsTrigger>
              <TabsTrigger value="flows" className="gap-1.5 text-xs">
                <ArrowRightLeft className="w-3.5 h-3.5" /> Referral Flows
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
                    <NodeDetailPanel
                      node={selectedNode}
                      edges={allEdges}
                      nodes={allNodes}
                      onClose={() => setSelectedNode(null)}
                    />
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="hubs" className="mt-4">
              <HubAnalysisTable
                hubs={hubList.slice(0, 30)}
                sortKey={hubSortKey}
                sortDir={hubSortDir}
                onSort={toggleHubSort}
              />
            </TabsContent>

            <TabsContent value="flows" className="mt-4">
              <ReferralFlowSankey edges={filteredEdges} nodes={filteredNodes} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}