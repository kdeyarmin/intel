import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Mail, Target, Shield, Bot, BarChart3, Activity, Users, ListChecks } from 'lucide-react';
import { usePageAccess } from '@/hooks/usePageAccess';

// Shown in order until the row is full; admin-only pages are filtered out
// for regular users via the shared nav access rules.
const ACTIONS = [
  { label: 'Import Monitor', icon: Activity, page: 'ImportMonitoring', color: 'text-cyan-400 bg-cyan-900/10' },
  { label: 'Find Emails', icon: Mail, page: 'ProviderIntelligence', color: 'text-emerald-400 bg-emerald-900/10' },
  { label: 'Search Providers', icon: Users, page: 'Providers', color: 'text-blue-400 bg-blue-900/10' },
  { label: 'Build Lead List', icon: Target, page: 'LeadListBuilder', color: 'text-violet-400 bg-violet-900/10' },
  { label: 'Lead Lists', icon: ListChecks, page: 'LeadLists', color: 'text-amber-400 bg-amber-900/10' },
  { label: 'Quality Scan', icon: Shield, page: 'DataQuality', color: 'text-amber-400 bg-amber-900/10' },
  { label: 'AI Assistant', icon: Bot, page: 'AIAssistant', color: 'text-cyan-400 bg-cyan-900/10' },
  { label: 'Analytics', icon: BarChart3, page: 'AdvancedAnalytics', color: 'text-pink-400 bg-pink-900/10' },
];

const MAX_ACTIONS = 6;

export default function QuickActions() {
  const { canOpen } = usePageAccess();
  const visibleActions = ACTIONS.filter(action => canOpen(action.page)).slice(0, MAX_ACTIONS);

  return (
    <div className="grid grid-cols-2 min-[400px]:grid-cols-3 lg:grid-cols-6 gap-2">
      {visibleActions.map(action => {
        const Icon = action.icon;
        return (
          <Link
            key={action.label}
            to={createPageUrl(action.page)}
            className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-slate-700/50 bg-[#141d30] hover:border-cyan-500/30 hover:bg-cyan-900/20 transition-all group"
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
