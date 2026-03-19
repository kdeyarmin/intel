import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Stethoscope } from 'lucide-react';

export default function TaxonomyList({ taxonomies = [] }) {
  if (!taxonomies.length) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Stethoscope className="w-4 h-4 text-teal-600" />
          Specialties & Taxonomies
          <Badge variant="outline" className="ml-auto text-xs">{taxonomies.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {taxonomies.map((t, i) => (
            <div key={i} className="flex items-center justify-between p-2.5 rounded-lg border bg-slate-800/40">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900 truncate">
                  {t.taxonomy_description || t.taxonomy_code}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-slate-500 font-mono">{t.taxonomy_code}</span>
                  {t.license_number && <span className="text-xs text-slate-400">Lic: {t.license_number}</span>}
                  {t.state && <span className="text-xs text-slate-400">{t.state}</span>}
                </div>
              </div>
              {t.primary_flag && (
                <Badge className="bg-teal-100 text-teal-700 text-[10px] ml-2">Primary</Badge>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}