import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, CheckCircle, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function DataImports() {
  const [file, setFile] = useState(null);
  const [importType, setImportType] = useState('');
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const queryClient = useQueryClient();

  const importTypes = [
    { value: 'nppes', label: 'NPPES Provider Data' },
    { value: 'cms_utilization', label: 'CMS Utilization Data' },
    { value: 'cms_referral', label: 'CMS Referral Data' },
  ];

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
    setResult(null);
  };

  const handleImport = async () => {
    if (!file || !importType) {
      setResult({ success: false, message: 'Please select a file and import type' });
      return;
    }

    setUploading(true);
    setResult(null);

    try {
      const user = await base44.auth.me();
      
      // Upload file
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      
      // Fetch and parse CSV (simplified - in production use ExtractDataFromUploadedFile)
      const response = await fetch(file_url);
      const text = await response.text();
      const lines = text.split('\n').filter(l => l.trim());
      const headers = lines[0].split(',').map(h => h.trim());
      
      let importedCount = 0;

      if (importType === 'nppes') {
        // Parse NPPES data
        for (let i = 1; i < Math.min(lines.length, 100); i++) {
          const values = lines[i].split(',').map(v => v.trim());
          const row = {};
          headers.forEach((h, idx) => { row[h] = values[idx]; });
          
          if (row.NPI) {
            await base44.entities.Provider.create({
              npi: row.NPI,
              entity_type: row['Entity Type Code'] === '1' ? 'Individual' : 'Organization',
              first_name: row['Provider First Name'],
              last_name: row['Provider Last Name (Legal Name)'],
              credential: row['Provider Credential Text'],
              gender: row['Provider Gender Code'],
              status: 'Active',
            });
            importedCount++;
          }
        }
      } else if (importType === 'cms_utilization') {
        for (let i = 1; i < Math.min(lines.length, 100); i++) {
          const values = lines[i].split(',').map(v => v.trim());
          const row = {};
          headers.forEach((h, idx) => { row[h] = values[idx]; });
          
          if (row.NPI) {
            await base44.entities.CMSUtilization.create({
              npi: row.NPI,
              year: parseInt(row.Year || '2023'),
              total_services: parseFloat(row['Total Services'] || 0),
              total_medicare_beneficiaries: parseFloat(row['Medicare Beneficiaries'] || 0),
              total_medicare_payment: parseFloat(row['Medicare Payment'] || 0),
            });
            importedCount++;
          }
        }
      }

      // Log audit event
      await base44.entities.AuditEvent.create({
        event_type: 'import',
        user_email: user.email,
        details: {
          action: 'CSV Import',
          entity: importType,
          row_count: importedCount,
          file_name: file.name,
        },
        timestamp: new Date().toISOString(),
      });

      setResult({ success: true, message: `Successfully imported ${importedCount} records` });
      queryClient.invalidateQueries();
    } catch (error) {
      setResult({ success: false, message: error.message });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Data Imports</h1>
        <p className="text-gray-600 mt-1">Upload and process NPPES and CMS datasets</p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Upload CSV File</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Import Type</Label>
            <Select value={importType} onValueChange={setImportType}>
              <SelectTrigger>
                <SelectValue placeholder="Select data type..." />
              </SelectTrigger>
              <SelectContent>
                {importTypes.map(type => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>CSV File</Label>
            <Input
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              disabled={uploading}
            />
            {file && (
              <p className="text-sm text-gray-600">Selected: {file.name}</p>
            )}
          </div>

          <Button
            onClick={handleImport}
            disabled={!file || !importType || uploading}
            className="w-full bg-teal-600 hover:bg-teal-700"
          >
            <Upload className="w-4 h-4 mr-2" />
            {uploading ? 'Importing...' : 'Import Data'}
          </Button>

          {result && (
            <Alert variant={result.success ? 'default' : 'destructive'}>
              {result.success ? (
                <CheckCircle className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              <AlertDescription>{result.message}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}