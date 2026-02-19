import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, Upload, Calendar, CheckCircle2, XCircle, Clock } from 'lucide-react';

export default function AutoImports() {
  const [importType, setImportType] = useState('cms_utilization');
  const [fileUrl, setFileUrl] = useState('');
  const [year, setYear] = useState('2023');
  const [dryRun, setDryRun] = useState(true);
  const [processing, setProcessing] = useState(false);

  const queryClient = useQueryClient();

  const { data: automations = [] } = useQuery({
    queryKey: ['automations'],
    queryFn: async () => {
      const response = await fetch('/.well-known/base44/automations');
      return response.json();
    },
  });

  const { data: recentBatches = [] } = useQuery({
    queryKey: ['recentImports'],
    queryFn: () => base44.entities.ImportBatch.list('-created_date', 20),
  });

  const handleImport = async () => {
    if (!fileUrl) {
      alert('Please provide a file URL');
      return;
    }

    setProcessing(true);
    try {
      let result;
      if (importType === 'medicare_hha_stats') {
        const res = await base44.functions.invoke('importMedicareHHA', {
          action: 'import',
          year: parseInt(year),
          custom_url: fileUrl || undefined,
          dry_run: dryRun,
        });
        result = res.data;
      } else if (importType === 'medicare_ma_inpatient') {
        const res = await base44.functions.invoke('importMedicareMAInpatient', {
          action: 'import',
          year: parseInt(year),
          custom_url: fileUrl || undefined,
          dry_run: dryRun,
        });
        result = res.data;
      } else {
        const res = await base44.functions.invoke('autoImportCMSData', {
          import_type: importType,
          file_url: fileUrl,
          year: parseInt(year),
          dry_run: dryRun,
        });
        result = res.data;
      }

      if (importType === 'medicare_hha_stats' || importType === 'medicare_ma_inpatient') {
        alert(
          dryRun 
            ? `Validation complete: ${result.total_records} records from ${result.sheets_parsed?.length || 0} sheets`
            : `Import complete: ${result.imported} records from ${result.sheets_parsed?.length || 0} sheets`
        );
      } else {
        alert(
          dryRun 
            ? `Validation complete: ${result.valid_rows} valid rows, ${result.invalid_rows} invalid`
            : `Import complete: ${result.imported_rows} imported, ${result.updated_rows} updated`
        );
      }

      setFileUrl('');
      queryClient.invalidateQueries(['recentImports']);
    } catch (error) {
      alert('Import failed: ' + error.message);
    } finally {
      setProcessing(false);
    }
  };

  const cmsAutomations = automations.filter(a => 
    a.function_name === 'autoImportCMSData'
  );

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Automated CMS Imports</h1>
        <p className="text-gray-600 mt-1">Schedule and manage automated data imports from CMS datasets</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Manual Import</CardTitle>
            <CardDescription>Import CMS data from a file URL</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Import Type</Label>
              <Select value={importType} onValueChange={setImportType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cms_utilization">CMS Utilization</SelectItem>
                  <SelectItem value="cms_order_referring">CMS Order/Referring</SelectItem>
                  <SelectItem value="cms_part_d">CMS Part D</SelectItem>
                  <SelectItem value="medicare_hha_stats">Medicare HHA Use & Payments</SelectItem>
                  <SelectItem value="medicare_ma_inpatient">Medicare Advantage Inpatient Hospital</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>File URL {(importType === 'medicare_hha_stats' || importType === 'medicare_ma_inpatient') ? '(optional — auto-detected by year)' : ''}</Label>
              <Input
                placeholder={(importType === 'medicare_hha_stats' || importType === 'medicare_ma_inpatient') ? 'Leave blank to use CMS default for selected year' : 'https://example.com/cms-data.csv'}
                value={fileUrl}
                onChange={(e) => setFileUrl(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Data Year</Label>
              <Input
                type="number"
                placeholder="2023"
                value={year}
                onChange={(e) => setYear(e.target.value)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label>Dry Run Mode</Label>
                <p className="text-sm text-gray-600">Validate only, don't import</p>
              </div>
              <Switch checked={dryRun} onCheckedChange={setDryRun} />
            </div>

            <Button
              onClick={handleImport}
              disabled={processing || (importType !== 'medicare_hha_stats' && importType !== 'medicare_ma_inpatient' && !fileUrl)}
              className="w-full bg-teal-600 hover:bg-teal-700"
            >
              {processing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  {dryRun ? 'Validate Data' : 'Import Data'}
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Scheduled Imports</CardTitle>
            <CardDescription>Automated import schedules</CardDescription>
          </CardHeader>
          <CardContent>
            {cmsAutomations.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No scheduled imports configured</p>
                <p className="text-sm mt-1">Configure schedules in Settings → Automations</p>
              </div>
            ) : (
              <div className="space-y-3">
                {cmsAutomations.map((auto) => (
                  <div key={auto.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium">{auto.name}</p>
                      <p className="text-sm text-gray-600">{auto.description}</p>
                    </div>
                    <Badge variant={auto.is_active ? 'default' : 'outline'}>
                      {auto.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Imports</CardTitle>
        </CardHeader>
        <CardContent>
          {recentBatches.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No import history yet
            </div>
          ) : (
            <div className="space-y-2">
              {recentBatches.slice(0, 10).map((batch) => (
                <div key={batch.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    {batch.status === 'completed' ? (
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                    ) : batch.status === 'failed' ? (
                      <XCircle className="w-5 h-5 text-red-600" />
                    ) : (
                      <Clock className="w-5 h-5 text-yellow-600" />
                    )}
                    <div>
                      <p className="font-medium">{batch.file_name}</p>
                      <p className="text-sm text-gray-600">
                        {batch.import_type?.replace(/_/g, ' ')} • 
                        {batch.valid_rows} valid rows
                        {batch.imported_rows > 0 && ` • ${batch.imported_rows} imported`}
                        {batch.updated_rows > 0 && ` • ${batch.updated_rows} updated`}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-500">
                      {new Date(batch.created_date).toLocaleString()}
                    </p>
                    {batch.dry_run && (
                      <Badge variant="outline" className="text-xs">Dry Run</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}