import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Phone, Printer, Mail, MapPin, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

export default function ContactEnrichmentStatus({ location, provider }) {
  const fields = [
    { label: 'Address', icon: MapPin, filled: !!location?.address_1 },
    { label: 'Phone', icon: Phone, filled: !!location?.phone },
    { label: 'Fax', icon: Printer, filled: !!location?.fax },
  ];

  const providerFields = [
    { label: 'Credential', filled: !!provider?.credential },
    { label: 'Gender', filled: !!provider?.gender },
    { label: 'Enumeration Date', filled: !!provider?.enumeration_date },
  ];

  const locScore = fields.filter(f => f.filled).length;
  const provScore = providerFields.filter(f => f.filled).length;
  const total = fields.length + providerFields.length;
  const filledTotal = locScore + provScore;
  const pct = Math.round((filledTotal / total) * 100);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Mail className="w-4 h-4 text-emerald-500" />
          Contact Enrichment
          <Badge className={`text-[10px] ml-auto ${pct === 100 ? 'bg-green-100 text-green-700' : pct >= 60 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
            {pct}% Complete
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Progress bar */}
        <div className="w-full bg-slate-100 rounded-full h-2">
          <div className={`h-2 rounded-full transition-all ${pct === 100 ? 'bg-green-500' : pct >= 60 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${pct}%` }} />
        </div>

        <div>
          <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide mb-1.5">Location Contact</p>
          <div className="space-y-1">
            {fields.map(f => {
              const Icon = f.icon;
              return (
                <div key={f.label} className="flex items-center gap-2 text-xs">
                  {f.filled ? <CheckCircle className="w-3.5 h-3.5 text-green-500" /> : <XCircle className="w-3.5 h-3.5 text-slate-300" />}
                  <Icon className="w-3 h-3 text-slate-400" />
                  <span className={f.filled ? 'text-slate-600' : 'text-slate-400'}>{f.label}</span>
                  {f.filled && f.label === 'Phone' && <span className="text-slate-400 ml-auto">{location.phone}</span>}
                  {f.filled && f.label === 'Fax' && <span className="text-slate-400 ml-auto">{location.fax}</span>}
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide mb-1.5">Provider Data</p>
          <div className="space-y-1">
            {providerFields.map(f => (
              <div key={f.label} className="flex items-center gap-2 text-xs">
                {f.filled ? <CheckCircle className="w-3.5 h-3.5 text-green-500" /> : <XCircle className="w-3.5 h-3.5 text-slate-300" />}
                <span className={f.filled ? 'text-slate-600' : 'text-slate-400'}>{f.label}</span>
              </div>
            ))}
          </div>
        </div>

        {provider?.needs_nppes_enrichment && (
          <div className="flex items-center gap-2 text-xs bg-amber-50 text-amber-700 rounded px-2.5 py-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            Provider needs NPPES enrichment for complete data
          </div>
        )}
      </CardContent>
    </Card>
  );
}