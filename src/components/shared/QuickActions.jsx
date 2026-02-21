import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Upload, Mail, Target, Shield, Bot, BarChart3 } from 'lucide-react';

const ACTIONS = [
  { label: 'Import Data', icon: Upload, page: 'DataCenter', color: 'text-blue-400 bg-blue-500/10' },
  { label: 'Find Emails', icon: Mail, page: 'EmailSearchBot', color: 'text-emerald-400 bg-emerald-500/10' },
  { label: 'Build Lead List', icon: Target, page: 'LeadListBuilder', color: 'text-violet-400 bg-violet-500/10' },
  { label: 'Quality Scan', icon: Shield, page: 'DataQuality', color: 'text-amber-400 bg-amber-500/10' },
  { label: 'AI Assistant', icon: Bot, page: 'AIAssistant', color: 'text-cyan-400 bg-cyan-500/10' },
  { label: 'Analytics', icon: BarChart3, page: 'AdvancedAnalytics', color: 'text-pink-400 bg-pink-500/10' },
];

export default function QuickActions() {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
      {ACTIONS.map(action => {
        const Icon = action.icon;
        return (
          <Link
            key={action.label}
            to={createPageUrl(action.page)}
            className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-slate-700/50 bg-[#141d30] hover:border-cyan-500/30 hover:bg-cyan-500/5 transition-all group"
          >
            <div className={`p-2 rounded-lg ${action.color} group-hover:scale-110 transition-transform`}>
              <Icon className="w-4 h-4" />
            </div>
            <span className="text-[11px] text-slate-400 group-hover:text-slate-200 text-center leading-tight">{action.label}</span>
          </Link>
        );
      })}
    </div>
  );
}