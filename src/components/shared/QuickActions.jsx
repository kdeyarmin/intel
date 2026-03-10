import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import { Upload, Mail, Target, Shield, Bot, BarChart3 } from 'lucide-react';

import { Activity } from 'lucide-react';

const ACTIONS = [
  { label: 'Import Monitor', icon: Activity, page: 'ImportMonitoring', color: 'text-cyan-400 bg-cyan-500/10', roles: ['admin'] },
  { label: 'Import Data', icon: Upload, page: 'DataCenter', color: 'text-blue-400 bg-blue-500/10', roles: ['admin'] },
  { label: 'Find Emails', icon: Mail, page: 'EmailSearchBot', color: 'text-emerald-400 bg-emerald-500/10', roles: ['admin'] },
  { label: 'Build Lead List', icon: Target, page: 'LeadListBuilder', color: 'text-violet-400 bg-violet-500/10', roles: ['admin', 'user'] },
  { label: 'Quality Scan', icon: Shield, page: 'DataQuality', color: 'text-amber-400 bg-amber-500/10', roles: ['admin'] },
  { label: 'AI Assistant', icon: Bot, page: 'AIAssistant', color: 'text-cyan-400 bg-cyan-500/10', roles: ['admin', 'user'] },
  { label: 'Analytics', icon: BarChart3, page: 'AdvancedAnalytics', color: 'text-pink-400 bg-pink-500/10', roles: ['admin', 'user'] },
];

export default function QuickActions() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(console.error);
  }, []);

  const visibleActions = ACTIONS.filter(action => user?.role ? action.roles.includes(user.role) : false);

  return (
    <div className={`grid grid-cols-2 min-[400px]:grid-cols-3 sm:grid-cols-${Math.min(visibleActions.length, 6)} gap-2`}>
      {visibleActions.map(action => {
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