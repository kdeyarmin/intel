import React from 'react';
import { CheckCircle, XCircle } from 'lucide-react';

const VALID_STATES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC','PR','VI','GU','AS','MP',
]);

function validateNPI(npi) {
  if (!npi) return false;
  const cleaned = String(npi).replace(/\D/g, '');
  return cleaned.length === 10;
}

function CheckRow({ label, passed, total }) {
  const pct = total > 0 ? Math.round((passed / total) * 100) : 0;
  const isGood = pct >= 90;
  return (
    <div className="flex items-center justify-between py-1.5">
      <div className="flex items-center gap-1.5">
        {isGood
          ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
          : <XCircle className="w-3.5 h-3.5 text-red-400" />
        }
        <span className="text-xs text-slate-400">{label}</span>
      </div>
      <span className={`text-xs font-semibold ${isGood ? 'text-emerald-400' : 'text-red-400'}`}>
        {passed}/{total} ({pct}%)
      </span>
    </div>
  );
}

export default function AccuracyPanel({ providers = [], locations = [] }) {
  const validNPIs = providers.filter(p => validateNPI(p.npi)).length;
  const validStates = locations.filter(l => l.state && VALID_STATES.has(l.state.toUpperCase())).length;
  const validZips = locations.filter(l => l.zip && /^\d{5}(-\d{4})?$/.test(l.zip.trim())).length;
  const validEntityTypes = providers.filter(p => p.entity_type === 'Individual' || p.entity_type === 'Organization').length;
  const validGender = providers.filter(p => ['M', 'F', ''].includes(p.gender)).length;

  return (
    <div>
      <h4 className="text-xs font-semibold text-slate-300 mb-1">Data Accuracy Checks</h4>
      <div className="divide-y divide-slate-700/30">
        <CheckRow label="Valid NPI format" passed={validNPIs} total={providers.length} />
        <CheckRow label="Valid entity type" passed={validEntityTypes} total={providers.length} />
        <CheckRow label="Valid gender code" passed={validGender} total={providers.length} />
        <CheckRow label="Valid state code" passed={validStates} total={locations.length} />
        <CheckRow label="Valid ZIP format" passed={validZips} total={locations.length} />
      </div>
    </div>
  );
}