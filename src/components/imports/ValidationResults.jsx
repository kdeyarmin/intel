import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, AlertCircle, XCircle } from 'lucide-react';

export default function ValidationResults({ batch }) {
  if (!batch) return null;

  const errorRate = batch.total_rows > 0 
    ? ((batch.invalid_rows / batch.total_rows) * 100).toFixed(1)
    : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Validation Results</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <p className="text-2xl font-bold text-blue-600">{batch.total_rows}</p>
            <p className="text-sm text-gray-600">Total Rows</p>
          </div>
          <div className="text-center p-4 bg-green-50 rounded-lg">
            <p className="text-2xl font-bold text-green-600">{batch.valid_rows}</p>
            <p className="text-sm text-gray-600">Valid Rows</p>
          </div>
          <div className="text-center p-4 bg-yellow-50 rounded-lg">
            <p className="text-2xl font-bold text-yellow-600">{batch.duplicate_rows || 0}</p>
            <p className="text-sm text-gray-600">Duplicates</p>
          </div>
          <div className="text-center p-4 bg-red-50 rounded-lg">
            <p className="text-2xl font-bold text-red-600">{batch.invalid_rows}</p>
            <p className="text-sm text-gray-600">Invalid Rows</p>
          </div>
        </div>

        {batch.invalid_rows > 0 && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {errorRate}% of rows have validation errors. Review samples below.
            </AlertDescription>
          </Alert>
        )}

        {batch.error_samples && batch.error_samples.length > 0 && (
          <div className="space-y-2">
            <p className="font-medium text-sm">Error Samples:</p>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {batch.error_samples.map((error, idx) => (
                <div key={idx} className="p-3 bg-red-50 border border-red-200 rounded text-sm">
                  <p className="font-medium text-red-800">Row {error.row}:</p>
                  <p className="text-red-700 mt-1">{error.message}</p>
                  {error.npi && <p className="text-xs text-gray-600 mt-1">NPI: {error.npi}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {batch.status === 'completed' && batch.dry_run && (
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>
              Dry run completed. No data was written. You can now run the actual import.
            </AlertDescription>
          </Alert>
        )}

        {batch.status === 'completed' && !batch.dry_run && (
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>
              Import completed: {batch.imported_rows || 0} new records, {batch.updated_rows || 0} updated{batch.skipped_rows > 0 ? `, ${batch.skipped_rows} skipped (unchanged)` : ''}.
            </AlertDescription>
          </Alert>
        )}

        {batch.status === 'failed' && (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertDescription>
              Import failed. {batch.error_samples?.[0]?.message || 'Check logs for details.'}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}