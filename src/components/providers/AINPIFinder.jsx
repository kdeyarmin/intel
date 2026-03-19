import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { base44 } from '@/api/base44Client';
import { Search, Loader2, UserPlus, Check, AlertTriangle, Info } from 'lucide-react';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const US_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];

function ResultCard({ match, importing, imported, onImport }) {
  const confColor = { high: 'bg-green-100 text-green-700 border-green-200', medium: 'bg-amber-100 text-amber-700 border-amber-200', low: 'bg-red-100 text-red-700 border-red-200' };

  return (
    <div className="flex items-start justify-between p-3.5 bg-white rounded-xl border border-slate-200 hover:border-blue-200 hover:shadow-sm transition-all">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-semibold text-slate-900">{match.name}</span>
          <Badge className={`text-[9px] border ${confColor[match.confidence] || confColor.low}`}>{match.confidence}</Badge>
          <Badge variant="outline" className="text-[9px]">{match.entity_type}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
          <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">{match.npi}</span>
          {match.credential && <span className="text-slate-600 font-medium">{match.credential}</span>}
          {match.specialty && <span>{match.specialty}</span>}
          {match.city && <span>{match.city}, {match.state}</span>}
        </div>
        {match.reason && <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">{match.reason}</p>}
      </div>
      <Button
        size="sm"
        variant={imported.has(match.npi) ? "default" : "outline"}
        className={`h-8 text-xs shrink-0 ml-3 ${imported.has(match.npi) ? 'bg-green-600 hover:bg-green-700' : ''}`}
        disabled={importing.has(match.npi) || imported.has(match.npi)}
        onClick={() => onImport(match)}
      >
        {imported.has(match.npi) ? <><Check className="w-3.5 h-3.5 mr-1" /> Added</> :
         importing.has(match.npi) ? <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> Importing...</> :
         <><UserPlus className="w-3.5 h-3.5 mr-1" /> Import Provider</>}
      </Button>
    </div>
  );
}

export default function AINPIFinder({ onProviderAdded }) {
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [importing, setImporting] = useState(new Set());
  const [imported, setImported] = useState(new Set());

  const handleSearch = async () => {
    if (!name.trim()) { toast.error('Enter a provider or organization name'); return; }
    setLoading(true);
    setResults(null);

    try {
      const res = await base44.integrations.Core.InvokeLLM({
        prompt: `You are a healthcare NPI lookup specialist. Find the NPI numbers for the following provider/organization.

Search criteria:
- Name: ${name}
- City: ${city || 'Any'}
- State: ${state || 'Any'}
- Specialty: ${specialty || 'Any'}

Search the NPPES NPI Registry and return all matching results. For each match provide:
- The NPI number (10 digits)
- Full name
- Entity type (Individual or Organization)
- Credential (MD, DO, NP, etc.)
- Primary specialty/taxonomy
- City, State
- Confidence that this matches the search criteria (high/medium/low)
- A brief reason why this is a match

Return up to 10 results, ordered by relevance.`,
        add_context_from_internet: true,
        response_json_schema: {
          type: "object",
          properties: {
            matches: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  npi: { type: "string" },
                  name: { type: "string" },
                  entity_type: { type: "string" },
                  credential: { type: "string" },
                  specialty: { type: "string" },
                  city: { type: "string" },
                  state: { type: "string" },
                  confidence: { type: "string" },
                  reason: { type: "string" }
                }
              }
            },
            search_summary: { type: "string" }
          }
        }
      });

      setResults(res);
      if (res.matches?.length > 0) {
        toast.success(`Found ${res.matches.length} matching providers`);
      }
    } catch (err) {
      toast.error('Search failed: ' + (err.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async (match) => {
    setImporting(prev => new Set([...prev, match.npi]));
    try {
      const isOrg = match.entity_type === 'Organization';
      const nameParts = match.name.split(',').map(s => s.trim());

      await base44.entities.Provider.create({
        npi: match.npi,
        entity_type: isOrg ? 'Organization' : 'Individual',
        last_name: isOrg ? '' : (nameParts[0] || match.name),
        first_name: isOrg ? '' : (nameParts[1] || ''),
        organization_name: isOrg ? match.name : '',
        credential: match.credential || '',
        status: 'Active',
        needs_nppes_enrichment: true,
      });

      if (match.city || match.state) {
        await base44.entities.ProviderLocation.create({
          npi: match.npi,
          location_type: 'Practice',
          is_primary: true,
          city: match.city || '',
          state: match.state || '',
        });
      }

      if (match.specialty) {
        await base44.entities.ProviderTaxonomy.create({
          npi: match.npi,
          taxonomy_description: match.specialty,
          primary_flag: true,
        });
      }

      setImported(prev => new Set([...prev, match.npi]));
      toast.success(`Imported ${match.name} (NPI: ${match.npi})`);
      if (onProviderAdded) onProviderAdded();
    } catch (err) {
      toast.error(`Import failed for ${match.name}: ${err.message || 'Unknown error'}`);
    } finally {
      setImporting(prev => { const n = new Set(prev); n.delete(match.npi); return n; });
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && name.trim() && !loading) handleSearch();
  };

  return (
    <div className="space-y-4">
      {/* Description */}
      <div className="flex items-start gap-3 p-4 bg-blue-50/70 rounded-xl border border-blue-100">
        <div className="p-2 rounded-lg bg-blue-100">
          <Search className="w-4 h-4 text-blue-600" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Find Missing Provider NPIs</h3>
          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
            Search the NPPES registry by name, location, and specialty to discover provider NPI numbers. 
            Import matches directly into your database with location and taxonomy records created automatically.
          </p>
        </div>
      </div>

      {/* Search Form */}
      <Card className="bg-white">
        <CardContent className="pt-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-medium text-slate-700">Provider / Organization Name <span className="text-red-500">*</span></Label>
              <Input 
                value={name} 
                onChange={e => setName(e.target.value)} 
                onKeyDown={handleKeyDown}
                placeholder="e.g., John Smith or Memorial Hospital" 
                className="h-9 text-sm mt-1" 
              />
            </div>
            <div>
              <Label className="text-xs font-medium text-slate-700">Specialty</Label>
              <Input 
                value={specialty} 
                onChange={e => setSpecialty(e.target.value)} 
                onKeyDown={handleKeyDown}
                placeholder="e.g., Internal Medicine, Cardiology" 
                className="h-9 text-sm mt-1" 
              />
            </div>
            <div>
              <Label className="text-xs font-medium text-slate-700">City</Label>
              <Input 
                value={city} 
                onChange={e => setCity(e.target.value)} 
                onKeyDown={handleKeyDown}
                placeholder="e.g., Philadelphia, Houston" 
                className="h-9 text-sm mt-1" 
              />
            </div>
            <div>
              <Label className="text-xs font-medium text-slate-700">State</Label>
              <Select value={state} onValueChange={setState}>
                <SelectTrigger className="h-9 text-sm mt-1">
                  <SelectValue placeholder="Any state" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any State</SelectItem>
                  {US_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button onClick={handleSearch} disabled={loading || !name.trim()} className="w-full bg-blue-600 hover:bg-blue-700 h-9">
            {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Searching NPPES Registry...</> : <><Search className="w-4 h-4 mr-2" /> Search for NPI</>}
          </Button>
        </CardContent>
      </Card>

      {/* Loading State */}
      {loading && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardContent className="py-8 flex flex-col items-center gap-2">
            <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
            <p className="text-sm font-medium text-blue-800">Searching the NPPES registry...</p>
            <p className="text-xs text-blue-600">This uses AI-powered web search to find matching NPIs</p>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {results && !loading && (
        <div className="space-y-3">
          {results.search_summary && (
            <div className="flex items-start gap-2 px-3 py-2 bg-slate-50 rounded-lg">
              <Info className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
              <p className="text-xs text-slate-500">{results.search_summary}</p>
            </div>
          )}

          {results.matches?.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-medium text-slate-600">{results.matches.length} results found</span>
                {imported.size > 0 && <Badge className="bg-green-100 text-green-700 text-[10px]">{imported.size} imported</Badge>}
              </div>
              {results.matches.map((m, i) => (
                <ResultCard key={i} match={m} importing={importing} imported={imported} onImport={handleImport} />
              ))}
            </div>
          ) : (
            <Card className="bg-slate-50 border-dashed">
              <CardContent className="py-8 text-center">
                <Search className="w-6 h-6 text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-500">No matching providers found</p>
                <p className="text-xs text-slate-400 mt-1">Try broadening your search — remove the city or specialty filter</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Disclaimer */}
      <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
        <p className="text-[10px] text-amber-700 leading-relaxed">
          NPI matches are found via AI web search and should be verified. Imported providers are flagged for NPPES enrichment to pull official registry data.
        </p>
      </div>
    </div>
  );
}