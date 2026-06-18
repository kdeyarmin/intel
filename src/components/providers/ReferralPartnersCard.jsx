import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Network, ArrowRight, ArrowLeft, ChevronDown } from 'lucide-react';

export default function ReferralPartnersCard({ npi, referrals = [] }) {
  const [showAll, setShowAll] = useState(false);
  const [tab, setTab] = useState('sent');

  const { data: receivedReferrals = [] } = useQuery({
    queryKey: ['referralsReceived', npi],
    queryFn: async () => {
      try {
        const result = await base44.functions.invoke('getComprehensiveReport', { npi });
        const data = result?.data || result;
        return data?.referralsTo || [];
      } catch {
        return [];
      }
    },
    enabled: !!npi,
    staleTime: 120000,
  });

  // Copy before sorting — `referrals`/`receivedReferrals` come from React
  // Query's cache; sorting in place mutates the cached array.
  const sent = [...referrals]
    .sort((a, b) => (b.total_referrals || 0) - (a.total_referrals || 0))
    .slice(0, 30);

  const received = [...receivedReferrals]
    .sort((a, b) => (b.totalReferrals || 0) - (a.totalReferrals || 0))
    .slice(0, 30);

  const activeList = tab === 'sent' ? sent : received;
  const displayList = showAll ? activeList : activeList.slice(0, 8);

  if (sent.length === 0 && received.length === 0) return null;

  return (
    <Card className="bg-slate-800/50 border-slate-700/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm text-slate-200 flex items-center gap-2">
          <Network className="w-4 h-4 text-orange-400" />
          Referral Partners
          <Badge className="bg-slate-700/50 text-slate-400 border-slate-600/50 text-[10px] ml-auto">
            {sent.length + received.length} total
          </Badge>
        </CardTitle>
        <div className="flex gap-1 mt-2">
          <Button
            variant="ghost"
            size="sm"
            className={`text-xs h-7 ${tab === 'sent' ? 'bg-orange-900/30 text-orange-400' : 'text-slate-400 hover:text-slate-200'}`}
            onClick={() => { setTab('sent'); setShowAll(false); }}
          >
            <ArrowRight className="w-3 h-3 mr-1" /> Sent ({sent.length})
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={`text-xs h-7 ${tab === 'received' ? 'bg-violet-900/30 text-violet-400' : 'text-slate-400 hover:text-slate-200'}`}
            onClick={() => { setTab('received'); setShowAll(false); }}
          >
            <ArrowLeft className="w-3 h-3 mr-1" /> Received ({received.length})
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {displayList.length === 0 ? (
          <p className="text-xs text-slate-500">No {tab} referrals found</p>
        ) : (
          <div className="space-y-2">
            {displayList.map((r, i) => {
              const partnerNpi = tab === 'sent' ? (r.referred_to_npi || r.toNpi) : (r.npi || r.fromNpi);
              const partnerName = tab === 'sent' ? (r.referred_to_name || r.toName) : null;
              const refCount = r.total_referrals || r.totalReferrals || 0;
              const beneCount = r.total_beneficiaries || r.totalBeneficiaries || 0;
              const maxRef = activeList[0] ? (activeList[0].total_referrals || activeList[0].totalReferrals || 1) : 1;

              return (
                <div key={partnerNpi || `${tab}-${i}`} className="group">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {partnerNpi ? (
                        <Link
                          to={createPageUrl('ProviderDetail') + `?npi=${partnerNpi}`}
                          className="text-xs text-cyan-400 hover:text-cyan-300 hover:underline truncate"
                        >
                          {partnerName || `NPI: ${partnerNpi}`}
                        </Link>
                      ) : (
                        <span className="text-xs text-slate-300 truncate">{partnerName || 'Unknown'}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0 ml-2">
                      <span className="text-xs font-medium text-slate-200">{refCount.toLocaleString()}</span>
                      <span className="text-[10px] text-slate-500">{beneCount.toLocaleString()} bene</span>
                    </div>
                  </div>
                  <div className="h-1 bg-slate-700/50 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${tab === 'sent' ? 'bg-gradient-to-r from-orange-500 to-orange-400' : 'bg-gradient-to-r from-violet-500 to-violet-400'}`}
                      style={{ width: `${Math.max((refCount / maxRef) * 100, 3)}%` }}
                    />
                  </div>
                </div>
              );
            })}
            {activeList.length > 8 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-cyan-400 hover:text-cyan-300 w-full mt-1"
                onClick={() => setShowAll(!showAll)}
              >
                <ChevronDown className={`w-3.5 h-3.5 mr-1 transition-transform ${showAll ? 'rotate-180' : ''}`} />
                {showAll ? 'Show less' : `Show all ${activeList.length}`}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
