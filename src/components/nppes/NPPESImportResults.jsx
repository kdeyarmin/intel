import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, Users, MapPin, Stethoscope, AlertTriangle } from 'lucide-react';

export default function NPPESImportResults({ result }) {
  if (!result) return null;

  const stats = [
    { label: 'Total Fetched', value: result.total_fetched, color: 'text-gray-900' },
    { label: 'Valid Records', value: result.valid_rows, color: 'text-green-700' },
    { label: 'Invalid', value: result.invalid_rows, color: 'text-red-600' },
    { label: 'Duplicates', value: result.duplicate_rows, color: 'text-yellow-600' },
  ];

  const importStats = result.dry_run ? [] : [
    { label: 'Providers Imported', value: result.imported_providers, icon: Users, color: 'bg-blue-100 text-blue-700' },
    { label: 'Locations Imported', value: result.imported_locations, icon: MapPin, color: 'bg-green-100 text-green-700' },
    { label: 'Taxonomies Imported', value: result.imported_taxonomies, icon: Stethoscope, color: 'bg-purple-100 text-purple-700' },
  ];

  return (
    <Card className="border-green-200">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-green-700">
          <CheckCircle2 className="w-5 h-5" />
          {result.dry_run ? 'Validation Complete' : 'Import Complete'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {stats.map(s => (
            <div key={s.label} className="p-3 bg-gray-50 rounded-lg text-center">
              <p className={`text-2xl font-bold ${s.color}`}>{(s.value || 0).toLocaleString()}</p>
              <p className="text-xs text-gray-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Import Detail Stats */}
        {importStats.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            {importStats.map(s => {
              const Icon = s.icon;
              return (
                <div key={s.label} className={`p-3 rounded-lg text-center ${s.color}`}>
                  <Icon className="w-5 h-5 mx-auto mb-1" />
                  <p className="text-xl font-bold">{(s.value || 0).toLocaleString()}</p>
                  <p className="text-xs mt-1">{s.label}</p>
                </div>
              );
            })}
          </div>
        )}

        {result.dry_run && (
          <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
            <AlertTriangle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-blue-800">
              This was a dry run — no data was written. Turn off "Dry Run Mode" and run again to import.
            </p>
          </div>
        )}

        <div className="text-xs text-gray-400">
          Batch ID: {result.batch_id}
        </div>
      </CardContent>
    </Card>
  );
}