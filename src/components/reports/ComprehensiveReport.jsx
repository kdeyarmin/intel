import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import {
  FileText, Users, MapPin, Stethoscope, DollarSign, Activity,
  Network, Building2, TrendingUp, Shield, ArrowRight, Printer,
  ChevronDown, ChevronUp, ExternalLink
} from 'lucide-react';

function formatCurrency(val) {
  if (!val) return '$0';
  const num = Number(val);
  if (num >= 1e9) return `$${(num / 1e9).toFixed(1)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(1)}M`;
  if (num >= 1e3) return `$${(num / 1e3).toFixed(0)}K`;
  return `$${num.toLocaleString()}`;
}

function SectionCard({ icon: Icon, iconColor, title, children, count, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className="bg-slate-800/50 border-slate-700/50 print:bg-white print:border-gray-200">
      <CardHeader className="pb-2 cursor-pointer" onClick={() => setOpen(!open)}>
        <CardTitle className="text-sm text-slate-200 flex items-center gap-2 print:text-gray-900">
          <Icon className={`w-4 h-4 ${iconColor}`} />
          {title}
          {count != null && (
            <Badge className="bg-slate-700/50 text-slate-400 border-slate-600/50 text-[10px] ml-auto mr-2">{count}</Badge>
          )}
          {open ? <ChevronUp className="w-3.5 h-3.5 text-slate-500" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-500" />}
        </CardTitle>
      </CardHeader>
      {open && <CardContent>{children}</CardContent>}
    </Card>
  );
}

export default function ComprehensiveReport({ npi, providerId }) {
  const [open, setOpen] = useState(false);

  const { data: report, isLoading, error } = useQuery({
    queryKey: ['comprehensiveReport', npi, providerId],
    queryFn: () => base44.functions.invoke('getComprehensiveReport', {
      npi: npi || undefined,
      provider_id: providerId || undefined,
    }),
    enabled: open && !!(npi || providerId),
    staleTime: 60000,
    select: (res) => res?.data || res,
  });

  if (!open) {
    return (
      <Button
        onClick={() => setOpen(true)}
        className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white text-sm"
      >
        <FileText className="w-4 h-4 mr-2" /> Generate Full Report
      </Button>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64 bg-slate-800" />
        {[1,2,3,4].map(i => <Skeleton key={i} className="h-32 bg-slate-800" />)}
      </div>
    );
  }

  if (error || !report) {
    return (
      <Card className="bg-slate-800/50 border-slate-700/50">
        <CardContent className="py-6 text-center">
          <p className="text-sm text-slate-400">Unable to generate report</p>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)} className="mt-2 text-xs text-cyan-400">
            Close
          </Button>
        </CardContent>
      </Card>
    );
  }

  const summary = report.summary || {};
  const provider = report.provider;

  return (
    <div className="space-y-4 print:space-y-2" id="comprehensive-report">
      <div className="flex items-center justify-between print:hidden">
        <h3 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
          <FileText className="w-5 h-5 text-cyan-400" />
          Comprehensive Report
        </h3>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="text-xs bg-transparent border-slate-700 text-slate-400 hover:bg-slate-800"
            onClick={() => window.print()}
          >
            <Printer className="w-3.5 h-3.5 mr-1" /> Print
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)} className="text-xs text-slate-400">
            Close
          </Button>
        </div>
      </div>

      <div className="text-[10px] text-slate-500 print:text-gray-500">
        Generated: {new Date(report.generatedAt).toLocaleString()}
      </div>

      {provider && (
        <Card className="bg-slate-800/50 border-slate-700/50 print:bg-white print:border-gray-200">
          <CardContent className="py-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-100 print:text-gray-900">{provider.displayName}</h2>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  <Badge className="bg-slate-700/50 text-slate-300 border-slate-600/50 text-[10px]">NPI: {provider.npi}</Badge>
                  <Badge className={`text-[10px] ${provider.entityType === '2' ? 'bg-violet-900/30 text-violet-400 border-violet-500/30' : 'bg-cyan-900/30 text-cyan-400 border-cyan-500/30'}`}>
                    {provider.entityType === '2' ? 'Organization' : 'Individual'}
                  </Badge>
                  {provider.credential && <Badge className="bg-slate-700/50 text-slate-300 border-slate-600/50 text-[10px]">{provider.credential}</Badge>}
                  {provider.status && (
                    <Badge className={`text-[10px] ${provider.status === 'active' ? 'bg-emerald-900/30 text-emerald-400 border-emerald-500/30' : 'bg-red-900/30 text-red-400 border-red-500/30'}`}>
                      {provider.status}
                    </Badge>
                  )}
                </div>
                {(provider.email || provider.phone) && (
                  <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
                    {provider.email && <span>{provider.email}</span>}
                    {provider.phone && <span>{provider.phone}</span>}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 print:grid-cols-5">
        <Card className="bg-slate-800/50 border-slate-700/50 print:bg-white print:border-gray-200">
          <CardContent className="py-3 px-4">
            <div className="text-[10px] text-slate-400 mb-1">Total Payments</div>
            <div className="text-lg font-bold text-amber-400 print:text-amber-600">{formatCurrency(summary.totalPayments)}</div>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 border-slate-700/50 print:bg-white print:border-gray-200">
          <CardContent className="py-3 px-4">
            <div className="text-[10px] text-slate-400 mb-1">Total Services</div>
            <div className="text-lg font-bold text-cyan-400 print:text-cyan-600">{summary.totalServices?.toLocaleString() || 0}</div>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 border-slate-700/50 print:bg-white print:border-gray-200">
          <CardContent className="py-3 px-4">
            <div className="text-[10px] text-slate-400 mb-1">Beneficiaries</div>
            <div className="text-lg font-bold text-emerald-400 print:text-emerald-600">{summary.totalBeneficiaries?.toLocaleString() || 0}</div>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 border-slate-700/50 print:bg-white print:border-gray-200">
          <CardContent className="py-3 px-4">
            <div className="text-[10px] text-slate-400 mb-1">Referrals Out</div>
            <div className="text-lg font-bold text-orange-400 print:text-orange-600">{summary.totalReferralsOut?.toLocaleString() || 0}</div>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 border-slate-700/50 print:bg-white print:border-gray-200">
          <CardContent className="py-3 px-4">
            <div className="text-[10px] text-slate-400 mb-1">Referrals In</div>
            <div className="text-lg font-bold text-violet-400 print:text-violet-600">{summary.totalReferralsIn?.toLocaleString() || 0}</div>
          </CardContent>
        </Card>
      </div>

      {report.locations?.length > 0 && (
        <SectionCard icon={MapPin} iconColor="text-cyan-400" title="Locations" count={report.locations.length}>
          <div className="space-y-2">
            {report.locations.map((loc, i) => (
              <div key={i} className="flex items-start justify-between p-2 rounded bg-slate-900/30 border border-slate-700/30 print:bg-gray-50 print:border-gray-200">
                <div>
                  <p className="text-xs text-slate-200 print:text-gray-800">
                    {[loc.address_1, loc.address_2].filter(Boolean).join(', ')}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    {[loc.city, loc.state, loc.zip?.substring(0, 5)].filter(Boolean).join(', ')}
                  </p>
                </div>
                {loc.is_primary && <Badge className="bg-cyan-900/30 text-cyan-400 border-cyan-500/30 text-[9px]">Primary</Badge>}
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {report.taxonomies?.length > 0 && (
        <SectionCard icon={Stethoscope} iconColor="text-green-400" title="Taxonomies" count={report.taxonomies.length}>
          <div className="flex flex-wrap gap-2">
            {report.taxonomies.map((t, i) => (
              <Badge key={i} className={`text-[10px] ${t.is_primary ? 'bg-green-900/30 text-green-400 border-green-500/30' : 'bg-slate-700/50 text-slate-300 border-slate-600/50'}`}>
                {t.classification || t.taxonomy_code}
                {t.is_primary && ' (Primary)'}
              </Badge>
            ))}
          </div>
        </SectionCard>
      )}

      {report.utilization?.length > 0 && (
        <SectionCard icon={Activity} iconColor="text-blue-400" title="Service Utilization" count={report.utilization.length}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-800/70">
                  <th className="text-left py-2 px-3 text-slate-400 font-medium text-xs">Service Type</th>
                  <th className="text-right py-2 px-3 text-slate-400 font-medium text-xs">Year</th>
                  <th className="text-right py-2 px-3 text-slate-400 font-medium text-xs">Services</th>
                  <th className="text-right py-2 px-3 text-slate-400 font-medium text-xs">Beneficiaries</th>
                  <th className="text-right py-2 px-3 text-slate-400 font-medium text-xs">Payment</th>
                </tr>
              </thead>
              <tbody>
                {report.utilization.slice(0, 30).map((u, i) => (
                  <tr key={i} className="border-t border-slate-800/50">
                    <td className="py-1.5 px-3 text-xs text-slate-300 max-w-[200px] truncate">{u.serviceType || u.hcpcsDescription || '—'}</td>
                    <td className="py-1.5 px-3 text-xs text-slate-400 text-right">{u.dataYear}</td>
                    <td className="py-1.5 px-3 text-xs text-slate-200 text-right">{Number(u.totalServices || 0).toLocaleString()}</td>
                    <td className="py-1.5 px-3 text-xs text-slate-300 text-right">{Number(u.totalBeneficiaries || 0).toLocaleString()}</td>
                    <td className="py-1.5 px-3 text-xs text-amber-400 text-right font-medium">{formatCurrency(u.totalPayment)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {report.referralsFrom?.length > 0 && (
        <SectionCard icon={Network} iconColor="text-orange-400" title="Referrals Sent" count={report.referralsFrom.length} defaultOpen={false}>
          <div className="space-y-2">
            {report.referralsFrom.map((r, i) => (
              <div key={i} className="flex items-center justify-between p-2 rounded bg-slate-900/30 border border-slate-700/30">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-200 truncate">{r.toName || r.toNpi}</p>
                  <Link to={createPageUrl('ProviderDetail') + `?npi=${r.toNpi}`} className="text-[10px] text-cyan-400 hover:underline">
                    NPI: {r.toNpi}
                  </Link>
                </div>
                <div className="text-right flex-shrink-0 ml-3">
                  <p className="text-xs font-medium text-slate-200">{r.totalReferrals?.toLocaleString()} referrals</p>
                  <p className="text-[10px] text-slate-400">{r.totalBeneficiaries?.toLocaleString()} beneficiaries</p>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {report.referralsTo?.length > 0 && (
        <SectionCard icon={Network} iconColor="text-violet-400" title="Referrals Received" count={report.referralsTo.length} defaultOpen={false}>
          <div className="space-y-2">
            {report.referralsTo.map((r, i) => (
              <div key={i} className="flex items-center justify-between p-2 rounded bg-slate-900/30 border border-slate-700/30">
                <div className="flex-1 min-w-0">
                  <Link to={createPageUrl('ProviderDetail') + `?npi=${r.fromNpi}`} className="text-xs text-cyan-400 hover:underline">
                    NPI: {r.fromNpi}
                  </Link>
                </div>
                <div className="text-right flex-shrink-0 ml-3">
                  <p className="text-xs font-medium text-slate-200">{r.totalReferrals?.toLocaleString()} referrals</p>
                  <p className="text-[10px] text-slate-400">{r.totalBeneficiaries?.toLocaleString()} beneficiaries</p>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {report.affiliations?.length > 0 && (
        <SectionCard icon={Building2} iconColor="text-emerald-400" title="Affiliations" count={report.affiliations.length} defaultOpen={false}>
          <div className="space-y-2">
            {report.affiliations.map((a, i) => (
              <div key={i} className="flex items-center justify-between p-2 rounded bg-slate-900/30 border border-slate-700/30">
                <div>
                  <p className="text-xs text-slate-200">{a.organization_name || a.organization_npi}</p>
                  {a.organization_npi && (
                    <Link to={createPageUrl('ProviderDetail') + `?npi=${a.organization_npi}`} className="text-[10px] text-cyan-400 hover:underline">
                      NPI: {a.organization_npi}
                    </Link>
                  )}
                </div>
                {a.affiliation_type && (
                  <Badge className="bg-emerald-900/30 text-emerald-400 border-emerald-500/30 text-[9px]">{a.affiliation_type}</Badge>
                )}
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {report.facilities?.length > 0 && (
        <SectionCard icon={Building2} iconColor="text-blue-400" title="Linked Facilities" count={report.facilities.length} defaultOpen={false}>
          <div className="space-y-2">
            {report.facilities.map((f, i) => (
              <Link
                key={i}
                to={createPageUrl('FacilityDetail') + `?id=${f.providerId}&group=${f.facilityType}`}
                className="flex items-center justify-between p-2 rounded bg-slate-900/30 border border-slate-700/30 hover:border-cyan-500/30 transition-colors block"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-200 truncate">{f.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge className="bg-blue-900/30 text-blue-400 border-blue-500/30 text-[9px]">{f.facilityType}</Badge>
                    <span className="text-[10px] text-slate-500">{f.city}, {f.state}</span>
                  </div>
                </div>
                <div className="text-right flex-shrink-0 ml-3">
                  {f.qualityRating && <p className="text-xs text-amber-400">{f.qualityRating}/5</p>}
                  <p className="text-[10px] text-slate-400">{formatCurrency(f.totalPayments)}</p>
                </div>
              </Link>
            ))}
          </div>
        </SectionCard>
      )}

      {report.leadScore && (
        <SectionCard icon={TrendingUp} iconColor="text-amber-400" title="Lead Score" defaultOpen={false}>
          <div className="flex items-center gap-4">
            <div className={`text-3xl font-bold ${
              report.leadScore.score >= 70 ? 'text-emerald-400' :
              report.leadScore.score >= 40 ? 'text-amber-400' : 'text-red-400'
            }`}>
              {Math.round(report.leadScore.score)}
            </div>
            {report.leadScore.reasons && (
              <div className="flex-1">
                <p className="text-xs text-slate-400">{report.leadScore.reasons}</p>
              </div>
            )}
          </div>
        </SectionCard>
      )}

      {report.enrichments?.length > 0 && (
        <SectionCard icon={Shield} iconColor="text-violet-400" title="Enrichment Records" count={report.enrichments.length} defaultOpen={false}>
          <div className="space-y-1.5">
            {report.enrichments.map((e, i) => (
              <div key={i} className="flex items-center justify-between p-2 rounded bg-slate-900/30 border border-slate-700/30 text-xs">
                <div>
                  <span className="text-slate-300">{e.fieldName}</span>
                  <span className="text-slate-500 ml-2">from {e.source}</span>
                </div>
                <div className="flex items-center gap-2">
                  {e.confidence && <Badge className="text-[9px] bg-slate-700/50 text-slate-400 border-slate-600/50">{e.confidence}</Badge>}
                  <Badge className={`text-[9px] ${e.status === 'applied' ? 'bg-emerald-900/30 text-emerald-400 border-emerald-500/30' : 'bg-amber-900/30 text-amber-400 border-amber-500/30'}`}>
                    {e.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}
