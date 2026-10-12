import { useCallback } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { canAccessPage, effectiveRole } from '@/components/layout/navConfig';

/**
 * Role helpers for components that link to other pages or load admin-only
 * data. Use `canOpen(page)` before rendering a link so regular users aren't
 * sent to a page that will only show "Access denied". `isAdmin` is a
 * platform admin (shared data, every organization); `isOwner` also covers
 * an organization's owners (its people, billing and campaigns).
 */
export function usePageAccess() {
  const { user } = useAuth();
  const role = effectiveRole(user);
  const canOpen = useCallback((page) => canAccessPage(page, role), [role]);
  return { role, isAdmin: role === 'admin', isOwner: role === 'admin' || role === 'owner', canOpen };
}
