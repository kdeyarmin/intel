import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';

export default function KPICard({ title, value, subtitle, icon: Icon, iconColor, _iconBg, loading, trend }) {
  return (
    <div className="bg-[#141d30] rounded-xl border border-slate-700/50 shadow-lg shadow-black/10 hover:border-cyan-500/20 hover:shadow-cyan-500/5 transition-all duration-300 p-5">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-white uppercase tracking-widest">{title}</p>
          {loading ? (
            <Skeleton className="h-8 w-24 mt-2 bg-slate-700/50" />
          ) : (
            <>
              <p className="text-3xl font-bold text-white mt-1.5 tracking-tight">{value}</p>
              {subtitle && <p className="text-sm text-slate-300 mt-0.5">{subtitle}</p>}
              {trend && (
                <div className={`inline-flex items-center gap-1 mt-1.5 text-xs font-medium px-1.5 py-0.5 rounded-full ${
                  trend.direction === 'up' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                }`}>
                  <span>{trend.direction === 'up' ? '↑' : '↓'}</span>
                  <span>{trend.label}</span>
                </div>
              )}
            </>
          )}
        </div>
        <div className={`p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/50`}>
          <Icon className={`w-5 h-5 ${iconColor}`} />
        </div>
      </div>
    </div>
  );
}