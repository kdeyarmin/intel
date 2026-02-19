import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, ScatterChart, Scatter, ZAxis } from 'recharts';

export default function ProviderPerformanceChart({ utilization, referrals, loading }) {
  // Top providers by payment
  const topProviders = useMemo(() => {
    const byNPI = {};
    utilization.forEach(r => {
      if (!r.npi) return;
      if (!byNPI[r.npi]) byNPI[r.npi] = { npi: r.npi, payment: 0, beneficiaries: 0, services: 0 };
      byNPI[r.npi].payment += r.total_medicare_payment || 0;
      byNPI[r.npi].beneficiaries += r.total_medicare_beneficiaries || 0;
      byNPI[r.npi].services += r.total_services || 0;
    });
    return Object.values(byNPI)
      .sort((a, b) => b.payment - a.payment)
      .slice(0, 10)
      .map(p => ({
        name: `...${p.npi.slice(-4)}`,
        payment: Math.round(p.payment),
        beneficiaries: p.beneficiaries,
        services: p.services,
      }));
  }, [utilization]);

  // Referral breakdown
  const referralBreakdown = useMemo(() => {
    let hh = 0, hospice = 0, dme = 0, snf = 0;
    referrals.forEach(r => {
      hh += r.home_health_referrals || 0;
      hospice += r.hospice_referrals || 0;
      dme += r.dme_referrals || 0;
      snf += r.snf_referrals || 0;
    });
    return [
      { name: 'Home Health', value: hh },
      { name: 'Hospice', value: hospice },
      { name: 'DME', value: dme },
      { name: 'SNF', value: snf },
    ].filter(d => d.value > 0);
  }, [referrals]);

  if (loading) return <Card><CardContent className="p-6"><Skeleton className="h-80 w-full" /></CardContent></Card>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <div className="w-2 h-2 bg-emerald-500 rounded-full" />
          Provider Performance & Referrals
        </CardTitle>
        <CardDescription>Top providers by Medicare payments & referral breakdown</CardDescription>
      </CardHeader>
      <CardContent>
        {topProviders.length === 0 && referralBreakdown.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-sm">No utilization or referral data available</div>
        ) : (
          <div className="space-y-6">
            {topProviders.length > 0 && (
              <div>
                <p className="text-xs font-medium text-slate-500 mb-2">Top 10 Providers by Medicare Payment</p>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={topProviders} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" fontSize={10} tick={{ fill: '#64748b' }} />
                    <YAxis fontSize={10} tick={{ fill: '#64748b' }} tickFormatter={v => v >= 1e6 ? `$${(v/1e6).toFixed(1)}M` : v >= 1e3 ? `$${(v/1e3).toFixed(0)}K` : `$${v}`} />
                    <Tooltip formatter={v => `$${v.toLocaleString()}`} />
                    <Bar dataKey="payment" fill="#10b981" name="Medicare Payment" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            {referralBreakdown.length > 0 && (
              <div>
                <p className="text-xs font-medium text-slate-500 mb-2">Referral Breakdown by Type</p>
                <ResponsiveContainer width="100%" height={140}>
                  <BarChart data={referralBreakdown} layout="vertical" margin={{ left: 80, right: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis type="number" fontSize={10} tick={{ fill: '#64748b' }} tickFormatter={v => v >= 1e3 ? `${(v/1e3).toFixed(0)}K` : v} />
                    <YAxis type="category" dataKey="name" fontSize={11} tick={{ fill: '#64748b' }} width={75} />
                    <Tooltip formatter={v => v.toLocaleString()} />
                    <Bar dataKey="value" fill="#8b5cf6" name="Referrals" radius={[0,4,4,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}