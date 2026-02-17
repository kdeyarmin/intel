import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Database, TrendingUp, Activity } from 'lucide-react';

const importTypes = [
  {
    id: 'nppes',
    name: 'NPPES Bulk File',
    description: 'National Provider Identifier registry data',
    icon: FileText,
    requiredColumns: ['NPI', 'Entity Type Code', 'Provider Last Name (Legal Name)', 'Provider First Name', 'Provider Credential Text'],
  },
  {
    id: 'cms_physician_compare',
    name: 'CMS Physician Compare',
    description: 'Provider directory and quality measures',
    icon: Database,
    requiredColumns: ['NPI', 'First Name', 'Last Name', 'Organization Legal Name', 'Credential'],
  },
  {
    id: 'cms_part_b_utilization',
    name: 'CMS Part B Utilization',
    description: 'Medicare claims and payment data',
    icon: TrendingUp,
    requiredColumns: ['NPI', 'Year', 'Total Services', 'Medicare Beneficiaries', 'Medicare Payment Amount'],
  },
  {
    id: 'cms_referrals',
    name: 'CMS Referral Data',
    description: 'Home health, hospice, SNF referral patterns',
    icon: Activity,
    requiredColumns: ['NPI', 'Year', 'Total Referrals', 'Home Health Referrals', 'Hospice Referrals'],
  },
];

export default function ImportTypeSelector({ onSelect }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {importTypes.map(type => {
        const Icon = type.icon;
        return (
          <Card key={type.id} className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => onSelect(type)}>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-teal-100 flex items-center justify-center">
                  <Icon className="w-6 h-6 text-teal-600" />
                </div>
                <div>
                  <CardTitle className="text-lg">{type.name}</CardTitle>
                  <p className="text-sm text-gray-500">{type.description}</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700">Required columns:</p>
                <div className="flex flex-wrap gap-2">
                  {type.requiredColumns.slice(0, 3).map(col => (
                    <span key={col} className="text-xs bg-gray-100 px-2 py-1 rounded">
                      {col}
                    </span>
                  ))}
                  {type.requiredColumns.length > 3 && (
                    <span className="text-xs text-gray-500">+{type.requiredColumns.length - 3} more</span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export { importTypes };