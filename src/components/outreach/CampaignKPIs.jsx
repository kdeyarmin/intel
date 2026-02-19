import React from 'react';
import { Send, Eye, MessageSquare, AlertTriangle } from 'lucide-react';

export default function CampaignKPIs({ campaigns = [] }) {
  const totalSent = campaigns.reduce((s, c) => s + (c.sent_count || 0), 0);
  const totalOpened = campaigns.reduce((s, c) => s + (c.opened_count || 0), 0);
  const totalResponded = campaigns.reduce((s, c) => s + (c.responded_count || 0), 0);
  const totalBounced = campaigns.reduce((s, c) => s + (c.bounced_count || 0), 0);
  const openRate = totalSent > 0 ? ((totalOpened / totalSent) * 100).toFixed(1) : '0';
  const responseRate = totalSent > 0 ? ((totalResponded / totalSent) * 100).toFixed(1) : '0';

  const kpis = [
    { label: 'Emails Sent', value: totalSent, icon: Send, color: 'bg-blue-50 text-blue-600' },
    { label: 'Open Rate', value: `${openRate}%`, icon: Eye, color: 'bg-emerald-50 text-emerald-600' },
    { label: 'Response Rate', value: `${responseRate}%`, icon: MessageSquare, color: 'bg-violet-50 text-violet-600' },
    { label: 'Bounced', value: totalBounced, icon: AlertTriangle, color: 'bg-amber-50 text-amber-600' },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {kpis.map(k => {
        const Icon = k.icon;
        return (
          <div key={k.label} className={`rounded-xl p-4 ${k.color}`}>
            <div className="flex items-center gap-2 mb-1">
              <Icon className="w-4 h-4" />
              <span className="text-[10px] font-medium uppercase tracking-wide">{k.label}</span>
            </div>
            <p className="text-2xl font-bold">{k.value}</p>
          </div>
        );
      })}
    </div>
  );
}