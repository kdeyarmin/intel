import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Loader2, Search, Download, CheckCircle2, XCircle, Clock, Users, MapPin, Stethoscope, AlertCircle } from 'lucide-react';
import NPPESImportResults from '../components/nppes/NPPESImportResults';

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS',
  'KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY',
  'NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'
];

const COMMON_TAXONOMIES = [
  'Internal Medicine',
  'Family Medicine',
  'Psychiatry & Neurology',
  'General Practice',
  'Nurse Practitioner',
  'Physician Assistant',
  'Physical Therapy',
  'Occupational Therapy',
  'Speech-Language Pathology',
  'Home Health',
  'Hospice',
  'Skilled Nursing Facility',
  'Social Worker',
  'Psychology',
  'Cardiology',
  'Orthopedic Surgery',
  'Dermatology',
  'Emergency Medicine',
  'Pediatrics',
  'Obstetrics & Gynecology',
];

export default function NPPESImport() {
  const [state, setState] = useState('');
  const [taxonomyDescription, setTaxonomyDescription] = useState('');
  const [customTaxonomy, setCustomTaxonomy] = useState('');
  const [entityType, setEntityType] = useState('');
  const [city, setCity] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [dryRun, setDryRun] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const queryClient = useQueryClient();

  const { data: recentBatches = [] } = useQuery({
    queryKey: ['nppesImportBatches'],
    queryFn: async () => {
      const batches = await base44.entities.ImportBatch.list('-created_date', 50);
      return batches.filter(b => b.import_type === 'nppes_registry');
    },
  });

  const handleImport = async () => {
    setProcessing(true);
    setResult(null);
    setError(null);

    const taxonomy = customTaxonomy || taxonomyDescription;

    try {
      const response = await base44.functions.invoke('importNPPESRegistry', {
        state,
        taxonomy_description: taxonomy,
        entity_type: entityType,
        city,
        postal_code: postalCode,
        first_name: firstName,
        last_name: lastName,
        organization_name: organizationName,
        dry_run: dryRun,
      });

      setResult(response.data);
      queryClient.invalidateQueries(['nppesImportBatches']);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setProcessing(false);
    }
  };

  // NPPES API requires substantive search criteria beyond just entity type
  const hasAnyFilter = state || taxonomyDescription || customTaxonomy || city || postalCode || firstName || lastName || organizationName;

  const handleReset = () => {
    setState('');
    setTaxonomyDescription('');
    setCustomTaxonomy('');
    setEntityType('');
    setCity('');
    setPostalCode('');
    setFirstName('');
    setLastName('');
    setOrganizationName('');
    setResult(null);
    setError(null);
    setDryRun(true);
  };

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">NPPES Registry Import</h1>
        <p className="text-gray-600 mt-1">
          Search and import provider data directly from the NPI Registry API
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Search Criteria */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="w-5 h-5 text-teal-600" />
                Search Criteria
              </CardTitle>
              <CardDescription>
                Specify at least one filter to search the NPPES registry. Results are capped at 10,000 per import.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Row 1: State + Entity Type */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-gray-500" />
                    State
                  </Label>
                  <Select value={state} onValueChange={setState}>
                    <SelectTrigger>
                      <SelectValue placeholder="All states" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={null}>All States</SelectItem>
                      {US_STATES.map(s => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-gray-500" />
                    Provider Type
                  </Label>
                  <Select value={entityType} onValueChange={setEntityType}>
                    <SelectTrigger>
                      <SelectValue placeholder="All types" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={null}>All Types</SelectItem>
                      <SelectItem value="NPI-1">Individual (NPI-1)</SelectItem>
                      <SelectItem value="NPI-2">Organization (NPI-2)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Row 2: Taxonomy */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Stethoscope className="w-4 h-4 text-gray-500" />
                  Specialty / Taxonomy
                </Label>
                <Select value={taxonomyDescription} onValueChange={(v) => { setTaxonomyDescription(v); setCustomTaxonomy(''); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a specialty..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={null}>All Specialties</SelectItem>
                    {COMMON_TAXONOMIES.map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Or type a custom specialty (e.g., Podiatry)"
                  value={customTaxonomy}
                  onChange={(e) => { setCustomTaxonomy(e.target.value); setTaxonomyDescription(''); }}
                />
              </div>

              {/* Row 3: City + Postal Code */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>City</Label>
                  <Input
                    placeholder="e.g., Philadelphia"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Postal Code</Label>
                  <Input
                    placeholder="e.g., 19104"
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                  />
                </div>
              </div>

              {/* Row 4: Name fields */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>First Name</Label>
                  <Input
                    placeholder="Individual first name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Last Name</Label>
                  <Input
                    placeholder="Individual last name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Organization Name</Label>
                  <Input
                    placeholder="Organization name"
                    value={organizationName}
                    onChange={(e) => setOrganizationName(e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Import Controls */}
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Dry Run Mode</Label>
                  <p className="text-sm text-gray-600">Validate and count only — no data written</p>
                </div>
                <Switch checked={dryRun} onCheckedChange={setDryRun} />
              </div>

              {!dryRun && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-lg border border-amber-200">
                  <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-amber-800">
                    Live mode will create/update Provider, ProviderLocation, and ProviderTaxonomy records.
                  </p>
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  onClick={handleImport}
                  disabled={processing || !hasAnyFilter}
                  className="flex-1 bg-teal-600 hover:bg-teal-700"
                >
                  {processing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {dryRun ? 'Searching...' : 'Importing...'}
                    </>
                  ) : (
                    <>
                      {dryRun ? <Search className="w-4 h-4 mr-2" /> : <Download className="w-4 h-4 mr-2" />}
                      {dryRun ? 'Search & Validate' : 'Import Providers'}
                    </>
                  )}
                </Button>
                <Button variant="outline" onClick={handleReset} disabled={processing}>
                  Reset
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Results */}
          {result && <NPPESImportResults result={result} />}

          {error && (
            <Card className="border-red-200 bg-red-50">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-red-700">
                  <XCircle className="w-5 h-5" />
                  <p className="font-medium">Import Failed</p>
                </div>
                <p className="text-sm text-red-600 mt-2">{error}</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Recent Imports Sidebar */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Recent NPPES Imports</CardTitle>
            </CardHeader>
            <CardContent>
              {recentBatches.length === 0 ? (
                <div className="text-center py-6 text-gray-500">
                  <Search className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No NPPES imports yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentBatches.slice(0, 10).map((batch) => (
                    <div key={batch.id} className="p-3 bg-gray-50 rounded-lg space-y-1">
                      <div className="flex items-center gap-2">
                        {batch.status === 'completed' ? (
                          <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                        ) : batch.status === 'failed' ? (
                          <XCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                        ) : (
                          <Clock className="w-4 h-4 text-yellow-600 flex-shrink-0" />
                        )}
                        <span className="text-sm font-medium truncate">{batch.file_name}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <span>{batch.valid_rows || 0} valid</span>
                        {batch.imported_rows > 0 && <span>• {batch.imported_rows} imported</span>}
                        {batch.dry_run && <Badge variant="outline" className="text-xs px-1 py-0">Dry Run</Badge>}
                      </div>
                      <p className="text-xs text-gray-400">
                        {new Date(batch.created_date).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}