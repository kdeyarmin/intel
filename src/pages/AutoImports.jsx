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
  const [importType, setImportType] = useState('cms_order_referring');
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
    const zipTypes = ['medicare_hha_stats', 'medicare_ma_inpatient', 'medicare_part_d_stats', 'medicare_snf_stats'];
    const isZip = zipTypes.includes(importType);
    
    // Only require URL for non-zip, non-default types
    if (!isZip && !fileUrl) {
      alert('Please provide a file URL');
      return;
    }

    setProcessing(true);
    try {
      // Use triggerImport which routes to the right handler and has built-in URLs
      const res = await base44.functions.invoke('triggerImport', {
        import_type: importType,
        file_url: fileUrl || undefined,
        year: parseInt(year),
        dry_run: dryRun,
      });
      const result = res.data?.result || res.data;

      if (isZip) {
        alert(
          dryRun 
            ? `Validation complete: ${result.total_records || 0} records from ${result.sheets_parsed?.length || 0} sheets`
            : `Import complete: ${result.imported || 0} records from ${result.sheets_parsed?.length || 0} sheets`
        );
      } else if (result.partial) {
        alert(
          `Partial import: ${result.imported_rows || 0} imported so far, will resume at offset ${result.next_offset}. Run again to continue.`
        );
      } else {
        alert(
          dryRun 
            ? `Validation complete: ${result.valid_rows || 0} valid, ${result.invalid_rows || 0} invalid, ${result.duplicate_rows || 0} duplicates`
            : `Import complete: ${result.imported_rows || 0} new, ${result.updated_rows || 0} updated, ${result.skipped_rows || 0} skipped`
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
                  <SelectItem value="cms_order_referring">CMS Order/Referring</SelectItem>
                  <SelectItem value="opt_out_physicians">Opt-Out Physicians</SelectItem>
                  <SelectItem value="home_health_enrollments">Home Health Enrollments</SelectItem>
                  <SelectItem value="hospice_enrollments">Hospice Enrollments</SelectItem>
                  <SelectItem value="provider_service_utilization">Provider Service Utilization</SelectItem>
                  <SelectItem value="medicare_hha_stats">Medicare HHA Use & Payments</SelectItem>
                  <SelectItem value="medicare_ma_inpatient">Medicare Advantage Inpatient Hospital</SelectItem>
                  <SelectItem value="medicare_part_d_stats">Medicare Part D Use & Payments</SelectItem>
                  <SelectItem value="medicare_snf_stats">Medicare SNF Use & Payments</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>File URL {['medicare_hha_stats','medicare_ma_inpatient','medicare_part_d_stats','medicare_snf_stats','cms_order_referring','opt_out_physicians','home_health_enrollments','hospice_enrollments','provider_service_utilization'].includes(importType) ? '(optional — auto-detected)' : ''}</Label>
              <Input
                placeholder="Leave blank to use CMS default URL"
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
              disabled={processing}
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
                        {batch.imported_rows > 0 && ` • ${batch.imported_rows} new`}
                        {batch.updated_rows > 0 && ` • ${batch.updated_rows} updated`}
                        {batch.skipped_rows > 0 && ` • ${batch.skipped_rows} skipped`}
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