import React, { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download, Play, Square, Mail, Users, AlertTriangle, Loader2, CheckCircle2 } from 'lucide-react';

const BATCH_SIZE = 25;

const confColors = {
  high: 'bg-green-100 text-green-800',
  medium: 'bg-yellow-100 text-yellow-800',
  low: 'bg-red-100 text-red-800',
};

export default function BulkEmailExport() {
  const [entityFilter, setEntityFilter] = useState('Individual');
  const [credentialFilter, setCredentialFilter] = useState('MD, DO, NP, PA');
  const [allResults, setAllResults] = useState([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ processed: 0, total: 0 });
  const [error, setError] = useState(null);
  const abortRef = useRef(false);

  const startExport = async () => {
    setRunning(true);
    setError(null);
    setAllResults([]);
    abortRef.current = false;

    let offset = 0;
    let totalCount = null;
    const accumulated = [];

    while (true) {
      if (abortRef.current) break;

      const response = await base44.functions.invoke('bulkEmailLookup', {
        offset,
        limit: BATCH_SIZE,
        entity_type_filter: entityFilter,
        credential_filter: credentialFilter,
      });

      const data = response.data;
      if (data.error) {
        setError(data.error);
        break;
      }

      if (totalCount === null) totalCount = data.totalCount;

      accumulated.push(...data.results);
      setAllResults([...accumulated]);
      setProgress({ processed: accumulated.length, total: totalCount });

      offset += BATCH_SIZE;
      if (offset >= totalCount || data.results.length === 0) break;
    }

    setRunning(false);
  };

  const stopExport = () => {
    abortRef.current = true;
  };

  const downloadCSV = () => {
    const headers = ['NPI', 'Name', 'Credential', 'Organization', 'Specialty', 'City', 'State', 'Phone', 'Email', 'Email Confidence', 'Email Source'];
    const rows = allResults.map(r => [
      r.npi, r.name, r.credential, r.organization, r.specialty,
      r.city, r.state, r.phone, r.email, r.email_confidence, r.email_source
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `provider_emails_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    a.remove();
  };

  const pct = progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0;
  const emailsFound = allResults.filter(r => r.email).length;
  const highConf = allResults.filter(r => r.email_confidence === 'high').length;
  const medConf = allResults.filter(r => r.email_confidence === 'medium').length;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Bulk Email Export</h1>
        <p className="text-sm text-gray-500 mt-1">
          AI-powered email lookup for all providers. Processes in batches of {BATCH_SIZE}.
        </p>
      </div>

      {/* Config Card */}
      <Card className="bg-white">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Export Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Provider Type</label>
              <Select value={entityFilter} onValueChange={setEntityFilter} disabled={running}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Individual">Individual Providers</SelectItem>
                  <SelectItem value="Organization">Organizations</SelectItem>
                  <SelectItem value={null}>All Types</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Credentials (comma-separated)</label>
              <Input
                value={credentialFilter}
                onChange={(e) => setCredentialFilter(e.target.value)}
                placeholder="MD, DO, NP, PA"
                disabled={running}
              />
            </div>
            <div className="flex gap-2">
              {!running ? (
                <Button onClick={startExport} className="bg-blue-600 hover:bg-blue-700 flex-1">
                  <Play className="w-4 h-4 mr-2" />
                  Start Export
                </Button>
              ) : (
                <Button onClick={stopExport} variant="destructive" className="flex-1">
                  <Square className="w-4 h-4 mr-2" />
                  Stop
                </Button>
              )}
              {allResults.length > 0 && (
                <Button onClick={downloadCSV} variant="outline">
                  <Download className="w-4 h-4 mr-2" />
                  Download CSV
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Progress */}
      {(running || allResults.length > 0) && (
        <Card className="bg-white">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {running ? (
                  <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                )}
                <span className="text-sm font-medium">
                  {running ? 'Processing...' : 'Complete'}
                </span>
              </div>
              <span className="text-sm text-gray-500">
                {progress.processed} / {progress.total} providers ({pct}%)
              </span>
            </div>
            <Progress value={pct} className="h-2" />

            {/* Stats */}
            <div className="grid grid-cols-4 gap-4 mt-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-900">{allResults.length}</p>
                <p className="text-xs text-gray-500">Processed</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600">{emailsFound}</p>
                <p className="text-xs text-gray-500">Emails Found</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">{highConf}</p>
                <p className="text-xs text-gray-500">High Confidence</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-yellow-600">{medConf}</p>
                <p className="text-xs text-gray-500">Medium Confidence</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
          <AlertTriangle className="w-4 h-4 text-red-500" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Results Table */}
      {allResults.length > 0 && (
        <Card className="bg-white">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Mail className="w-4 h-4 text-blue-600" />
              Results ({allResults.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-auto max-h-[500px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>NPI</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Credential</TableHead>
                    <TableHead>Specialty</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Confidence</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allResults.map((r, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="text-xs font-mono">{r.npi}</TableCell>
                      <TableCell className="text-sm font-medium">{r.name}</TableCell>
                      <TableCell className="text-xs">{r.credential}</TableCell>
                      <TableCell className="text-xs max-w-[150px] truncate">{r.specialty}</TableCell>
                      <TableCell className="text-xs">{r.city}{r.state ? `, ${r.state}` : ''}</TableCell>
                      <TableCell className="text-sm">{r.email || <span className="text-gray-400">—</span>}</TableCell>
                      <TableCell>
                        {r.email_confidence && (
                          <Badge className={confColors[r.email_confidence] + ' text-xs'}>
                            {r.email_confidence}
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex items-start gap-1.5 bg-amber-50 border border-amber-200 rounded-lg p-3">
        <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
        <p className="text-xs text-amber-700">
          <strong>Disclaimer:</strong> Email addresses are AI-generated suggestions based on web searches and domain pattern inference. They are not verified. Always confirm before sending outreach. This process uses AI credits for each batch of {BATCH_SIZE} providers.
        </p>
      </div>
    </div>
  );
}