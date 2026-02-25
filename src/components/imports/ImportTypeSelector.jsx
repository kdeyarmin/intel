import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Database, TrendingUp, Activity, Users } from 'lucide-react';

const importTypes = [
  {
    id: 'nppes_monthly',
    name: 'NPPES File Upload',
    description: 'Upload NPPES CSV file',
    icon: Users,
    requiredColumns: ['NPI', 'Entity Type Code', 'Provider Last Name (Legal Name)', 'Provider First Name'],
    downloadUrl: 'https://download.cms.gov/nppes/NPI_Files.html'
  },
  {
    id: 'nppes_registry',
    name: 'NPPES Registry Search',
    description: 'Search & import from NPPES API',
    icon: Users,
    requiredColumns: [],
    downloadUrl: 'https://download.cms.gov/nppes/NPI_Files.html'
  },
  {
    id: 'cms_utilization',
    name: 'CMS Provider Utilization',
    description: 'Medicare Part B utilization and payment data',
    icon: TrendingUp,
    requiredColumns: ['NPI', 'Year', 'Total Services', 'Total Medicare Beneficiaries', 'Total Medicare Payment Amount'],
    downloadUrl: 'https://data.cms.gov/provider-summary-by-type-of-service/medicare-physician-other-practitioners/medicare-physician-other-practitioners-by-provider-and-service'
  },
  {
    id: 'cms_part_d',
    name: 'CMS Part D Prescriber',
    description: 'Medicare prescription drug claims data',
    icon: Activity,
    requiredColumns: ['NPI', 'Year', 'Total Claims', 'Total Drug Cost'],
    downloadUrl: 'https://data.cms.gov/provider-summary-by-type-of-service/medicare-part-d-prescribers/medicare-part-d-prescribers-by-provider-and-drug'
  },
  {
    id: 'cms_order_referring',
    name: 'Order & Referring Providers',
    description: 'Medicare ordering and referring provider data',
    icon: Database,
    requiredColumns: ['NPI', 'HHA', 'HOSPICE', 'DME', 'PARTB'],
    downloadUrl: 'https://data.cms.gov/provider-characteristics/medicare-provider-supplier-enrollment/ordering-and-referring'
  },
  {
    id: 'nursing_home_chains',
    name: 'Nursing Home Chain Performance',
    description: 'CMS nursing home chain performance measures',
    icon: TrendingUp,
    requiredColumns: ['Chain', 'Chain ID', 'Number of facilities', 'Average overall 5-star rating'],
    downloadUrl: 'https://data.cms.gov/provider-data/dataset/b2ux-wtdv'
  },
  {
    id: 'home_health_cost_reports',
    name: 'Home Health Cost Reports',
    description: 'CMS home health agency financial and utilization data',
    icon: TrendingUp,
    requiredColumns: ['rpt_rec_num', 'Provider CCN', 'HHA Name', 'Total Cost'],
    downloadUrl: 'https://data.cms.gov/provider-compliance/cost-report/home-health-agency-cost-report'
  },
  {
    id: 'provider_ownership',
    name: 'Provider Ownership Data',
    description: 'CMS provider ownership and organizational control information',
    icon: Database,
    requiredColumns: ['ENROLLMENT ID', 'ASSOCIATE ID', 'ORGANIZATION NAME', 'ASSOCIATE ID - OWNER'],
    downloadUrl: 'https://data.cms.gov/provider-characteristics/medicare-provider-supplier-enrollment/provider-and-supplier-ownership'
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
                  {type.downloadUrl && (
                    <a href={type.downloadUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline mt-1 inline-block" onClick={e => e.stopPropagation()}>
                      Download source file
                    </a>
                  )}
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