import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BookTemplate, FileBarChart2, Users, MapPin, Activity, Building2, Pill } from 'lucide-react';

const TEMPLATES = [
  {
    id: 'weekly_provider_summary',
    name: 'Weekly Provider Summary',
    description: 'Provider counts by type and status across all states',
    icon: Users,
    dataset: 'providers',
    metrics: ['npi'],
    group_by: 'entity_type',
    chart_type: 'bar',
    frequency: 'weekly',
    schedule_day: 'Monday',
    filters: {},
    category: 'Providers',
  },
  {
    id: 'monthly_location_breakdown',
    name: 'Monthly Location Breakdown',
    description: 'Provider locations by state with counts',
    icon: MapPin,
    dataset: 'locations',
    metrics: ['npi'],
    group_by: 'state',
    chart_type: 'bar',
    frequency: 'monthly',
    schedule_day: '1',
    filters: {},
    category: 'Locations',
  },
  {
    id: 'weekly_utilization_trends',
    name: 'Weekly Utilization Report',
    description: 'Medicare utilization metrics by year',
    icon: Activity,
    dataset: 'cms_utilization',
    metrics: ['total_services', 'total_medicare_payment', 'total_medicare_beneficiaries'],
    group_by: 'year',
    chart_type: 'line',
    frequency: 'weekly',
    schedule_day: 'Friday',
    filters: {},
    category: 'Utilization',
  },
  {
    id: 'monthly_referral_analysis',
    name: 'Monthly Referral Analysis',
    description: 'Referral volumes by type across providers',
    icon: FileBarChart2,
    dataset: 'cms_referrals',
    metrics: ['total_referrals', 'home_health_referrals', 'hospice_referrals', 'snf_referrals'],
    group_by: 'year',
    chart_type: 'bar',
    frequency: 'monthly',
    schedule_day: '1',
    filters: {},
    category: 'Referrals',
  },
  {
    id: 'weekly_ma_inpatient',
    name: 'MA Inpatient Weekly Brief',
    description: 'Medicare Advantage hospital utilization by type',
    icon: Building2,
    dataset: 'ma_inpatient',
    metrics: ['total_discharges', 'avg_length_of_stay', 'total_enrollees'],
    group_by: 'hospital_type',
    chart_type: 'bar',
    frequency: 'weekly',
    schedule_day: 'Wednesday',
    filters: {},
    category: 'Inpatient',
  },
  {
    id: 'monthly_part_d',
    name: 'Monthly Part D Overview',
    description: 'Part D drug cost and utilization by plan type',
    icon: Pill,
    dataset: 'part_d_stats',
    metrics: ['total_enrollees', 'avg_annual_gross_cost', 'generic_dispensing_rate'],
    group_by: 'plan_type',
    chart_type: 'bar',
    frequency: 'monthly',
    schedule_day: '1',
    filters: {},
    category: 'Pharmacy',
  },
];

export default function ReportTemplateLibrary({ onUseTemplate }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <BookTemplate className="w-4 h-4 text-violet-600" />
          Report Templates
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {TEMPLATES.map(template => {
            const Icon = template.icon;
            return (
              <div
                key={template.id}
                className="border rounded-lg p-3 hover:border-blue-300 hover:bg-blue-50/30 transition-all cursor-pointer group"
                onClick={() => onUseTemplate(template)}
              >
                <div className="flex items-start gap-2.5">
                  <div className="p-1.5 rounded-md bg-slate-100 group-hover:bg-blue-100 transition-colors">
                    <Icon className="w-4 h-4 text-slate-600 group-hover:text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-semibold text-slate-800 truncate">{template.name}</h4>
                      <Badge variant="outline" className="text-[9px] shrink-0">{template.frequency}</Badge>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{template.description}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}