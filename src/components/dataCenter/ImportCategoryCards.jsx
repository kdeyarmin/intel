import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Users, Activity, Building2, FileText, Clock, CalendarClock, Heart, Stethoscope, ShieldCheck, MapPin, Pill } from 'lucide-react';
import { format, formatDistanceToNow, addMonths } from 'date-fns';

const IMPORT_CATEGORIES = [
  {
    id: 'providers',
    label: 'Provider Data',
    description: 'NPPES provider registry, clinician performance',
    icon: Users,
    color: 'bg-cyan-900/10 text-cyan-400 border-cyan-500/20',
    types: [
      { id: 'nppes_monthly', name: 'NPPES File Upload', description: 'Upload NPPES CSV file', requiredColumns: ['NPI', 'Entity Type Code', 'Provider Last Name (Legal Name)', 'Provider First Name'], downloadUrl: 'https://download.cms.gov/nppes/NPI_Files.html' },
      { id: 'nppes_registry', name: 'NPPES Registry Search', description: 'Search & import from NPPES API', requiredColumns: [], downloadUrl: 'https://download.cms.gov/nppes/NPI_Files.html' },
      { id: 'clinician_national_file', name: 'Clinician National File', description: 'National clinician data', requiredColumns: [], downloadUrl: 'https://data.cms.gov/provider-data/' },
      { id: 'clinician_mips_performance', name: 'Clinician MIPS Performance', description: 'MIPS performance scores', requiredColumns: [], downloadUrl: 'https://data.cms.gov/provider-data/' },
      { id: 'clinician_mips_measures', name: 'Clinician MIPS Measures', description: 'MIPS quality measures', requiredColumns: [], downloadUrl: 'https://data.cms.gov/provider-data/' },
      { id: 'clinician_group_measures', name: 'Group Practice Measures', description: 'Group-level MIPS measures', requiredColumns: [], downloadUrl: 'https://data.cms.gov/provider-data/' },
      { id: 'clinician_group_experience', name: 'Group Practice Experience', description: 'Patient experience by group', requiredColumns: [], downloadUrl: 'https://data.cms.gov/provider-data/' },
      { id: 'provider_taxonomy_crosswalk', name: 'Taxonomy Crosswalk', description: 'Provider taxonomy classification', requiredColumns: [], downloadUrl: 'https://data.cms.gov/' },
    ]
  },
  {
    id: 'claims',
    label: 'Claims & Utilization',
    description: 'Utilization, referrals, prescribers, DRG',
    icon: Activity,
    color: 'bg-blue-900/10 text-blue-400 border-blue-500/20',
    types: [
      { id: 'provider_service_utilization', name: 'Provider Service Utilization', description: 'Medicare Part B utilization', requiredColumns: ['NPI', 'Year', 'Total Services', 'Total Medicare Beneficiaries', 'Total Medicare Payment Amount'], downloadUrl: 'https://data.cms.gov/provider-summary-by-type-of-service/medicare-physician-other-practitioners/medicare-physician-other-practitioners-by-provider-and-service' },
      { id: 'cms_order_referring', name: 'Order & Referring', description: 'Ordering and referring data', requiredColumns: ['NPI', 'HHA', 'HOSPICE', 'DME', 'PARTB'], downloadUrl: 'https://data.cms.gov/provider-characteristics/medicare-provider-supplier-enrollment/ordering-and-referring' },
      { id: 'medicare_physician_by_provider', name: 'Physician Utilization', description: 'Physician-level utilization', requiredColumns: [], downloadUrl: 'https://data.cms.gov/' },
      { id: 'medicare_part_d_prescribers', name: 'Part D Prescribers', description: 'Part D prescriber data', requiredColumns: [], downloadUrl: 'https://data.cms.gov/' },
      { id: 'inpatient_drg', name: 'Inpatient DRG', description: 'Inpatient DRG statistics', requiredColumns: [], downloadUrl: 'https://data.cms.gov/' },
      { id: 'medicare_inpatient_by_provider', name: 'Inpatient by Provider', description: 'Inpatient utilization by provider', requiredColumns: [], downloadUrl: 'https://data.cms.gov/' },
      { id: 'medicare_outpatient_by_provider', name: 'Outpatient by Provider', description: 'Outpatient utilization by provider', requiredColumns: [], downloadUrl: 'https://data.cms.gov/' },
      { id: 'medicare_ma_inpatient', name: 'MA Inpatient Hospital', description: 'Medicare Advantage inpatient', requiredColumns: ['Year', 'NPI', 'Total_Discharges'], downloadUrl: 'https://data.cms.gov/' },
    ]
  },
  {
    id: 'hospitals',
    label: 'Hospitals & Quality',
    description: 'Hospital info, quality measures, cost reports',
    icon: Stethoscope,
    color: 'bg-rose-900/10 text-rose-400 border-rose-500/20',
    types: [
      { id: 'hospital_general_info', name: 'Hospital General Info', description: 'Hospital demographics & contact', requiredColumns: [], downloadUrl: 'https://data.cms.gov/provider-data/' },
      { id: 'hospital_enrollments', name: 'Hospital Enrollments', description: 'Hospital Medicare enrollment', requiredColumns: [], downloadUrl: 'https://data.cms.gov/provider-data/' },
      { id: 'hospital_all_owners', name: 'Hospital Ownership', description: 'Ownership & control info', requiredColumns: [], downloadUrl: 'https://data.cms.gov/provider-data/' },
      { id: 'hospital_cost_report', name: 'Hospital Cost Report', description: 'Financial cost reports', requiredColumns: [], downloadUrl: 'https://data.cms.gov/provider-data/' },
      { id: 'hospital_hcahps_survey', name: 'HCAHPS Survey', description: 'Patient experience survey', requiredColumns: [], downloadUrl: 'https://data.cms.gov/provider-data/' },
      { id: 'hospital_timely_effective_care', name: 'Timely & Effective Care', description: 'Quality of care measures', requiredColumns: [], downloadUrl: 'https://data.cms.gov/provider-data/' },
      { id: 'hospital_readmissions', name: 'Readmissions', description: 'Hospital readmission rates', requiredColumns: [], downloadUrl: 'https://data.cms.gov/provider-data/' },
      { id: 'hospital_complications', name: 'Complications', description: 'Complication & death rates', requiredColumns: [], downloadUrl: 'https://data.cms.gov/provider-data/' },
      { id: 'hospital_infections', name: 'Infections', description: 'Healthcare-associated infections', requiredColumns: [], downloadUrl: 'https://data.cms.gov/provider-data/' },
      { id: 'hospital_unplanned_visits', name: 'Unplanned Visits', description: 'Unplanned hospital visits', requiredColumns: [], downloadUrl: 'https://data.cms.gov/provider-data/' },
      { id: 'hospital_imaging_efficiency', name: 'Imaging Efficiency', description: 'Outpatient imaging use', requiredColumns: [], downloadUrl: 'https://data.cms.gov/provider-data/' },
      { id: 'hospital_spending_per_beneficiary', name: 'Spending Per Beneficiary', description: 'Medicare spending metrics', requiredColumns: [], downloadUrl: 'https://data.cms.gov/provider-data/' },
      { id: 'hospital_spending_by_claim', name: 'Spending by Claim', description: 'Spending by claim type', requiredColumns: [], downloadUrl: 'https://data.cms.gov/provider-data/' },
      { id: 'hospital_hac_reduction', name: 'HAC Reduction', description: 'Hospital-acquired conditions', requiredColumns: [], downloadUrl: 'https://data.cms.gov/provider-data/' },
      { id: 'hospital_value_based_purchasing', name: 'Value-Based Purchasing', description: 'VBP program data', requiredColumns: [], downloadUrl: 'https://data.cms.gov/provider-data/' },
      { id: 'hospital_price_transparency', name: 'Price Transparency', description: 'Pricing compliance', requiredColumns: [], downloadUrl: 'https://data.cms.gov/provider-data/' },
      { id: 'hospital_service_area', name: 'Service Area', description: 'Hospital service area data', requiredColumns: [], downloadUrl: 'https://data.cms.gov/provider-data/' },
      { id: 'hospital_psychiatric_facility', name: 'Psychiatric Facility', description: 'Psych facility quality', requiredColumns: [], downloadUrl: 'https://data.cms.gov/provider-data/' },
      { id: 'hospital_joint_replacement', name: 'Joint Replacement', description: 'Joint replacement model', requiredColumns: [], downloadUrl: 'https://data.cms.gov/provider-data/' },
      { id: 'ambulatory_surgical_center', name: 'Ambulatory Surgical Center', description: 'ASC quality measures', requiredColumns: [], downloadUrl: 'https://data.cms.gov/provider-data/' },
    ]
  },
  {
    id: 'home_health',
    label: 'Home Health',
    description: 'HHA enrollments, quality, cost reports, VBP',
    icon: Building2,
    color: 'bg-violet-900/10 text-violet-400 border-violet-500/20',
    types: [
      { id: 'home_health_enrollments', name: 'HH Enrollments', description: 'Home health enrollment data', requiredColumns: [], downloadUrl: 'https://data.cms.gov/' },
      { id: 'home_health_all_owners', name: 'HH Ownership', description: 'Ownership & control', requiredColumns: [], downloadUrl: 'https://data.cms.gov/provider-data/' },
      { id: 'home_health_cost_report', name: 'HH Cost Report', description: 'Financial cost reports', requiredColumns: [], downloadUrl: 'https://data.cms.gov/provider-compliance/cost-report/home-health-agency-cost-report' },
      { id: 'home_health_patient_survey', name: 'HHCAHPS Survey', description: 'Patient experience', requiredColumns: [], downloadUrl: 'https://data.cms.gov/provider-data/' },
      { id: 'home_health_national_measures', name: 'HH National Measures', description: 'National quality metrics', requiredColumns: [], downloadUrl: 'https://data.cms.gov/provider-data/' },
      { id: 'home_health_state_measures', name: 'HH State Measures', description: 'State-level quality', requiredColumns: [], downloadUrl: 'https://data.cms.gov/provider-data/' },
      { id: 'home_health_zip_data', name: 'HH Zip Data', description: 'Zip-level statistics', requiredColumns: [], downloadUrl: 'https://data.cms.gov/provider-data/' },
      { id: 'home_health_vbp', name: 'HH Value-Based Purchasing', description: 'VBP program data', requiredColumns: [], downloadUrl: 'https://data.cms.gov/provider-data/' },
      { id: 'home_health_pdgm', name: 'HH PDGM', description: 'Patient-Driven Groupings Model', requiredColumns: [], downloadUrl: 'https://data.cms.gov/' },
      { id: 'medicare_hha_stats', name: 'HHA Use & Payments', description: 'Home Health Agency statistics', requiredColumns: ['Year', 'NPI', 'Total_Episodes'], downloadUrl: 'https://data.cms.gov/provider-summary-by-type-of-service/medicare-home-health-agency-providers' },
      { id: 'hha_utilization_geo_casemix', name: 'HHA Util by Geo/Case-Mix', description: 'Geographic utilization analysis', requiredColumns: [], downloadUrl: 'https://data.cms.gov/' },
    ]
  },
  {
    id: 'hospice',
    label: 'Hospice',
    description: 'Hospice enrollment, quality, ownership',
    icon: Heart,
    color: 'bg-pink-900/10 text-pink-400 border-pink-500/20',
    types: [
      { id: 'hospice_enrollments', name: 'Hospice Enrollments', description: 'Hospice provider enrollment', requiredColumns: [], downloadUrl: 'https://data.cms.gov/' },
      { id: 'hospice_all_owners', name: 'Hospice Ownership', description: 'Ownership data', requiredColumns: [], downloadUrl: 'https://data.cms.gov/provider-data/' },
      { id: 'hospice_provider_data', name: 'Hospice Provider Data', description: 'Provider-level data', requiredColumns: [], downloadUrl: 'https://data.cms.gov/provider-data/' },
      { id: 'hospice_provider_measures', name: 'Hospice Provider Measures', description: 'Quality measures', requiredColumns: [], downloadUrl: 'https://data.cms.gov/provider-data/' },
      { id: 'hospice_national_measures', name: 'National Measures', description: 'National aggregate data', requiredColumns: [], downloadUrl: 'https://data.cms.gov/provider-data/' },
      { id: 'hospice_state_measures', name: 'State Measures', description: 'State aggregate data', requiredColumns: [], downloadUrl: 'https://data.cms.gov/provider-data/' },
      { id: 'hospice_zip_data', name: 'Hospice Zip Data', description: 'Zip-level statistics', requiredColumns: [], downloadUrl: 'https://data.cms.gov/provider-data/' },
    ]
  },
  {
    id: 'snf',
    label: 'SNF & Nursing Homes',
    description: 'Nursing home quality, staffing, inspections',
    icon: ShieldCheck,
    color: 'bg-amber-900/10 text-amber-400 border-amber-500/20',
    types: [
      { id: 'nursing_home_providers', name: 'Nursing Home Providers', description: 'Provider details', requiredColumns: [], downloadUrl: 'https://data.cms.gov/provider-data/' },
      { id: 'nursing_home_deficiencies', name: 'Nursing Home Deficiencies', description: 'Inspection findings', requiredColumns: [], downloadUrl: 'https://data.cms.gov/provider-data/' },
      { id: 'nursing_home_ownership', name: 'NH Ownership', description: 'Ownership data', requiredColumns: [], downloadUrl: 'https://data.cms.gov/provider-data/' },
      { id: 'nursing_home_penalties', name: 'NH Penalties', description: 'Penalties & fines', requiredColumns: [], downloadUrl: 'https://data.cms.gov/provider-data/' },
      { id: 'nursing_home_fire_safety', name: 'NH Fire Safety', description: 'Fire safety deficiencies', requiredColumns: [], downloadUrl: 'https://data.cms.gov/provider-data/' },
      { id: 'nursing_home_health_deficiencies', name: 'NH Health Deficiencies', description: 'Health deficiency details', requiredColumns: [], downloadUrl: 'https://data.cms.gov/provider-data/' },
      { id: 'nursing_home_mds_quality', name: 'NH MDS Quality', description: 'MDS quality measures', requiredColumns: [], downloadUrl: 'https://data.cms.gov/provider-data/' },
      { id: 'nursing_home_claims_quality', name: 'NH Claims Quality', description: 'Claims-based quality', requiredColumns: [], downloadUrl: 'https://data.cms.gov/provider-data/' },
      { id: 'nursing_home_chains', name: 'NH Chain Data', description: 'Chain performance data', requiredColumns: ['Chain', 'Chain ID', 'Number of facilities', 'Average overall 5-star rating'], downloadUrl: 'https://data.cms.gov/provider-data/dataset/b2ux-wtdv' },
      { id: 'nursing_home_chain_performance', name: 'NH Chain Performance', description: 'Chain-level performance', requiredColumns: [], downloadUrl: 'https://data.cms.gov/provider-data/' },
      { id: 'snf_provider_measures', name: 'SNF Quality Measures', description: 'SNF quality API', requiredColumns: [], downloadUrl: 'https://data.cms.gov/provider-data/' },
      { id: 'snf_quality_reporting', name: 'SNF Quality Reporting', description: 'Quality reporting data', requiredColumns: [], downloadUrl: 'https://data.cms.gov/provider-data/' },
      { id: 'snf_enrollments', name: 'SNF Enrollments', description: 'SNF enrollment data', requiredColumns: [], downloadUrl: 'https://data.cms.gov/' },
      { id: 'snf_all_owners', name: 'SNF Ownership', description: 'Ownership data', requiredColumns: [], downloadUrl: 'https://data.cms.gov/provider-data/' },
      { id: 'snf_cost_report', name: 'SNF Cost Report', description: 'Financial cost reports', requiredColumns: [], downloadUrl: 'https://data.cms.gov/' },
      { id: 'snf_vbp_facility', name: 'SNF VBP', description: 'Value-based purchasing', requiredColumns: [], downloadUrl: 'https://data.cms.gov/provider-data/' },
      { id: 'medicare_snf_stats', name: 'SNF Statistics', description: 'Skilled Nursing Facility stats', requiredColumns: ['Year', 'NPI', 'Total_Stays'], downloadUrl: 'https://data.cms.gov/provider-summary-by-type-of-service/medicare-skilled-nursing-facility-providers' },
      { id: 'pbj_daily_nurse_staffing', name: 'PBJ Nurse Staffing', description: 'Payroll-based staffing', requiredColumns: [], downloadUrl: 'https://data.cms.gov/provider-data/' },
      { id: 'pbj_daily_nonnurse_staffing', name: 'PBJ Non-Nurse Staffing', description: 'Non-nurse staffing', requiredColumns: [], downloadUrl: 'https://data.cms.gov/provider-data/' },
      { id: 'snf_utilization_geo_casemix', name: 'SNF Util by Geo/Case-Mix', description: 'Geographic utilization analysis', requiredColumns: [], downloadUrl: 'https://data.cms.gov/' },
      { id: 'ltc_facility_characteristics', name: 'LTC Facility Characteristics', description: 'Long-term care facility info', requiredColumns: [], downloadUrl: 'https://data.cms.gov/' },
      { id: 'mds_frequency', name: 'MDS Frequency', description: 'Minimum Data Set frequency', requiredColumns: [], downloadUrl: 'https://data.cms.gov/' },
    ]
  },
  {
    id: 'specialty_facilities',
    label: 'IRF, LTCH & DME',
    description: 'Rehab, long-term care, DME suppliers',
    icon: FileText,
    color: 'bg-emerald-900/10 text-emerald-400 border-emerald-500/20',
    types: [
      { id: 'inpatient_rehab_general_info', name: 'IRF General Info', description: 'Inpatient rehab facility data', requiredColumns: [], downloadUrl: 'https://data.cms.gov/provider-data/' },
      { id: 'inpatient_rehab_provider_data', name: 'IRF Provider Data', description: 'IRF provider measures', requiredColumns: [], downloadUrl: 'https://data.cms.gov/provider-data/' },
      { id: 'long_term_care_general_info', name: 'LTCH General Info', description: 'Long-term care hospital data', requiredColumns: [], downloadUrl: 'https://data.cms.gov/provider-data/' },
      { id: 'long_term_care_provider_data', name: 'LTCH Provider Data', description: 'LTCH provider measures', requiredColumns: [], downloadUrl: 'https://data.cms.gov/provider-data/' },
      { id: 'medical_equipment_suppliers', name: 'DME Suppliers', description: 'DMEPOS supplier directory', requiredColumns: [], downloadUrl: 'https://data.cms.gov/provider-data/' },
      { id: 'medicare_dme_by_supplier', name: 'DME by Supplier', description: 'Utilization by DME supplier', requiredColumns: [], downloadUrl: 'https://data.cms.gov/' },
      { id: 'medicare_dme_by_referring', name: 'DME by Referring Provider', description: 'DME referred by providers', requiredColumns: [], downloadUrl: 'https://data.cms.gov/' },
    ]
  },
  {
    id: 'enrollment_market',
    label: 'Enrollment & Market',
    description: 'Enrollment trends, market saturation, ACOs',
    icon: MapPin,
    color: 'bg-indigo-900/10 text-indigo-400 border-indigo-500/20',
    types: [
      { id: 'medicare_fee_for_service_enrollment', name: 'FFS Enrollment', description: 'Fee-for-service enrollment', requiredColumns: [], downloadUrl: 'https://data.cms.gov/' },
      { id: 'medicare_monthly_enrollment', name: 'Monthly Enrollment', description: 'Monthly enrollment trends', requiredColumns: [], downloadUrl: 'https://data.cms.gov/' },
      { id: 'market_saturation_county', name: 'Market Saturation (County)', description: 'Provider density by county', requiredColumns: [], downloadUrl: 'https://data.cms.gov/' },
      { id: 'market_saturation_cbsa', name: 'Market Saturation (CBSA)', description: 'Provider density by CBSA', requiredColumns: [], downloadUrl: 'https://data.cms.gov/' },
      { id: 'medicare_geographic_variation', name: 'Geographic Variation', description: 'Medicare spending variation', requiredColumns: [], downloadUrl: 'https://data.cms.gov/' },
      { id: 'medicare_telehealth_trends', name: 'Telehealth Trends', description: 'Telehealth utilization trends', requiredColumns: [], downloadUrl: 'https://data.cms.gov/' },
      { id: 'provider_ownership', name: 'Provider Ownership', description: 'Ownership & control info', requiredColumns: ['ENROLLMENT ID', 'ASSOCIATE ID', 'ORGANIZATION NAME', 'ASSOCIATE ID - OWNER'], downloadUrl: 'https://data.cms.gov/provider-characteristics/medicare-provider-supplier-enrollment/provider-and-supplier-ownership' },
      { id: 'facility_affiliation', name: 'Facility Affiliation', description: 'Facility affiliation data', requiredColumns: [], downloadUrl: 'https://data.cms.gov/' },
      { id: 'aco_organizations', name: 'ACO Organizations', description: 'ACO organization data', requiredColumns: [], downloadUrl: 'https://data.cms.gov/' },
      { id: 'aco_participants', name: 'ACO Participants', description: 'ACO participant info', requiredColumns: [], downloadUrl: 'https://data.cms.gov/' },
      { id: 'aco_financial_results', name: 'ACO Financial Results', description: 'ACO financial performance', requiredColumns: [], downloadUrl: 'https://data.cms.gov/' },
      { id: 'rural_health_clinic_enrollments', name: 'RHC Enrollments', description: 'Rural health clinic enrollment', requiredColumns: [], downloadUrl: 'https://data.cms.gov/' },
      { id: 'rural_health_clinic_all_owners', name: 'RHC Ownership', description: 'Rural health clinic ownership', requiredColumns: [], downloadUrl: 'https://data.cms.gov/' },
      { id: 'fqhc_all_owners', name: 'FQHC Ownership', description: 'FQHC ownership data', requiredColumns: [], downloadUrl: 'https://data.cms.gov/' },
    ]
  },
  {
    id: 'drug_spending',
    label: 'Drug Spending',
    description: 'Medicare Part B & Part D drug spending',
    icon: Pill,
    color: 'bg-teal-900/10 text-teal-400 border-teal-500/20',
    types: [
      { id: 'medicare_spending_by_drug_b', name: 'Drug Spending Part B', description: 'Part B drug spending', requiredColumns: [], downloadUrl: 'https://data.cms.gov/' },
      { id: 'medicare_spending_by_drug_d', name: 'Drug Spending Part D', description: 'Part D drug spending', requiredColumns: [], downloadUrl: 'https://data.cms.gov/' },
    ]
  },
];

export { IMPORT_CATEGORIES };

export default function ImportCategoryCards({ onSelectCategory, batches = [] }) {
  const activeCategories = IMPORT_CATEGORIES.filter(cat => cat.types.length > 0);
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
                    <CalendarClock className="w-3 h-3 text-slate-400" />
                    <span>Next: {format(dates.nextExpected, 'MMM d, yyyy')}</span>
                  </div>
                </div>
              ) : (
                <p className="text-[10px] text-slate-400 mt-2">No imports yet</p>
              )}
              <p className="text-[10px] text-slate-400 mt-1">{cat.types.length} dataset{cat.types.length !== 1 ? 's' : ''}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
