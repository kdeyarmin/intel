import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { ChevronRight, Home } from 'lucide-react';

/**
 * @param {{
 *   title: string;
 *   subtitle?: string;
 *   icon?: React.ComponentType<{ className?: string }>;
 *   breadcrumbs?: Array<{ label: string; page?: string }>;
 *   actions?: React.ReactNode;
 *   children?: React.ReactNode;
 * }} props
 *
 * Header actions can be passed as `actions` or as children (several pages do
 * the latter); both render in the right-hand slot.
 */
export default function PageHeader({ title, subtitle, icon: Icon, breadcrumbs, actions, children }) {
  const headerActions = actions ?? children;
  return (
    <div className="mb-6">
      {/* Breadcrumbs */}
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs text-slate-400 mb-2">
          <Link to={createPageUrl('Dashboard')} className="hover:text-cyan-400 transition-colors" aria-label="Dashboard">
            <Home className="w-3 h-3" aria-hidden="true" />
          </Link>
          {breadcrumbs.map((crumb, i) => {
            // The last crumb is the current page, whether or not it links.
            const current = i === breadcrumbs.length - 1 ? 'page' : undefined;
            return (
              <span key={i} className="flex items-center gap-1">
                <ChevronRight className="w-3 h-3 text-slate-400" aria-hidden="true" />
                {crumb.page ? (
                  <Link to={createPageUrl(crumb.page)} className="hover:text-cyan-400 transition-colors" aria-current={current}>
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="text-slate-400" aria-current={current}>{crumb.label}</span>
                )}
              </span>
            );
          })}
        </nav>
      )}

      {/* Title row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {Icon && (
            <div className="p-2 rounded-xl bg-cyan-900/10">
              <Icon className="w-5 h-5 text-cyan-400" />
            </div>
          )}
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">{title}</h1>
            {subtitle && <p className="text-sm text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {headerActions && <div className="flex flex-wrap gap-2">{headerActions}</div>}
      </div>
    </div>
  );
}
