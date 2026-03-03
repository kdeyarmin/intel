import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Users, Activity, Building2, FileText, BarChart3, Clock, CalendarClock } from 'lucide-react';
import { format, formatDistanceToNow, addMonths } from 'date-fns';

const IMPORT_CATEGORIES = [
  {
    id: 'providers',
    label: 'Provider Data',
    description: 'NPPES provider registry, monthly downloads',
    icon: Users,
    color: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
    types: [
      { id: 'nppes_monthly', name: 'NPPES File Upload', description: 'Upload NPPES CSV file', requiredColumns: ['NPI', 'Entity Type Code', 'Provider Last Name (Legal Name)', 'Provider First Name'], downloadUrl: 'https://download.cms.gov/nppes/NPI_Files.html' },
      { id: 'nppes_registry', name: 'NPPES Registry Search', description: 'Search & import from NPPES API', requiredColumns: [], downloadUrl: 'https://download.cms.gov/nppes/NPI_Files.html' },
    ]
  },
  {
    id: 'claims',
    label: 'CMS Claims & Utilization',
    description: 'Utilization, Part D, referrals, services',
    icon: Activity,
    color: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    types: [
      { id: 'cms_utilization', name: 'Provider Utilization', description: 'Medicare Part B utilization', requiredColumns: ['NPI', 'Year', 'Total Services', 'Total Medicare Beneficiaries', 'Total Medicare Payment Amount'], downloadUrl: 'https://data.cms.gov/provider-summary-by-type-of-service/medicare-physician-other-practitioners/medicare-physician-other-practitioners-by-provider-and-service' },
      { id: 'cms_part_d', name: 'Part D Prescriber', description: 'Prescription drug claims', requiredColumns: ['NPI', 'Year', 'Total Claims', 'Total Drug Cost'], downloadUrl: 'https://data.cms.gov/provider-summary-by-type-of-service/medicare-part-d-prescribers/medicare-part-d-prescribers-by-provider-and-drug' },
      { id: 'cms_order_referring', name: 'Order & Referring', description: 'Ordering and referring data', requiredColumns: ['NPI', 'HHA', 'HOSPICE', 'DME', 'PARTB'], downloadUrl: 'https://data.cms.gov/provider-characteristics/medicare-provider-supplier-enrollment/ordering-and-referring' },
      { id: 'medicare_part_d_stats', name: 'Medicare Part D Stats', description: 'Detailed Part D statistics', requiredColumns: ['Year', 'NPI', 'Total_Claims'], downloadUrl: 'https://data.cms.gov/provider-summary-by-type-of-service/medicare-part-d-prescribers' },
      { id: 'cms_service_utilization', name: 'CMS Service Utilization', description: 'Detailed service utilization', requiredColumns: ['NPI', 'Service_Code'], downloadUrl: 'https://data.cms.gov/' }
    ]
  },
  {
    id: 'enrollment',
    label: 'Enrollment & Ownership',
    description: 'Home health, hospice, provider ownership',
    icon: Building2,
    color: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
    types: [
      { id: 'provider_ownership', name: 'Provider Ownership', description: 'Ownership & control info', requiredColumns: ['ENROLLMENT ID', 'ASSOCIATE ID', 'ORGANIZATION NAME', 'ASSOCIATE ID - OWNER'], downloadUrl: 'https://data.cms.gov/provider-characteristics/medicare-provider-supplier-enrollment/provider-and-supplier-ownership' },
    ]
  },
  {
    id: 'facilities',
    label: 'Facility & Cost Data',
    description: 'Nursing homes, cost reports, DRG, PDGM',
    icon: FileText,
    color: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    types: [
      { id: 'nursing_home_chains', name: 'Nursing Home Chains', description: 'Chain performance data', requiredColumns: ['Chain', 'Chain ID', 'Number of facilities', 'Average overall 5-star rating'], downloadUrl: 'https://data.cms.gov/provider-data/dataset/b2ux-wtdv' },
      { id: 'home_health_cost_reports', name: 'Cost Reports', description: 'HHA financial data', requiredColumns: ['rpt_rec_num', 'Provider CCN', 'HHA Name', 'Total Cost'], downloadUrl: 'https://data.cms.gov/provider-compliance/cost-report/home-health-agency-cost-report' },
    ]
  },
];

export { IMPORT_CATEGORIES };

export default function ImportCategoryCards({ onSelectCategory, batches = [] }) {
  // Only use categories that have items in them
  const activeCategories = IMPORT_CATEGORIES.filter(cat => cat.types.length > 0);
  // Compute last completed import date per category
  const categoryDates = React.useMemo(() => {
    const dateMap = {};
    activeCategories.forEach(cat => {
      const typeIds = cat.types.map(t => t.id);
      const completedBatches = batches
        .filter(b => typeIds.includes(b.import_type) && b.status === 'completed' && b.completed_at)
        .sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at));
      
      if (completedBatches.length > 0) {
        const lastDate = new Date(completedBatches[0].completed_at);
        dateMap[cat.id] = {
          lastUpdate: lastDate,
          nextExpected: addMonths(lastDate, 1),
        };
      }
    });
    return dateMap;
  }, [batches]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
      {activeCategories.map(cat => {
        const Icon = cat.icon;
        const dates = categoryDates[cat.id];
        return (
          <Card
            key={cat.id}
            className={`cursor-pointer hover:scale-[1.02] transition-all border ${cat.color} bg-[#141d30]`}
            onClick={() => onSelectCategory(cat)}
          >
            <CardContent className="pt-4 pb-4 px-4">
              <div className="flex items-center gap-2 mb-2">
                <Icon className="w-5 h-5" />
                <h3 className="text-sm font-semibold text-slate-200">{cat.label}</h3>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">{cat.description}</p>
              {dates ? (
                <div className="mt-2 space-y-0.5">
                  <div className="flex items-center gap-1 text-[10px] text-slate-400">
                    <Clock className="w-3 h-3 text-slate-500" />
                    <span>Updated {formatDistanceToNow(dates.lastUpdate, { addSuffix: true })}</span>
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-slate-500">
                    <CalendarClock className="w-3 h-3 text-slate-600" />
                    <span>Next: {format(dates.nextExpected, 'MMM d, yyyy')}</span>
                  </div>
                </div>
              ) : (
                <p className="text-[10px] text-slate-600 mt-2">No imports yet</p>
              )}
              <p className="text-[10px] text-slate-600 mt-1">{cat.types.length} dataset{cat.types.length !== 1 ? 's' : ''}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}