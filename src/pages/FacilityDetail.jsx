import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { ArrowLeft, Building2, MapPin, Star, DollarSign, Users, Calendar, Activity, FileText, Layers, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';

const FACILITY_LABELS = {
  hospital: { title: 'Hospital', back: 'Hospitals', iconCls: 'text-blue-400', badgeCls: 'bg-blue-900/30 text-blue-400 border-blue-500/30' },
  home_health: { title: 'Home Health Agency', back: 'HomeHealthAgencies', iconCls: 'text-green-400', badgeCls: 'bg-green-900/30 text-green-400 border-green-500/30' },
  hospice: { title: 'Hospice', back: 'Hospices', iconCls: 'text-purple-400', badgeCls: 'bg-purple-900/30 text-purple-400 border-purple-500/30' },
  snf: { title: 'Nursing Facility', back: 'NursingHomes', iconCls: 'text-amber-400', badgeCls: 'bg-amber-900/30 text-amber-400 border-amber-500/30' },
  dialysis: { title: 'Dialysis Facility', back: 'DialysisFacilities', iconCls: 'text-teal-400', badgeCls: 'bg-teal-900/30 text-teal-400 border-teal-500/30' },
  irf: { title: 'Inpatient Rehab Facility', back: 'InpatientRehab', iconCls: 'text-rose-400', badgeCls: 'bg-rose-900/30 text-rose-400 border-rose-500/30' },
  ltch: { title: 'Long-Term Care Hospital', back: 'LongTermCare', iconCls: 'text-orange-400', badgeCls: 'bg-orange-900/30 text-orange-400 border-orange-500/30' },
  dme: { title: 'DME Supplier', back: 'DMESuppliers', iconCls: 'text-cyan-400', badgeCls: 'bg-cyan-900/30 text-cyan-400 border-cyan-500/30' },
  fqhc: { title: 'Federally Qualified Health Center', back: 'FQHCs', iconCls: 'text-lime-400', badgeCls: 'bg-lime-900/30 text-lime-400 border-lime-500/30' },
  rhc: { title: 'Rural Health Clinic', back: 'RuralHealthClinics', iconCls: 'text-emerald-400', badgeCls: 'bg-emerald-900/30 text-emerald-400 border-emerald-500/30' },
};

const TYPE_LABELS = {
  hospital_readmissions: 'Readmissions',
  hospital_hcahps: 'Patient Experience (HCAHPS)',
  hospital_hcahps_survey: 'Patient Experience (HCAHPS)',
  hospital_timely_care: 'Timely & Effective Care',
  hospital_timely_effective_care: 'Timely & Effective Care',
  hospital_spending: 'Spending per Beneficiary',
  hospital_hac: 'Hospital-Acquired Conditions',
  hospital_hac_reduction: 'HAC Reduction Program',
  hospital_imaging: 'Outpatient Imaging Efficiency',
  hospital_service_area: 'Service Area',
  hospital_unplanned_visits: 'Unplanned Visits',
  hospital_payment_value: 'Payment & Value of Care',
  hospital_complications: 'Complications & Deaths',
  hospital_infections: 'Healthcare-Associated Infections',
  hospital_psychiatric: 'Psychiatric Services',
  hospital_psychiatric_facility: 'Psychiatric Services',
  hospital_asc_quality: 'ASC Quality',
  ambulatory_surgical_center: 'Ambulatory Surgical Center',
  hospital_spending_per_beneficiary: 'Spending per Beneficiary',
  hospital_spending_by_claim: 'Spending by Claim Type',
  medicare_inpatient_by_provider: 'Inpatient Utilization',
  medicare_outpatient_by_provider: 'Outpatient Utilization',
  medicare_ma_inpatient: 'MA Inpatient',
  home_health_agencies: 'Agency Info',
  home_health_enrollments: 'Enrollment Data',
  home_health_cost_report: 'Cost Report',
  home_health_patient_survey: 'Patient Survey',
  home_health_hhcahps: 'HHCAHPS Survey',
  medicare_hha_utilization: 'HHA Utilization',
  hospice_general_info: 'General Information',
  hospice_enrollments: 'Enrollment Data',
  hospice_provider_data: 'Provider Data',
  hospice_provider_measures: 'Quality Measures',
  hospice_national_measures: 'National Measures',
  hospice_state_measures: 'State Measures',
  hospice_zip_data: 'ZIP-Level Data',
  medicare_hospice_utilization: 'Utilization',
  snf_provider_measures: 'Quality Measures',
  snf_quality_reporting: 'Quality Reporting',
  nursing_home_providers: 'Provider Info',
  nursing_home_ownership: 'Ownership Data',
  nursing_home_fire_safety: 'Fire Safety',
  nursing_home_health_deficiencies: 'Health Deficiencies',
  nursing_home_deficiencies: 'Deficiencies',
  nursing_home_mds_quality: 'MDS Quality',
  nursing_home_penalties: 'Penalties',
  nursing_home_claims_quality: 'Claims Quality',
  medicare_snf_utilization: 'SNF Utilization',
  hospital_general_info: 'General Information',
  hospital_enrollments: 'Enrollment Data',
  hospital_all_owners: 'Ownership',
  hospital_cost_report: 'Cost Report',
  hospital_value_based_purchasing: 'Value-Based Purchasing',
  hospital_price_transparency: 'Price Transparency',
  hospital_joint_replacement: 'Joint Replacement',
  hospital_imaging_efficiency: 'Imaging Efficiency',
  home_health_all_owners: 'Ownership',
  home_health_national_measures: 'National Measures',
  home_health_state_measures: 'State Measures',
  home_health_zip_data: 'ZIP-Level Data',
  hospice_all_owners: 'Ownership',
  dialysis_patient_survey: 'Patient Survey',
  dialysis_facility_listing: 'Facility Listing',
  dialysis_state_averages: 'State Averages',
  dialysis_national_averages: 'National Averages',
  medicare_dialysis_facilities: 'Dialysis Utilization',
  inpatient_rehab_general_info: 'General Information',
  inpatient_rehab_provider_data: 'Provider Data',
  medicare_irf_utilization: 'IRF Utilization',
  long_term_care_general_info: 'General Information',
  long_term_care_provider_data: 'Provider Data',
  medicare_ltch_utilization: 'LTCH Utilization',
  medical_equipment_suppliers: 'Supplier Info',
  medicare_dme_by_supplier: 'DME by Supplier',
  medicare_dme_by_referring: 'DME by Referring',
  home_health_vbp: 'Value-Based Purchasing',
  hha_utilization_geo_casemix: 'Utilization by Geography',
  home_infusion_therapy: 'Infusion Therapy',
  snf_enrollments: 'Enrollment Data',
  snf_all_owners: 'Ownership',
  snf_cost_report: 'Cost Report',
  snf_vbp_facility: 'Value-Based Purchasing',
  nursing_home_chain_performance: 'Chain Performance',
  pbj_daily_nurse_staffing: 'Nurse Staffing (PBJ)',
  pbj_daily_nonnurse_staffing: 'Non-Nurse Staffing (PBJ)',
  ltc_facility_characteristics: 'Facility Characteristics',
  mds_frequency: 'MDS Assessment Frequency',
  snf_utilization_geo_casemix: 'Utilization by Geography',
  fqhc_enrollments: 'Enrollment Data',
  fqhc_all_owners: 'Ownership',
  rural_health_clinic_enrollments: 'Enrollment Data',
  rural_health_clinic_all_owners: 'Ownership',
  medicare_hha_stats: 'HHA Statistics',
  medicare_snf_stats: 'SNF Statistics',
};

function formatCurrency(val) {
  if (!val) return '$0';
  const num = Number(val);
  if (num >= 1e9) return `$${(num / 1e9).toFixed(1)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(1)}M`;
  if (num >= 1e3) return `$${(num / 1e3).toFixed(0)}K`;
  return `$${num.toLocaleString()}`;
}

function formatNumber(val) {
  if (!val) return '0';
  return Number(val).toLocaleString();
}

function RawDataTable({ rows, facilityType }) {
  if (!rows || rows.length === 0) return <p className="text-sm text-slate-400">No data available</p>;

  const allKeys = new Set();
  rows.forEach(r => {
    if (r.raw_data && typeof r.raw_data === 'object') {
      Object.keys(r.raw_data).forEach(k => allKeys.add(k));
    }
  });

  const mainCols = ['data_year', 'quality_rating', 'total_discharges', 'total_days_of_care', 'total_charges', 'total_payments', 'avg_length_of_stay'];
  const rawKeys = [...allKeys].slice(0, 15);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-700/50">
            <th className="text-left py-2 px-3 text-slate-400 font-medium">Year</th>
            {mainCols.slice(1).map(col => (
              <th key={col} className="text-right py-2 px-3 text-slate-400 font-medium whitespace-nowrap">
                {col.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
              </th>
            ))}
            {rawKeys.slice(0, 5).map(k => (
              <th key={k} className="text-right py-2 px-3 text-slate-400 font-medium whitespace-nowrap max-w-[200px] truncate" title={k}>
                {k.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()).substring(0, 30)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 20).map((row, i) => (
            <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/30">
              <td className="py-2 px-3 text-slate-300">{row.data_year || '—'}</td>
              {mainCols.slice(1).map(col => (
                <td key={col} className="text-right py-2 px-3 text-slate-300">
                  {col.includes('payment') || col.includes('charge') ? formatCurrency(row[col]) : row[col] != null ? formatNumber(row[col]) : '—'}
                </td>
              ))}
              {rawKeys.slice(0, 5).map(k => (
                <td key={k} className="text-right py-2 px-3 text-slate-400 max-w-[200px] truncate" title={String(row.raw_data?.[k] ?? '')}>
                  {row.raw_data?.[k] != null ? String(row.raw_data[k]).substring(0, 40) : '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 20 && <p className="text-xs text-slate-400 mt-2 px-3">Showing 20 of {rows.length} records</p>}
    </div>
  );
}

export default function FacilityDetail() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const providerId = searchParams.get('id');
  const group = searchParams.get('group') || 'hospital';

  const config = FACILITY_LABELS[group] || FACILITY_LABELS.hospital;

  const { data, isLoading, error } = useQuery({
    queryKey: ['facilityDetail', providerId, group],
    queryFn: () => base44.functions.invoke('getFacilityDetail', { provider_id: providerId, facility_group: group }),
    enabled: !!providerId,
    select: (res) => res.data || res,
  });

  if (!providerId) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto">
        <p className="text-slate-400">No facility ID specified.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-4">
        <Skeleton className="h-8 w-64 bg-slate-800" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-24 bg-slate-800" />)}
        </div>
        <Skeleton className="h-96 bg-slate-800" />
      </div>
    );
  }

  if (error || data?.error) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto">
        <Button variant="ghost" onClick={() => navigate(-1)} className="mb-4 text-slate-400 hover:text-slate-200">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>
        <Card className="bg-slate-800/50 border-slate-700/50">
          <CardContent className="py-8 text-center">
            <p className="text-slate-400">No facility data found for ID: {providerId}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const facilityTypes = data.facility_types || [];
  const byType = data.by_type || {};
  const financials = data.financials || {};
  const linked = data.linked_provider;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(createPageUrl(config.back))} className="text-slate-400 hover:text-slate-200">
          <ArrowLeft className="w-4 h-4 mr-2" /> {config.title}s
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2">
            <Building2 className={`w-6 h-6 ${config.iconCls}`} />
            <h1 className="text-xl sm:text-2xl font-bold text-slate-100 truncate">{data.facility_name || 'Unknown Facility'}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-400">
            {data.city && data.state && (
              <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{data.city}, {data.state} {data.zip}</span>
            )}
            <span className="flex items-center gap-1"><FileText className="w-3.5 h-3.5" />ID: {providerId}</span>
            <Badge className={config.badgeCls}>{config.title}</Badge>
          </div>
        </div>
        {data.quality_rating && (
          <div className="flex items-center gap-2 bg-amber-900/30 border border-amber-500/30 rounded-lg px-4 py-2">
            <Star className="w-5 h-5 text-amber-400" />
            <div>
              <div className="text-lg font-bold text-amber-400">{data.quality_rating}/5</div>
              <div className="text-[10px] text-amber-400/70">Quality Rating</div>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-slate-800/50 border-slate-700/50">
          <CardContent className="py-4 px-4">
            <div className="flex items-center gap-2 text-slate-400 text-xs mb-1"><DollarSign className="w-3.5 h-3.5" />Total Payments</div>
            <div className="text-lg font-bold text-slate-100">{formatCurrency(financials.totalPayments)}</div>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 border-slate-700/50">
          <CardContent className="py-4 px-4">
            <div className="flex items-center gap-2 text-slate-400 text-xs mb-1"><Activity className="w-3.5 h-3.5" />Total Discharges</div>
            <div className="text-lg font-bold text-slate-100">{formatNumber(financials.totalDischarges)}</div>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 border-slate-700/50">
          <CardContent className="py-4 px-4">
            <div className="flex items-center gap-2 text-slate-400 text-xs mb-1"><Layers className="w-3.5 h-3.5" />Data Sources</div>
            <div className="text-lg font-bold text-slate-100">{facilityTypes.length}</div>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 border-slate-700/50">
          <CardContent className="py-4 px-4">
            <div className="flex items-center gap-2 text-slate-400 text-xs mb-1"><Calendar className="w-3.5 h-3.5" />Data Years</div>
            <div className="text-lg font-bold text-slate-100">
              {data.data_years?.length > 0 ? `${data.data_years[0]}–${data.data_years[data.data_years.length - 1]}` : '—'}
            </div>
          </CardContent>
        </Card>
      </div>

      {linked && (
        <Card className="bg-slate-800/50 border-slate-700/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-300 flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-400" /> Linked Provider Record
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <p className="text-slate-200 font-medium">
                  {linked.entity_type === 'Individual'
                    ? `${linked.first_name} ${linked.last_name}`.trim()
                    : linked.organization_name || 'Unknown'}
                </p>
                <p className="text-xs text-slate-400">NPI: {linked.npi} | {linked.entity_type} | {linked.status}</p>
                {linked.taxonomies?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {linked.taxonomies.slice(0, 3).map((t, i) => (
                      <Badge key={i} className="bg-blue-900/30 text-blue-400 border-blue-500/30 text-[10px]">{t.taxonomy_description || t.taxonomy_code}</Badge>
                    ))}
                  </div>
                )}
              </div>
              <Button variant="outline" size="sm" className="border-slate-600 text-slate-300 hover:bg-slate-700" onClick={() => navigate(createPageUrl('ProviderDetail') + `?npi=${linked.npi}`)}>
                <ExternalLink className="w-3.5 h-3.5 mr-1" /> View Provider
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue={facilityTypes[0] || 'overview'}>
        <TabsList className="bg-slate-800/70 border border-slate-700/50 flex-wrap h-auto gap-1 p-1">
          {facilityTypes.map(ft => (
            <TabsTrigger key={ft} value={ft} className="text-xs data-[state=active]:bg-slate-700 data-[state=active]:text-slate-100 text-slate-400 whitespace-nowrap">
              {TYPE_LABELS[ft] || ft.replace(/_/g, ' ')}
            </TabsTrigger>
          ))}
        </TabsList>
        {facilityTypes.map(ft => (
          <TabsContent key={ft} value={ft} className="mt-4">
            <Card className="bg-slate-800/50 border-slate-700/50">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm text-slate-200">{TYPE_LABELS[ft] || ft.replace(/_/g, ' ')}</CardTitle>
                  <Badge className="bg-slate-800/50 text-slate-400 border-slate-500/30 text-[10px]">{byType[ft]?.length || 0} records</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <RawDataTable rows={byType[ft] || []} facilityType={ft} />
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
