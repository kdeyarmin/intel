import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  CheckCircle2, XCircle, Clock, ChevronDown, ChevronUp,
  Building2, Star, GraduationCap, Globe, Stethoscope, Users
} from 'lucide-react';

const STATUS_CONFIG = {
  pending_review: { label: 'Pending Review', color: 'bg-amber-500/15 text-amber-400 border-amber-500/20', icon: Clock },
  approved: { label: 'Approved', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20', icon: CheckCircle2 },
  rejected: { label: 'Rejected', color: 'bg-red-500/15 text-red-400 border-red-500/20', icon: XCircle },
  auto_applied: { label: 'Auto-Applied', color: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20', icon: CheckCircle2 },
};

const CONFIDENCE_COLORS = {
  high: 'bg-emerald-500/15 text-emerald-400',
  medium: 'bg-amber-500/15 text-amber-400',
  low: 'bg-red-500/15 text-red-400',
};

function EnrichmentDetailCard({ details }) {
  if (!details) return null;
  const sections = [];

  if (details.hospital_affiliations?.length > 0) {
    sections.push({ icon: Building2, label: 'Hospital Affiliations', items: details.hospital_affiliations });
  }
  if (details.group_practices?.length > 0) {
    sections.push({ icon: Users, label: 'Group Practices', items: details.group_practices });
  }
  if (details.board_certifications?.length > 0) {
    sections.push({ icon: Stethoscope, label: 'Board Certifications', items: details.board_certifications });
  }
  if (details.languages?.length > 0) {
    sections.push({ icon: Globe, label: 'Languages', items: details.languages });
  }

  return (
    <div className="space-y-3 mt-3">
      {sections.map(s => (
        <div key={s.label}>
          <div className="flex items-center gap-1.5 mb-1">
            <s.icon className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">{s.label}</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {s.items.map((item, i) => (
              <Badge key={i} className="bg-slate-700/50 text-slate-300 text-[10px]">{item}</Badge>
            ))}
          </div>
        </div>
      ))}
      {details.review_score && (
        <div className="flex items-center gap-2">
          <Star className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-xs text-slate-300">
            {details.review_score}/5
            {details.review_count && <span className="text-slate-500"> ({details.review_count} reviews)</span>}
            {details.review_source && <span className="text-slate-500"> via {details.review_source}</span>}
          </span>
        </div>
      )}
      {details.education && (
        <div className="flex items-center gap-2">
          <GraduationCap className="w-3.5 h-3.5 text-violet-400" />
          <span className="text-xs text-slate-300">{details.education}</span>
        </div>
      )}
      {details.accepting_new_patients !== null && details.accepting_new_patients !== undefined && (
        <div className="text-xs text-slate-400">
          Accepting new patients: <span className={details.accepting_new_patients ? 'text-emerald-400' : 'text-red-400'}>
            {details.accepting_new_patients ? 'Yes' : 'No'}
          </span>
        </div>
      )}
    </div>
  );
}

export default function EnrichmentReviewQueue({ statusFilter = 'pending_review' }) {
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState(null);
  const [filter, setFilter] = useState(statusFilter);

  const { data: records = [], isLoading } = useQuery({
    queryKey: ['enrichmentRecords', filter],
    queryFn: () => filter === 'all'
      ? base44.entities.EnrichmentRecord.list('-created_date', 100)
      : base44.entities.EnrichmentRecord.filter({ status: filter }, '-created_date', 100),
    staleTime: 15000,
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ id, status, npi, enrichment_details }) => {
      await base44.entities.EnrichmentRecord.update(id, {
        status,
        reviewed_by: (await base44.auth.me()).email,
        reviewed_at: new Date().toISOString(),
      });

      // If approved and has enrichment_details, save to provider
      if (status === 'approved' && enrichment_details) {
        const providers = await base44.entities.Provider.filter({ npi });
        if (providers.length > 0) {
          const update = {};
          if (enrichment_details.group_practices?.length > 0 && !providers[0].organization_name) {
            update.organization_name = enrichment_details.group_practices[0];
          }
          if (Object.keys(update).length > 0) {
            await base44.entities.Provider.update(providers[0].id, update);
          }
        }
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['enrichmentRecords'] }),
  });

  const pendingCount = records.filter(r => r.status === 'pending_review').length;

  return (
    <Card className="bg-[#141d30] border-slate-700/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-slate-300">
            Enrichment Review Queue
            {pendingCount > 0 && <Badge className="ml-2 bg-amber-500/20 text-amber-400 text-[10px]">{pendingCount} pending</Badge>}
          </CardTitle>
          <div className="flex gap-1">
            {['pending_review', 'approved', 'rejected', 'all'].map(s => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`text-[10px] px-2 py-0.5 rounded ${filter === s ? 'bg-cyan-500/20 text-cyan-400' : 'text-slate-500 hover:text-slate-300'}`}
              >
                {s === 'pending_review' ? 'Pending' : s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-slate-500 text-sm">Loading...</div>
        ) : records.length === 0 ? (
          <div className="text-center py-8 text-slate-500 text-sm">
            No enrichment records {filter !== 'all' ? `with status "${filter}"` : ''}
          </div>
        ) : (
          <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
            {records.map(r => {
              const isExpanded = expandedId === r.id;
              const sc = STATUS_CONFIG[r.status] || STATUS_CONFIG.pending_review;
              return (
                <div key={r.id} className="border border-slate-700/50 rounded-lg p-3 hover:bg-slate-800/30 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-slate-200 truncate">{r.provider_name || r.npi}</span>
                        <Badge variant="outline" className="text-[10px] font-mono text-slate-500">{r.npi}</Badge>
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <Badge className={`text-[10px] border ${sc.color}`}>{sc.label}</Badge>
                        <Badge className={`text-[10px] ${CONFIDENCE_COLORS[r.confidence] || ''}`}>{r.confidence} confidence</Badge>
                        <span className="text-[10px] text-slate-500">{r.source}</span>
                      </div>
                      {r.new_value && (
                        <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">{r.new_value}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {r.status === 'pending_review' && (
                        <>
                          <Button
                            size="sm"
                            className="h-7 text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white"
                            disabled={reviewMutation.isPending}
                            onClick={() => reviewMutation.mutate({ id: r.id, status: 'approved', npi: r.npi, enrichment_details: r.enrichment_details })}
                          >
                            <CheckCircle2 className="w-3 h-3 mr-1" /> Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[10px] text-red-400 border-red-500/30 hover:bg-red-500/10"
                            disabled={reviewMutation.isPending}
                            onClick={() => reviewMutation.mutate({ id: r.id, status: 'rejected', npi: r.npi })}
                          >
                            <XCircle className="w-3 h-3 mr-1" /> Reject
                          </Button>
                        </>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 text-slate-400"
                        onClick={() => setExpandedId(isExpanded ? null : r.id)}
                      >
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </Button>
                    </div>
                  </div>
                  {isExpanded && <EnrichmentDetailCard details={r.enrichment_details} />}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}