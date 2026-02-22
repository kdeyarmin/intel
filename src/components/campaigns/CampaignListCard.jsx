import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Trash2, Eye, Calendar, DollarSign, Target, Users } from 'lucide-react';

const STATUS_STYLES = {
  draft: 'bg-slate-500/15 text-slate-400 border-slate-500/20',
  active: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  paused: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  completed: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  archived: 'bg-slate-500/15 text-slate-500 border-slate-500/20',
};

export default function CampaignListCard({ campaign, listNames = {}, totalProviders = 0, onView, onDelete }) {
  const linkedLists = (campaign.lead_list_ids || []).map(id => listNames[id] || 'Unknown List');

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
            {campaign.description && (
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

        {/* Lead lists pills */}
        <div className="flex flex-wrap gap-1 mb-3">
          {linkedLists.length === 0 ? (
            <span className="text-[10px] text-slate-500 italic">No lists linked</span>
          ) : linkedLists.map((name, i) => (
            <Badge key={i} variant="outline" className="text-[10px] px-1.5">{name}</Badge>
          ))}
        </div>

        <div className="grid grid-cols-4 gap-2 pt-2 border-t border-slate-700/40">
          <div className="text-center">
            <Users className="w-3 h-3 mx-auto text-slate-500 mb-0.5" />
            <p className="text-sm font-bold text-slate-200">{totalProviders}</p>
            <p className="text-[9px] text-slate-500">Providers</p>
          </div>
          <div className="text-center">
            <Target className="w-3 h-3 mx-auto text-slate-500 mb-0.5" />
            <p className="text-sm font-bold text-slate-200">{campaign.target_conversion_rate || '-'}%</p>
            <p className="text-[9px] text-slate-500">Target CVR</p>
          </div>
          <div className="text-center">
            <DollarSign className="w-3 h-3 mx-auto text-slate-500 mb-0.5" />
            <p className="text-sm font-bold text-slate-200">{campaign.budget ? `$${campaign.budget.toLocaleString()}` : '-'}</p>
            <p className="text-[9px] text-slate-500">Budget</p>
          </div>
          <div className="text-center">
            <Calendar className="w-3 h-3 mx-auto text-slate-500 mb-0.5" />
            <p className="text-sm font-bold text-slate-200">{campaign.start_date ? new Date(campaign.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-'}</p>
            <p className="text-[9px] text-slate-500">Start</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}