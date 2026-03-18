import React from 'react';
import { Clock, Upload, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { formatDateET } from '../utils/dateUtils';

export default function SystemHealthStrip({ stats, loading }) {
  if (loading || !stats) return null;

  const items = [
    {
      label: 'Last Refresh',
      value: stats.lastRefresh ? formatDateET(stats.lastRefresh) : 'Never',
      icon: Clock,
      color: 'text-slate-400',
    },
    {
      label: 'Active Imports',
      value: stats.imports?.active || 0,
      icon: Upload,
      color: stats.imports?.active > 0 ? 'text-blue-400' : 'text-slate-500',
      link: 'ImportMonitoring',
    },
    {
      label: 'Completed Imports',
      value: stats.imports?.completed || 0,
      icon: CheckCircle2,
      color: 'text-emerald-400',
    },
    {
      label: 'Failed Imports',
      value: stats.imports?.failed || 0,
      icon: AlertTriangle,
      color: stats.imports?.failed > 0 ? 'text-red-400' : 'text-slate-500',
    },
    {
      label: 'Data Quality',
      value: stats.dataQuality ? `${stats.dataQuality.score}%` : 'No scan',
      icon: ShieldCheck,
      color: stats.dataQuality?.score >= 80 ? 'text-emerald-400' : stats.dataQuality?.score >= 50 ? 'text-amber-400' : 'text-red-400',
      link: 'DataQuality',
    },
    {
      label: 'Open Alerts',
      value: stats.openAlerts || 0,
      icon: AlertTriangle,
      color: stats.openAlerts > 0 ? 'text-amber-400' : 'text-emerald-400',
      link: 'DataQuality',
    },
  ];

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5 bg-[#0d1424] border border-slate-800/50 rounded-lg">
      {items.map((item, i) => {
        const Icon = item.icon;
        const content = (
          <div key={i} className="flex items-center gap-1.5 group cursor-default">
            <Icon className={`w-3 h-3 ${item.color}`} />
            <span className="text-[11px] text-slate-500">{item.label}:</span>
            <span className={`text-[11px] font-medium ${item.color} ${item.link ? 'group-hover:text-cyan-400' : ''}`}>{item.value}</span>
          </div>
        );
        if (item.link) {
          return <Link key={i} to={createPageUrl(item.link)}>{content}</Link>;
        }
        return <React.Fragment key={i}>{content}</React.Fragment>;
      })}
    </div>
  );
}