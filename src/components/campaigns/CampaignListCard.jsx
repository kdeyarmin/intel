import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Trash2, Eye, Calendar, DollarSign, Target, Users, Mail, MessageSquare } from 'lucide-react';

const STATUS_STYLES = {
  draft: 'bg-slate-500/15 text-slate-400 border-slate-500/20',
  active: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  paused: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  completed: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  archived: 'bg-slate-500/15 text-slate-500 border-slate-500/20',
};

export default function CampaignListCard({ campaign, listNames = {}, totalProviders = 0, onView, onDelete }) {
  const linkedLists = (campaign.lead_list_ids || []).map(id => listNames[id] || 'Unknown List');
  const sent = campaign.emails_sent || 0;
  const opened = campaign.emails_opened || 0;
  const responded = campaign.emails_responded || 0;
  const conversions = campaign.conversions || 0;
  const openRate = sent > 0 ? ((opened / sent) * 100).toFixed(0) : '-';
  const audienceSize = campaign.audience_size || totalProviders;

  return (
    <Card className="bg-[#141d30] border-slate-700/50 hover:border-slate-600/60 transition-colors">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-200 truncate">{campaign.name}</h3>
              <Badge className={`text-[10px] ${STATUS_STYLES[campaign.status] || STATUS_STYLES.draft}`}>
                {campaign.status}
              </Badge>
            </div>
            {campaign.goal && (
              <p className="text-xs text-cyan-400/80 mt-0.5 flex items-center gap-1">
                <Target className="w-3 h-3" /> {campaign.goal}
              </p>
            )}
            {campaign.description && !campaign.goal && (
              <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{campaign.description}</p>
            )}
          </div>
          <div className="flex gap-1 ml-2">
            <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => onView(campaign)}>
              <Eye className="w-3.5 h-3.5" />
            </Button>
            <Button size="sm" variant="outline" className="h-7 px-2 text-red-400 hover:text-red-300 hover:bg-red-500/10" onClick={() => onDelete(campaign.id)}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* Lead lists / audience pills */}
        <div className="flex flex-wrap gap-1 mb-3">
          {linkedLists.length > 0 ? (
            linkedLists.map((name, i) => (
              <Badge key={i} variant="outline" className="text-[10px] px-1.5">{name}</Badge>
            ))
          ) : campaign.audience_filters && Object.keys(campaign.audience_filters).length > 0 ? (
            <Badge className="bg-violet-500/15 text-violet-400 border border-violet-500/20 text-[10px]">
              Filtered Audience · {audienceSize} providers
            </Badge>
          ) : (
            <span className="text-[10px] text-slate-500 italic">No audience selected</span>
          )}
        </div>

        <div className="grid grid-cols-5 gap-1.5 pt-2 border-t border-slate-700/40">
          <div className="text-center">
            <Users className="w-3 h-3 mx-auto text-slate-500 mb-0.5" />
            <p className="text-sm font-bold text-slate-200">{audienceSize}</p>
            <p className="text-[9px] text-slate-500">Audience</p>
          </div>
          <div className="text-center">
            <Mail className="w-3 h-3 mx-auto text-cyan-500 mb-0.5" />
            <p className="text-sm font-bold text-slate-200">{sent}</p>
            <p className="text-[9px] text-slate-500">Sent</p>
          </div>
          <div className="text-center">
            <Eye className="w-3 h-3 mx-auto text-blue-500 mb-0.5" />
            <p className="text-sm font-bold text-slate-200">{openRate}%</p>
            <p className="text-[9px] text-slate-500">Open Rate</p>
          </div>
          <div className="text-center">
            <MessageSquare className="w-3 h-3 mx-auto text-green-500 mb-0.5" />
            <p className="text-sm font-bold text-slate-200">{responded}</p>
            <p className="text-[9px] text-slate-500">Responses</p>
          </div>
          <div className="text-center">
            <Target className="w-3 h-3 mx-auto text-emerald-500 mb-0.5" />
            <p className="text-sm font-bold text-slate-200">{conversions}</p>
            <p className="text-[9px] text-slate-500">Converts</p>
          </div>
        </div>

        {/* Date range */}
        {(campaign.start_date || campaign.end_date) && (
          <div className="flex items-center gap-1 mt-2 text-[10px] text-slate-500">
            <Calendar className="w-3 h-3" />
            {campaign.start_date && new Date(campaign.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            {campaign.start_date && campaign.end_date && ' – '}
            {campaign.end_date && new Date(campaign.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            {campaign.budget > 0 && (
              <span className="ml-auto flex items-center gap-0.5">
                <DollarSign className="w-3 h-3" />{campaign.budget.toLocaleString()} budget
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}