import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Database, TrendingUp, Activity } from 'lucide-react';

const importTypes = [
  {
    id: 'nppes_monthly',
    name: 'NPPES Monthly Download',
    description: 'National Provider Identifier registry data',
    icon: FileText,
    requiredColumns: ['NPI', 'Entity Type Code', 'Provider Last Name (Legal Name)', 'Provider First Name'],
  },
  {
    id: 'cms_utilization',
    name: 'CMS Provider Utilization',
    description: 'Medicare Part B utilization and payment data',
    icon: TrendingUp,
    requiredColumns: ['NPI', 'Year', 'Total Services', 'Total Medicare Beneficiaries', 'Total Medicare Payment Amount'],
  },
  {
    id: 'cms_part_d',
    name: 'CMS Part D Prescriber',
    description: 'Medicare prescription drug claims data',
    icon: Activity,
    requiredColumns: ['NPI', 'Year', 'Total Claims', 'Total Drug Cost'],
  },
  {
    id: 'cms_order_referring',
    name: 'Order & Referring Providers',
    description: 'Medicare ordering and referring provider data',
    icon: Database,
    requiredColumns: ['NPI', 'HHA', 'HOSPICE', 'DME', 'PARTB'],
  },
  {
    id: 'pa_home_health',
    name: 'PA Home Health Agencies',
    description: 'Pennsylvania home health agency provider list',
    icon: FileText,
    requiredColumns: ['NPI', 'Agency Name', 'City', 'State', 'License Number'],
  },
  {
    id: 'hospice_providers',
    name: 'Hospice Provider List',
    description: 'Medicare-certified hospice providers',
    icon: Database,
    requiredColumns: ['NPI', 'Provider Name', 'City', 'State', 'Certification Date'],
  },
  {
    id: 'nursing_home_chains',
    name: 'Nursing Home Chain Performance',
    description: 'CMS nursing home chain performance measures',
    icon: TrendingUp,
    requiredColumns: ['Chain', 'Chain ID', 'Number of facilities', 'Average overall 5-star rating'],
  },
  {
    id: 'hospice_enrollments',
    name: 'Hospice Enrollments',
    description: 'CMS hospice provider enrollment data',
    icon: Database,
    requiredColumns: ['ENROLLMENT ID', 'NPI', 'CCN', 'ORGANIZATION NAME'],
  },
  {
    id: 'home_health_enrollments',
    name: 'Home Health Enrollments',
    description: 'CMS home health agency enrollment data',
    icon: Database,
    requiredColumns: ['ENROLLMENT ID', 'NPI', 'CCN', 'ORGANIZATION NAME'],
  },
  {
    id: 'home_health_cost_reports',
    name: 'Home Health Cost Reports',
    description: 'CMS home health agency financial and utilization data',
    icon: TrendingUp,
    requiredColumns: ['rpt_rec_num', 'Provider CCN', 'HHA Name', 'Total Cost'],
  },
  {
    id: 'cms_service_utilization',
    name: 'Medicare Service Utilization',
    description: 'CMS Medicare service utilization by HCPCS code',
    icon: Activity,
    requiredColumns: ['HCPCS_Cd', 'HCPCS_Desc', 'Tot_Rndrng_Prvdrs', 'Tot_Benes'],
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