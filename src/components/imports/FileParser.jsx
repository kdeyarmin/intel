import React, { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Loader2, FileText, FileSpreadsheet, File } from 'lucide-react';
import { base44 } from '@/api/base44Client';

function getFileIcon(ext) {
  if (ext === 'csv' || ext === 'txt' || ext === 'tsv') return FileText;
  if (ext === 'xlsx' || ext === 'xls') return FileSpreadsheet;
  return File;
}

function getExtension(name) {
  return (name || '').split('.').pop().toLowerCase();
}

export default function FileParser({ onParsed, selectedType }) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');

  const handleFileSelect = async (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    setError('');
    setUploading(true);
    setProgress(10);
    setFileName(selectedFile.name);

    const ext = getExtension(selectedFile.name);

    if (!['csv', 'txt', 'tsv', 'xlsx', 'xls', 'json'].includes(ext)) {
      setError('Unsupported file type. Please upload CSV, TXT, TSV, Excel (XLSX/XLS), or JSON files.');
      setUploading(false);
      setProgress(0);
      return;
    }

    try {
      setProgress(20);

      // Upload the file first
      const { file_url } = await base44.integrations.Core.UploadFile({ file: selectedFile });
      setProgress(50);

      if (ext === 'xlsx' || ext === 'xls') {
        // Use ExtractDataFromUploadedFile for Excel
        const schema = {};
        if (selectedType?.requiredColumns) {
          schema.type = 'array';
          schema.items = { type: 'object', properties: {} };
          selectedType.requiredColumns.forEach(col => {
            schema.items.properties[col] = { type: 'string' };
          });
        } else {
          schema.type = 'array';
          schema.items = { type: 'object' };
        }

        const result = await base44.integrations.Core.ExtractDataFromUploadedFile({
          file_url,
          json_schema: schema,
        });

        setProgress(80);

        if (result.status === 'error') {
          setError(`Excel parsing failed: ${result.details}`);
          setUploading(false);
          setProgress(0);
          return;
        }

        const rows = Array.isArray(result.output) ? result.output : [result.output];
        if (rows.length === 0) {
          setError('No data found in the Excel file.');
          setUploading(false);
          setProgress(0);
          return;
        }

        const headers = Object.keys(rows[0]);
        setProgress(100);

        setTimeout(() => {
          onParsed({ headers, file: selectedFile, file_url, parseMode: 'excel', rowCount: rows.length });
          setUploading(false);
          setProgress(0);
        }, 300);

      } else if (ext === 'json') {
        const response = await fetch(file_url);
        const text = await response.text();
        setProgress(70);

        const parsed = JSON.parse(text);
        const rows = Array.isArray(parsed) ? parsed : [parsed];
        if (rows.length === 0) {
          setError('No data found in the JSON file.');
          setUploading(false);
          setProgress(0);
          return;
        }

        const headers = Object.keys(rows[0]);
        setProgress(100);

        setTimeout(() => {
          onParsed({ headers, file: selectedFile, file_url, parseMode: 'json', rowCount: rows.length });
          setUploading(false);
          setProgress(0);
        }, 300);

      } else {
        // CSV / TXT / TSV — read headers locally from the file (no upload needed yet)
        const delimiter = ext === 'tsv' ? '\t' : ',';

        // Read just the first 10KB of the file locally to extract headers
        const slice = selectedFile.slice(0, 10000);
        const text = await slice.text();
        setProgress(70);

        const firstLine = text.split('\n')[0];
        const headers = firstLine.split(delimiter).map(h => h.trim().replace(/"/g, ''));
        setProgress(100);

        // For large files (>50MB), skip the upload here — it will be done during import
        const isLargeFile = selectedFile.size > 50 * 1024 * 1024;

        if (isLargeFile) {
          setTimeout(() => {
            onParsed({ headers, file: selectedFile, file_url: null, parseMode: 'csv_large', delimiter });
            setUploading(false);
            setProgress(0);
          }, 300);
        } else {
          setTimeout(() => {
            onParsed({ headers, file: selectedFile, file_url, parseMode: 'csv', delimiter });
            setUploading(false);
            setProgress(0);
          }, 300);
        }
      }
    } catch (err) {
      setError('Error parsing file: ' + err.message);
      setUploading(false);
      setProgress(0);
    }
  };

  return (
    <div className="space-y-3">
      <Label>Upload File</Label>
      <div className="flex items-center gap-2 mb-1">
        <Badge variant="outline" className="text-[10px]">CSV</Badge>
        <Badge variant="outline" className="text-[10px]">TXT</Badge>
        <Badge variant="outline" className="text-[10px]">TSV</Badge>
        <Badge variant="outline" className="text-[10px]">XLSX</Badge>
        <Badge variant="outline" className="text-[10px]">XLS</Badge>
        <Badge variant="outline" className="text-[10px]">JSON</Badge>
      </div>
      <Input
        type="file"
        accept=".csv,.txt,.tsv,.xlsx,.xls,.json"
        onChange={handleFileSelect}
        disabled={uploading}
      />

      {uploading && (
        <div className="space-y-2 pt-2">
          <div className="flex items-center gap-3">
            <Loader2 className="w-4 h-4 animate-spin text-teal-600" />
            <span className="text-sm text-gray-600">
              Parsing {fileName}...
            </span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
    </div>
  );
}