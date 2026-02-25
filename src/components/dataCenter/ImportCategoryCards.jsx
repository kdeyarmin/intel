import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Users, Activity, Building2, FileText, BarChart3, Clock, CalendarClock } from 'lucide-react';
import { format, formatDistanceToNow, addMonths } from 'date-fns';

const IMPORT_CATEGORIES = [
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
      { id: 'provider_service_utilization', name: 'Service Utilization', description: 'Provider-level HCPCS', requiredColumns: ['Rndrng_NPI', 'HCPCS_Cd', 'HCPCS_Desc', 'Tot_Benes'] },
    ]
  },
  {
    id: 'enrollment',
    label: 'Enrollment & Ownership',
    description: 'Home health, hospice, provider ownership',
    icon: Building2,
    color: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
    types: [
      { id: 'home_health_enrollments', name: 'Home Health Enrollments', description: 'HHA enrollment data', requiredColumns: ['ENROLLMENT ID', 'NPI', 'CCN', 'ORGANIZATION NAME'] },
      { id: 'hospice_enrollments', name: 'Hospice Enrollments', description: 'Hospice enrollment data', requiredColumns: ['ENROLLMENT ID', 'NPI', 'CCN', 'ORGANIZATION NAME'] },
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
      { id: 'pa_home_health', name: 'PA Home Health Agencies', description: 'PA home health list', requiredColumns: ['NPI', 'Agency Name', 'City', 'State', 'License Number'] },
      { id: 'hospice_providers', name: 'Hospice Providers', description: 'Certified hospice providers', requiredColumns: ['NPI', 'Provider Name', 'City', 'State', 'Certification Date'] },
      { id: 'nursing_home_chains', name: 'Nursing Home Chains', description: 'Chain performance data', requiredColumns: ['Chain', 'Chain ID', 'Number of facilities', 'Average overall 5-star rating'], downloadUrl: 'https://data.cms.gov/provider-data/dataset/b2ux-wtdv' },
      { id: 'home_health_cost_reports', name: 'Cost Reports', description: 'HHA financial data', requiredColumns: ['rpt_rec_num', 'Provider CCN', 'HHA Name', 'Total Cost'], downloadUrl: 'https://data.cms.gov/provider-compliance/cost-report/home-health-agency-cost-report' },
      { id: 'home_health_pdgm', name: 'PDGM Data', description: 'Patient-Driven Groupings', requiredColumns: ['PRVDR_ID', 'GRPNG', 'GRPNG_DESC', 'BENE_DSTNCT_CNT'] },
      { id: 'inpatient_drg', name: 'Inpatient DRG', description: 'Hospital DRG data', requiredColumns: ['Rndrng_Prvdr_CCN', 'DRG_Cd', 'DRG_Desc', 'Tot_Dschrgs'] },
    ]
  },
  {
    id: 'medicare_stats',
    label: 'Medicare Statistics',
    description: 'HHA, MA inpatient, Part D, SNF stats',
    icon: BarChart3,
    color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    types: [
      { id: 'medicare_hha_stats', name: 'HHA Stats', description: 'Home health use & payments', requiredColumns: [] },
      { id: 'medicare_ma_inpatient', name: 'MA Inpatient', description: 'Medicare Advantage hospital', requiredColumns: [] },
      { id: 'medicare_part_d_stats', name: 'Part D Stats', description: 'Part D use & payments', requiredColumns: [] },
      { id: 'medicare_snf_stats', name: 'SNF Stats', description: 'Skilled nursing stats', requiredColumns: [] },
    ]
  },
];

export { IMPORT_CATEGORIES };

export default function ImportCategoryCards({ onSelectCategory, batches = [] }) {
  // Compute last completed import date per category
  const categoryDates = React.useMemo(() => {
    const dateMap = {};
    IMPORT_CATEGORIES.forEach(cat => {
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
      {IMPORT_CATEGORIES.map(cat => {
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