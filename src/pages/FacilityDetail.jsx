import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { ArrowLeft, Building2, MapPin, Star, DollarSign, Users, Calendar, Activity, FileText, Layers, ExternalLink, Mail, Phone, Shield, ChevronDown, ChevronUp, Search, BarChart3 } from 'lucide-react';
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
  irf: { title: 'Inpatient Rehab Facility', back: 'InpatientRehab', iconCls: 'text-rose-400', badgeCls: 'bg-rose-900/30 text-rose-400 border-rose-500/30' },
  ltch: { title: 'Long-Term Care Hospital', back: 'LongTermCare', iconCls: 'text-orange-400', badgeCls: 'bg-orange-900/30 text-orange-400 border-orange-500/30' },
  dme: { title: 'DME Supplier', back: 'DMESuppliers', iconCls: 'text-cyan-400', badgeCls: 'bg-cyan-900/30 text-cyan-400 border-cyan-500/30' },
  community_health: { title: 'Community Health Center', back: 'CommunityHealthCenters', iconCls: 'text-lime-400', badgeCls: 'bg-lime-900/30 text-lime-400 border-lime-500/30' },
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
  home_health_patient_survey: 'Patient Survey (HHCAHPS)',
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

function isNumericish(val) {
  if (val == null || val === '') return false;
  const str = String(val).replace(/[$,%]/g, '').trim();
  return !isNaN(Number(str)) && str.length > 0 && str.length < 20;
}

function isCurrencyField(key) {
  const k = key.toLowerCase();
  return k.includes('payment') || k.includes('charge') || k.includes('cost') || k.includes('spend') || k.includes('revenue') || k.includes('price') || k.includes('dollar') || k.includes('_amt');
}

function formatCellValue(key, val) {
  if (val == null || val === '') return '—';
  if (isCurrencyField(key) && isNumericish(val)) return formatCurrency(val);
  if (isNumericish(val) && !String(val).includes('-') && String(val).length < 15) {
    const num = Number(String(val).replace(/[$,%]/g, ''));
    if (Number.isInteger(num) && num > 100) return num.toLocaleString();
  }
  return String(val);
}

function RawDataTable({ rows, facilityType }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [expanded, setExpanded] = useState(false);

  if (!rows || rows.length === 0) return <p className="text-sm text-slate-400">No data available</p>;

  const allKeys = new Set();
  rows.forEach(r => {
    if (r.raw_data && typeof r.raw_data === 'object') {
      Object.keys(r.raw_data).forEach(k => allKeys.add(k));
    }
  });

  const coreCols = [
    { key: 'data_year', label: 'Year', align: 'left' },
    { key: 'quality_rating', label: 'Quality Rating', align: 'right' },
    { key: 'total_discharges', label: 'Discharges', align: 'right' },
    { key: 'total_days_of_care', label: 'Days of Care', align: 'right' },
    { key: 'total_charges', label: 'Total Charges', align: 'right' },
    { key: 'total_payments', label: 'Total Payments', align: 'right' },
    { key: 'avg_length_of_stay', label: 'Avg LOS', align: 'right' },
  ];

  const activeCols = coreCols.filter(c => rows.some(r => r[c.key] != null && r[c.key] !== ''));

  const allRawKeys = [...allKeys];
  const filteredRawKeys = searchTerm
    ? allRawKeys.filter(k => k.toLowerCase().includes(searchTerm.toLowerCase()))
    : allRawKeys;

  const displayRawKeys = expanded ? filteredRawKeys : filteredRawKeys.slice(0, 10);
  const hasMore = filteredRawKeys.length > 10;
  const displayRows = rows.slice(0, 50);

  return (
    <div className="space-y-3">
      {allRawKeys.length > 5 && (
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search columns..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-900/50 border border-slate-700/50 rounded-md text-slate-300 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/50"
            />
          </div>
          <span className="text-[10px] text-slate-500">
            {filteredRawKeys.length} of {allRawKeys.length} data fields
          </span>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-700/30">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-800/70">
              {activeCols.map(col => (
                <th key={col.key} className={`${col.align === 'left' ? 'text-left' : 'text-right'} py-2.5 px-3 text-slate-400 font-medium text-xs whitespace-nowrap sticky top-0 bg-slate-800/70`}>
                  {col.label}
                </th>
              ))}
              {displayRawKeys.map(k => (
                <th key={k} className="text-right py-2.5 px-3 text-slate-400 font-medium text-xs whitespace-nowrap max-w-[220px] sticky top-0 bg-slate-800/70" title={k}>
                  {k.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()).substring(0, 35)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row, i) => (
              <tr key={i} className="border-t border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                {activeCols.map(col => (
                  <td key={col.key} className={`${col.align === 'left' ? 'text-left' : 'text-right'} py-2 px-3 text-slate-300 whitespace-nowrap`}>
                    {col.key.includes('payment') || col.key.includes('charge')
                      ? formatCurrency(row[col.key])
                      : row[col.key] != null ? formatNumber(row[col.key]) : '—'}
                  </td>
                ))}
                {displayRawKeys.map(k => (
                  <td key={k} className="text-right py-2 px-3 text-slate-400 max-w-[220px] truncate whitespace-nowrap" title={String(row.raw_data?.[k] ?? '')}>
                    {formatCellValue(k, row.raw_data?.[k])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        {hasMore && !expanded && (
          <Button variant="ghost" size="sm" className="text-xs text-cyan-400 hover:text-cyan-300 h-7" onClick={() => setExpanded(true)}>
            <ChevronDown className="w-3.5 h-3.5 mr-1" /> Show all {filteredRawKeys.length} columns
          </Button>
        )}
        {expanded && (
          <Button variant="ghost" size="sm" className="text-xs text-cyan-400 hover:text-cyan-300 h-7" onClick={() => setExpanded(false)}>
            <ChevronUp className="w-3.5 h-3.5 mr-1" /> Show fewer columns
          </Button>
        )}
        {rows.length > 50 && (
          <p className="text-[10px] text-slate-500">Showing 50 of {rows.length} records</p>
        )}
      </div>
    </div>
  );
}

function LinkedProviderCard({ linked, navigate, config }) {
  if (!linked) return null;

  const provName = linked.entity_type === 'Individual'
    ? `${linked.first_name || ''} ${linked.last_name || ''}`.trim()
    : linked.organization_name || 'Unknown';

  const primaryLoc = linked.locations?.find(l => l.is_primary) || linked.locations?.[0];
  const score = linked.lead_score;

  return (
    <Card className="bg-slate-800/50 border-slate-700/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm text-slate-300 flex items-center gap-2">
          <Users className="w-4 h-4 text-blue-400" /> Provider Intelligence
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 min-w-0 space-y-3">
            <div>
              <p className="text-lg font-semibold text-slate-100">{provName}</p>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <Badge className="bg-slate-700/50 text-slate-300 border-slate-600/50 text-[10px]">NPI: {linked.npi}</Badge>
                <Badge className="bg-slate-700/50 text-slate-300 border-slate-600/50 text-[10px]">{linked.entity_type}</Badge>
                <Badge className={`text-[10px] ${linked.status?.toLowerCase() === 'active' ? 'bg-emerald-900/30 text-emerald-400 border-emerald-500/30' : 'bg-red-900/30 text-red-400 border-red-500/30'}`}>
                  {linked.status || 'Unknown'}
                </Badge>
              </div>
            </div>

            {linked.taxonomies?.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {linked.taxonomies.slice(0, 5).map((t, i) => (
                  <Badge key={i} className="bg-blue-900/20 text-blue-400 border-blue-500/20 text-[10px]">
                    {t.taxonomy_description || t.taxonomy_code}
                  </Badge>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {linked.email && (
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                  <span className="text-slate-300 truncate">{linked.email}</span>
                  {linked.email_confidence && (
                    <Badge className={`text-[9px] flex-shrink-0 ${
                      linked.email_confidence === 'high' ? 'bg-emerald-900/30 text-emerald-400 border-emerald-500/30' :
                      linked.email_confidence === 'medium' ? 'bg-amber-900/30 text-amber-400 border-amber-500/30' :
                      'bg-slate-700/50 text-slate-400 border-slate-600/50'
                    }`}>
                      {linked.email_confidence}
                    </Badge>
                  )}
                </div>
              )}
              {!linked.email && (
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" />
                  <span className="text-slate-500 italic">No email on file</span>
                </div>
              )}
              {linked.phone && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                  <span className="text-slate-300">{linked.phone}</span>
                </div>
              )}
              {primaryLoc && (
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                  <span className="text-slate-300 truncate">
                    {[primaryLoc.address_1, primaryLoc.city, primaryLoc.state].filter(Boolean).join(', ')} {primaryLoc.zip?.substring(0, 5)}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-row sm:flex-col items-center sm:items-end gap-3 sm:gap-2 flex-shrink-0">
            {score && (
              <div className="bg-slate-900/50 border border-slate-700/30 rounded-lg px-4 py-2 text-center">
                <div className={`text-2xl font-bold ${
                  score.score >= 70 ? 'text-emerald-400' : score.score >= 40 ? 'text-amber-400' : 'text-red-400'
                }`}>
                  {Math.round(score.score)}
                </div>
                <div className="text-[10px] text-slate-400">Fit Score</div>
              </div>
            )}
            <Button
              className="bg-cyan-600 hover:bg-cyan-700 text-white text-xs"
              onClick={() => navigate(createPageUrl('ProviderDetail') + `?npi=${linked.npi}`)}
            >
              <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> Full Provider Profile
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FacilitySummaryCard({ data, financials, facilityTypes, config }) {
  const totalRecords = Object.values(data.by_type || {}).reduce((sum, arr) => sum + arr.length, 0);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      <Card className="bg-slate-800/50 border-slate-700/50">
        <CardContent className="py-3 px-4">
          <div className="flex items-center gap-1.5 text-slate-400 text-[10px] mb-1"><DollarSign className="w-3 h-3" />Total Payments</div>
          <div className="text-lg font-bold text-slate-100">{formatCurrency(financials.totalPayments)}</div>
        </CardContent>
      </Card>
      <Card className="bg-slate-800/50 border-slate-700/50">
        <CardContent className="py-3 px-4">
          <div className="flex items-center gap-1.5 text-slate-400 text-[10px] mb-1"><DollarSign className="w-3 h-3" />Total Charges</div>
          <div className="text-lg font-bold text-slate-100">{formatCurrency(financials.totalCharges)}</div>
        </CardContent>
      </Card>
      <Card className="bg-slate-800/50 border-slate-700/50">
        <CardContent className="py-3 px-4">
          <div className="flex items-center gap-1.5 text-slate-400 text-[10px] mb-1"><Activity className="w-3 h-3" />Discharges</div>
          <div className="text-lg font-bold text-slate-100">{formatNumber(financials.totalDischarges)}</div>
        </CardContent>
      </Card>
      <Card className="bg-slate-800/50 border-slate-700/50">
        <CardContent className="py-3 px-4">
          <div className="flex items-center gap-1.5 text-slate-400 text-[10px] mb-1"><Calendar className="w-3 h-3" />Days of Care</div>
          <div className="text-lg font-bold text-slate-100">{formatNumber(financials.totalDaysOfCare)}</div>
        </CardContent>
      </Card>
      <Card className="bg-slate-800/50 border-slate-700/50">
        <CardContent className="py-3 px-4">
          <div className="flex items-center gap-1.5 text-slate-400 text-[10px] mb-1"><Layers className="w-3 h-3" />Data Sources</div>
          <div className="text-lg font-bold text-slate-100">{facilityTypes.length}</div>
          <div className="text-[10px] text-slate-500">{totalRecords} records</div>
        </CardContent>
      </Card>
      <Card className="bg-slate-800/50 border-slate-700/50">
        <CardContent className="py-3 px-4">
          <div className="flex items-center gap-1.5 text-slate-400 text-[10px] mb-1"><Calendar className="w-3 h-3" />Data Years</div>
          <div className="text-lg font-bold text-slate-100">
            {data.data_years?.length > 0 ? `${data.data_years[0]}–${data.data_years[data.data_years.length - 1]}` : '—'}
          </div>
        </CardContent>
      </Card>
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
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-20 bg-slate-800" />)}
        </div>
        <Skeleton className="h-32 bg-slate-800" />
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
            {data.address && (
              <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{data.address}</span>
            )}
            {data.city && data.state && (
              <span>{data.city}, {data.state} {data.zip}</span>
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

      <FacilitySummaryCard data={data} financials={financials} facilityTypes={facilityTypes} config={config} />

      <LinkedProviderCard linked={linked} navigate={navigate} config={config} />

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
                  <CardTitle className="text-sm text-slate-200 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-cyan-400" />
                    {TYPE_LABELS[ft] || ft.replace(/_/g, ' ')}
                  </CardTitle>
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
