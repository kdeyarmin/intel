import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Database, ChevronDown, ChevronUp, Pill, DollarSign, Stethoscope, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';

const TYPE_CONFIG = {
  clinician_national_file: { label: 'Clinician Profile', icon: Stethoscope, iconCls: 'text-blue-400', badgeCls: 'bg-blue-900/30 text-blue-400 border-blue-500/30' },
  clinician_group_measures: { label: 'Group Practice Measures', icon: Stethoscope, iconCls: 'text-violet-400', badgeCls: 'bg-violet-900/30 text-violet-400 border-violet-500/30' },
  clinician_group_experience: { label: 'Group Practice Experience', icon: Stethoscope, iconCls: 'text-violet-400', badgeCls: 'bg-violet-900/30 text-violet-400 border-violet-500/30' },
  medicare_physician_by_provider: { label: 'Medicare Physician Utilization', icon: DollarSign, iconCls: 'text-emerald-400', badgeCls: 'bg-emerald-900/30 text-emerald-400 border-emerald-500/30' },
  medicare_part_d_prescribers: { label: 'Part D Prescribing', icon: Pill, iconCls: 'text-amber-400', badgeCls: 'bg-amber-900/30 text-amber-400 border-amber-500/30' },
  medicare_dme_by_referring: { label: 'DME Referrals', icon: Package, iconCls: 'text-teal-400', badgeCls: 'bg-teal-900/30 text-teal-400 border-teal-500/30' },
  medicare_dme_by_supplier: { label: 'DME Supplier Data', icon: Package, iconCls: 'text-teal-400', badgeCls: 'bg-teal-900/30 text-teal-400 border-teal-500/30' },
  medicare_spending_by_drug_b: { label: 'Drug Spending (Part B)', icon: DollarSign, iconCls: 'text-rose-400', badgeCls: 'bg-rose-900/30 text-rose-400 border-rose-500/30' },
  medicare_spending_by_drug_d: { label: 'Drug Spending (Part D)', icon: DollarSign, iconCls: 'text-rose-400', badgeCls: 'bg-rose-900/30 text-rose-400 border-rose-500/30' },
  cms_order_referring: { label: 'Order & Referring', icon: Stethoscope, iconCls: 'text-sky-400', badgeCls: 'bg-sky-900/30 text-sky-400 border-sky-500/30' },
  provider_service_utilization: { label: 'Service Utilization', icon: DollarSign, iconCls: 'text-cyan-400', badgeCls: 'bg-cyan-900/30 text-cyan-400 border-cyan-500/30' },
};

const DEFAULT_TYPE = { label: '', icon: Database, iconCls: 'text-slate-400', badgeCls: 'bg-slate-900/30 text-slate-400 border-slate-500/30' };

function formatValue(val) {
  if (val == null || val === '') return '—';
  if (typeof val === 'number') return val.toLocaleString();
  if (typeof val === 'string' && !isNaN(Number(val)) && val.length < 15) {
    const num = Number(val);
    if (num > 999) return num.toLocaleString();
  }
  return String(val);
}

function DataTypeSection({ typeName, rows }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = TYPE_CONFIG[typeName];
  const config = cfg || { ...DEFAULT_TYPE, label: typeName.replace(/_/g, ' ') };
  const Icon = config.icon;

  const latestRow = rows[0];
  const raw = latestRow?.raw_data || {};
  const importantKeys = Object.keys(raw).filter(k =>
    !['id', 'npi', 'provider_id', 'created_date', 'updated_date', 'import_batch_id'].includes(k)
  ).slice(0, 8);

  return (
    <div className="bg-slate-900/50 rounded-lg border border-slate-700/30 overflow-hidden">
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-slate-800/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Icon className={`w-4 h-4 ${config.iconCls} flex-shrink-0`} />
          <span className="text-sm font-medium text-slate-200">{config.label}</span>
          <Badge className={`${config.badgeCls} text-[10px]`}>
            {rows.length} record{rows.length !== 1 ? 's' : ''}
          </Badge>
          {latestRow?.data_year && (
            <span className="text-[10px] text-slate-400">{latestRow.data_year}</span>
          )}
        </div>
        {expanded ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
      </div>

      {expanded && (
        <div className="px-4 pb-3 border-t border-slate-700/30 pt-3">
          {importantKeys.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {importantKeys.map(key => (
                <div key={key} className="bg-slate-800/50 rounded p-2">
                  <p className="text-[9px] text-slate-400 uppercase tracking-wide truncate" title={key}>
                    {key.replace(/_/g, ' ')}
                  </p>
                  <p className="text-xs text-slate-300 truncate mt-0.5" title={String(raw[key])}>
                    {formatValue(raw[key])}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400">No detailed data available</p>
          )}
          {rows.length > 1 && (
            <p className="text-[10px] text-slate-400 mt-2">
              {rows.length} records across years: {[...new Set(rows.map(r => r.data_year).filter(Boolean))].sort().join(', ')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function ProviderCMSDataCard({ clinicianData, utilizationCmsData }) {
  const hasClinicianData = clinicianData?.has_data;
  const hasUtilData = utilizationCmsData?.has_data;

  if (!hasClinicianData && !hasUtilData) return null;

  const allTypes = [
    ...(hasClinicianData ? Object.entries(clinicianData.by_type) : []),
    ...(hasUtilData ? Object.entries(utilizationCmsData.by_type) : []),
  ];

  return (
    <Card className="bg-slate-800/50 border-slate-700/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2 text-slate-200">
            <Database className="w-4 h-4 text-cyan-400" />
            CMS Provider Data
          </CardTitle>
          <Badge className="bg-cyan-900/30 text-cyan-400 border-cyan-500/30 text-xs">
            {allTypes.length} dataset{allTypes.length !== 1 ? 's' : ''}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {allTypes.map(([typeName, rows]) => (
          <DataTypeSection key={typeName} typeName={typeName} rows={rows} />
        ))}
      </CardContent>
    </Card>
  );
}
