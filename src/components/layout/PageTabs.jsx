import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useOptionalAuth } from '@/lib/AuthContext';
import { canAccessPage, getPageGroup } from './navConfig';

/**
 * Switches between pages that share one sidebar entry (PAGE_GROUPS in
 * navConfig). Each tab is a link to its own page, so URLs, Back and
 * bookmarks behave as before; tabs the user can't open are left out.
 */
export default function PageTabs({ current }) {
  const user = useOptionalAuth()?.user;
  const group = getPageGroup(current);
  if (!group) return null;
  const pages = group.pages.filter(({ page }) => canAccessPage(page, user));
  if (pages.length < 2) return null;
  return (
    <nav aria-label={group.label} className="mb-6 -mt-1 overflow-x-auto">
      <ul className="flex w-max gap-1 rounded-lg border border-slate-700/50 bg-slate-900/60 p-1">
        {pages.map(({ page, label }) => {
          const active = page === current;
          return (
            <li key={page}>
              <Link
                to={createPageUrl(page)}
                aria-current={active ? 'page' : undefined}
                className={`block whitespace-nowrap rounded-md px-4 py-2 text-xs sm:text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  active ? 'bg-slate-700/80 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
