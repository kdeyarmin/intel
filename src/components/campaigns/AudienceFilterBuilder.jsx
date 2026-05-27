import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Users } from 'lucide-react';

export default function AudienceFilterBuilder({ filters, onFiltersChange, onCountChange }) {
  const [entityType, setEntityType] = useState(filters.entityType || 'all');
  const [state, setState] = useState(filters.state || 'all');
  const [hasEmail, setHasEmail] = useState(filters.hasEmail || 'all');
  const [specialty, setSpecialty] = useState(filters.specialty || 'all');
  const [minScore, setMinScore] = useState(filters.minScore || '');

  const { data: providers = [] } = useQuery({
    queryKey: ['audienceProviders'],
    queryFn: () => base44.entities.Provider.list('-created_date', 500),
    staleTime: 120000,
  });

  const { data: locations = [] } = useQuery({
    queryKey: ['audienceLocations'],
    queryFn: () => base44.entities.ProviderLocation.list('-created_date', 500),
    staleTime: 120000,
  });

  const { data: taxonomies = [] } = useQuery({
    queryKey: ['audienceTaxonomies'],
    queryFn: () => base44.entities.ProviderTaxonomy.list('-created_date', 500),
    staleTime: 120000,
  });

  const { data: scores = [] } = useQuery({
    queryKey: ['audienceScores'],
    queryFn: () => base44.entities.LeadScore.list('-score', 500),
    staleTime: 120000,
  });

  const stateOptions = useMemo(() => {
    const states = [...new Set(locations.map(l => l.state).filter(Boolean))].sort();
    return states;
  }, [locations]);

  const specialtyOptions = useMemo(() => {
    const specs = [...new Set(taxonomies.map(t => t.taxonomy_description).filter(Boolean))].sort();
    return specs;
  }, [taxonomies]);

  const locationByNpi = useMemo(() => {
    const m = {};
    locations.forEach(l => { if (!m[l.npi] || l.is_primary) m[l.npi] = l; });
    return m;
  }, [locations]);

  const taxonomyByNpi = useMemo(() => {
    const m = {};
    taxonomies.forEach(t => { if (!m[t.npi]) m[t.npi] = []; m[t.npi].push(t); });
    return m;
  }, [taxonomies]);

  const scoreByNpi = useMemo(() => {
    const m = {};
    scores.forEach(s => { m[s.npi] = s.score; });
    return m;
  }, [scores]);

  const matchingProviders = useMemo(() => {
    return providers.filter(p => {
      if (entityType !== 'all' && p.entity_type !== entityType) return false;
      if (hasEmail === 'yes' && !p.email) return false;
      if (hasEmail === 'no' && p.email) return false;
      if (state !== 'all') {
        const loc = locationByNpi[p.npi];
        if (!loc || loc.state !== state) return false;
      }
      if (specialty !== 'all') {
        const taxs = taxonomyByNpi[p.npi] || [];
        if (!taxs.some(t => t.taxonomy_description === specialty)) return false;
      }
      if (minScore) {
        const s = scoreByNpi[p.npi];
        if (!s || s < Number(minScore)) return false;
      }
      return true;
    });
  }, [providers, entityType, state, hasEmail, specialty, minScore, locationByNpi, taxonomyByNpi, scoreByNpi]);

  useEffect(() => {
    const f = {};
    if (entityType !== 'all') f.entityType = entityType;
    if (state !== 'all') f.state = state;
    if (hasEmail !== 'all') f.hasEmail = hasEmail;
    if (specialty !== 'all') f.specialty = specialty;
    if (minScore) f.minScore = minScore;
    onFiltersChange(f);
    onCountChange(matchingProviders.length);
  }, [entityType, state, hasEmail, specialty, minScore, matchingProviders.length]);

  return (
    <div className="space-y-3 border border-slate-700/50 rounded-lg p-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-[10px] text-slate-500 uppercase">Type</Label>
          <Select value={entityType} onValueChange={setEntityType}>
            <SelectTrigger className="h-8 text-xs bg-slate-800/50 border-slate-700"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="Individual">Individual</SelectItem>
              <SelectItem value="Organization">Organization</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[10px] text-slate-500 uppercase">Has Email</Label>
          <Select value={hasEmail} onValueChange={setHasEmail}>
            <SelectTrigger className="h-8 text-xs bg-slate-800/50 border-slate-700"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any</SelectItem>
              <SelectItem value="yes">Yes</SelectItem>
              <SelectItem value="no">No</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-[10px] text-slate-500 uppercase">State</Label>
          <Select value={state} onValueChange={setState}>
            <SelectTrigger className="h-8 text-xs bg-slate-800/50 border-slate-700"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All States</SelectItem>
              {stateOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[10px] text-slate-500 uppercase">Min Score</Label>
          <Input type="number" value={minScore} onChange={e => setMinScore(e.target.value)} placeholder="0" className="h-8 text-xs bg-slate-800/50 border-slate-700 text-slate-200" />
        </div>
      </div>
      <div>
        <Label className="text-[10px] text-slate-500 uppercase">Specialty</Label>
        <Select value={specialty} onValueChange={setSpecialty}>
          <SelectTrigger className="h-8 text-xs bg-slate-800/50 border-slate-700"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Specialties</SelectItem>
            {specialtyOptions.slice(0, 50).map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2 pt-1 border-t border-slate-700/40">
        <Users className="w-4 h-4 text-cyan-400" />
        <span className="text-sm font-semibold text-cyan-300">{matchingProviders.length.toLocaleString()}</span>
        <span className="text-xs text-slate-400">providers match</span>
      </div>
    </div>
  );
}