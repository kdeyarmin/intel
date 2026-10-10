import { useCallback } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { canAccessPage } from '@/components/layout/navConfig';

/**
 * Role helpers for components that link to other pages or load admin-only
 * data. Use `canOpen(page)` before rendering a link so regular users aren't
 * sent to a page that will only show "Access denied".
 */
export function usePageAccess() {
  const { user } = useAuth();
  const role = user?.role;
  const canOpen = useCallback((page) => canAccessPage(page, role), [role]);
  return { isAdmin: role === 'admin', canOpen };
}
