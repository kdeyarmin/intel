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
    <nav aria-label={group.label} className="mb-4 -mt-1 overflow-x-auto">
      <ul className="flex w-max gap-1 rounded-lg bg-slate-800/50 p-1">
        {pages.map(({ page, label }) => {
          const active = page === current;
          return (
            <li key={page}>
              <Link
                to={createPageUrl(page)}
                aria-current={active ? 'page' : undefined}
                className={`block whitespace-nowrap rounded-md px-3 py-1.5 text-xs sm:text-sm font-medium transition-colors ${
                  active ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'
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
