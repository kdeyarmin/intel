import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';

export default function KPICard({ title, value, subtitle, icon: Icon, iconColor, iconBg, loading, trend }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm hover:shadow-md transition-shadow p-5">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{title}</p>
          {loading ? (
            <Skeleton className="h-8 w-24 mt-2" />
          ) : (
            <>
              <p className="text-2xl font-bold text-slate-900 mt-1 tracking-tight">{value}</p>
              {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
              {trend && (
                <div className={`inline-flex items-center gap-1 mt-1.5 text-xs font-medium px-1.5 py-0.5 rounded-full ${
                  trend.direction === 'up' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
                }`}>
                  <span>{trend.direction === 'up' ? '↑' : '↓'}</span>
                  <span>{trend.label}</span>
                </div>
              )}
            </>
          )}
        </div>
        <div className={`${iconBg} p-2.5 rounded-xl`}>
          <Icon className={`w-5 h-5 ${iconColor}`} />
        </div>
      </div>
    </div>
  );
}