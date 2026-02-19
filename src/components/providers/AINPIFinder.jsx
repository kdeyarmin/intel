import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { base44 } from '@/api/base44Client';
import { Search, Loader2, UserPlus, Check } from 'lucide-react';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const US_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];

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

    const res = await base44.integrations.Core.InvokeLLM({
      prompt: `You are a healthcare NPI lookup specialist. Find the NPI numbers for the following provider/organization.

Search criteria:
- Name: ${name}
- City: ${city || 'Any'}
- State: ${state || 'Any'}
- Specialty: ${specialty || 'Any'}

Search the NPPES NPI Registry and return all matching results. For each match provide:
- The NPI number
- Full name
- Entity type (Individual or Organization)
- Credential (MD, DO, NP, etc.)
- Primary specialty/taxonomy
- City, State
- Confidence that this matches the search criteria (high/medium/low)

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
    setLoading(false);
  };

  const handleImport = async (match) => {
    setImporting(prev => new Set([...prev, match.npi]));
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

    setImporting(prev => { const n = new Set(prev); n.delete(match.npi); return n; });
    setImported(prev => new Set([...prev, match.npi]));
    toast.success(`Imported ${match.name} (NPI: ${match.npi})`);
    if (onProviderAdded) onProviderAdded();
  };

  const confColor = { high: 'bg-green-100 text-green-700', medium: 'bg-amber-100 text-amber-700', low: 'bg-red-100 text-red-700' };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Search className="w-4 h-4 text-blue-600" />
          AI NPI Finder
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Provider / Org Name *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g., John Smith" className="h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Specialty</Label>
            <Input value={specialty} onChange={e => setSpecialty(e.target.value)} placeholder="e.g., Internal Medicine" className="h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs">City</Label>
            <Input value={city} onChange={e => setCity(e.target.value)} placeholder="e.g., Philadelphia" className="h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs">State</Label>
            <Select value={state} onValueChange={setState}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Any state" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any</SelectItem>
                {US_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button onClick={handleSearch} disabled={loading || !name.trim()} className="w-full bg-blue-600 hover:bg-blue-700">
          {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Searching NPPES...</> : <><Search className="w-4 h-4 mr-2" /> Find NPI</>}
        </Button>

        {results?.search_summary && (
          <p className="text-xs text-slate-500 italic">{results.search_summary}</p>
        )}

        {results?.matches?.length > 0 && (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {results.matches.map((m, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium text-slate-900">{m.name}</span>
                    <Badge className={`text-[9px] ${confColor[m.confidence] || confColor.low}`}>{m.confidence}</Badge>
                    <Badge variant="outline" className="text-[9px]">{m.entity_type}</Badge>
                  </div>
                  <div className="text-xs text-slate-500">
                    NPI: <span className="font-mono">{m.npi}</span>
                    {m.credential && ` · ${m.credential}`}
                    {m.specialty && ` · ${m.specialty}`}
                    {m.city && ` · ${m.city}, ${m.state}`}
                  </div>
                  {m.reason && <p className="text-[10px] text-slate-400 mt-0.5">{m.reason}</p>}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs shrink-0 ml-2"
                  disabled={importing.has(m.npi) || imported.has(m.npi)}
                  onClick={() => handleImport(m)}
                >
                  {imported.has(m.npi) ? <><Check className="w-3 h-3 mr-1" /> Added</> :
                   importing.has(m.npi) ? <Loader2 className="w-3 h-3 animate-spin" /> :
                   <><UserPlus className="w-3 h-3 mr-1" /> Import</>}
                </Button>
              </div>
            ))}
          </div>
        )}

        {results && results.matches?.length === 0 && (
          <p className="text-xs text-slate-400 text-center py-3">No matches found. Try broader search criteria.</p>
        )}
      </CardContent>
    </Card>
  );
}