import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Users, Target, Crown, Shield, Plus } from 'lucide-react';

export default function TargetListBuilder({
  leadLists = [],
  _providers = [],
  referrals = [],
  scores = [],
  locations = [],
  taxonomies = [],
  dqAlerts = [],
  onTargetListReady,
}) {
  const [source, setSource] = useState('lead_list');
  const [selectedListId, setSelectedListId] = useState('');
  const [minHubScore, setMinHubScore] = useState(50);
  const [minFitScore, setMinFitScore] = useState(60);
  const [state, setState] = useState('all');
  const [specialty, setSpecialty] = useState('all');

  const availableStates = useMemo(() => {
    const s = new Set(locations.filter(l => l.state).map(l => l.state));
    return [...s].sort();
  }, [locations]);

  const availableSpecialties = useMemo(() => {
    const s = new Set(taxonomies.filter(t => t.primary_flag && t.taxonomy_description).map(t => t.taxonomy_description));
    return [...s].sort();
  }, [taxonomies]);

  const npiStateMap = useMemo(() => {
    const m = {};
    locations.forEach(l => { if (l.is_primary && l.state) m[l.npi] = l.state; });
    return m;
  }, [locations]);

  const npiSpecMap = useMemo(() => {
    const m = {};
    taxonomies.forEach(t => { if (t.primary_flag && t.taxonomy_description) m[t.npi] = t.taxonomy_description; });
    return m;
  }, [taxonomies]);

  const buildTargets = () => {
    let targetNPIs = [];

    if (source === 'lead_list') {
      // Will be resolved at campaign creation from list members
      onTargetListReady({ source: 'lead_list', listId: selectedListId });
      return;
    }

    if (source === 'referral_hubs') {
      // Providers with highest referral volume
      const refByNPI = {};
      referrals.forEach(r => { refByNPI[r.npi] = (refByNPI[r.npi] || 0) + (r.total_referrals || 0); });
      const maxRef = Math.max(...Object.values(refByNPI), 1);
      targetNPIs = Object.entries(refByNPI)
        .filter(([, vol]) => (vol / maxRef * 100) >= minHubScore)
        .map(([npi]) => npi);
    }

    if (source === 'network_position') {
      // High-scoring providers
      targetNPIs = scores.filter(s => s.score >= minFitScore).map(s => s.npi);
    }

    if (source === 'data_quality') {
      // Providers with open DQ alerts (potential outreach for data cleanup)
      const alertNPIs = new Set(dqAlerts.filter(a => a.status === 'open' && a.npi).map(a => a.npi));
      targetNPIs = [...alertNPIs];
    }

    // Apply filters
    if (state !== 'all') targetNPIs = targetNPIs.filter(n => npiStateMap[n] === state);
    if (specialty !== 'all') targetNPIs = targetNPIs.filter(n => npiSpecMap[n] === specialty);

    // Deduplicate
    targetNPIs = [...new Set(targetNPIs)];

    onTargetListReady({ source, npis: targetNPIs });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Target className="w-4 h-4 text-teal-500" /> Target Audience
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Source Criteria</Label>
          <Select value={source} onValueChange={setSource}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="lead_list"><span className="flex items-center gap-2"><Users className="w-3.5 h-3.5" /> From Lead List</span></SelectItem>
              <SelectItem value="referral_hubs"><span className="flex items-center gap-2"><Crown className="w-3.5 h-3.5" /> Referral Hubs</span></SelectItem>
              <SelectItem value="network_position"><span className="flex items-center gap-2"><Target className="w-3.5 h-3.5" /> High Fit Score</span></SelectItem>
              <SelectItem value="data_quality"><span className="flex items-center gap-2"><Shield className="w-3.5 h-3.5" /> Data Quality Flags</span></SelectItem>
            </SelectContent>
          </Select>
        </div>

        {source === 'lead_list' && (
          <div>
            <Label>Select Lead List</Label>
            <Select value={selectedListId} onValueChange={setSelectedListId}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Choose a list..." /></SelectTrigger>
              <SelectContent>
                {leadLists.map(l => (
                  <SelectItem key={l.id} value={l.id}>{l.name} ({l.provider_count || 0})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {source === 'referral_hubs' && (
          <div>
            <Label>Min Hub Score (percentile)</Label>
            <Input type="number" value={minHubScore} onChange={(e) => setMinHubScore(Number(e.target.value))} className="mt-1" min={0} max={100} />
          </div>
        )}

        {source === 'network_position' && (
          <div>
            <Label>Min CareMetric Fit Score</Label>
            <Input type="number" value={minFitScore} onChange={(e) => setMinFitScore(Number(e.target.value))} className="mt-1" min={0} max={100} />
          </div>
        )}

        {source !== 'lead_list' && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">State</Label>
              <Select value={state} onValueChange={setState}>
                <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All States</SelectItem>
                  {availableStates.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Specialty</Label>
              <Select value={specialty} onValueChange={setSpecialty}>
                <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Specialties</SelectItem>
                  {availableSpecialties.slice(0, 30).map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <Button onClick={buildTargets} className="w-full bg-teal-600 hover:bg-teal-700 gap-2">
          <Plus className="w-4 h-4" /> Build Target List
        </Button>
      </CardContent>
    </Card>
  );
}