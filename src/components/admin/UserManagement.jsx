import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { Check, Copy, Loader2, MoreHorizontal, Search, UserPlus, Users } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useConfirm } from '@/components/shared/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import SortableTableHead from '@/components/shared/SortableTableHead';
import { nextSort, sortRows } from '@/lib/tableSorting';

export const STATUS_META = {
  pending: { label: 'Awaiting approval', className: 'bg-amber-900/30 text-amber-400 border-amber-500/30' },
  invited: { label: 'Invited', className: 'bg-cyan-900/30 text-cyan-400 border-cyan-500/30' },
  active: { label: 'Active', className: 'bg-emerald-900/30 text-emerald-400 border-emerald-500/30' },
  disabled: { label: 'Disabled', className: 'bg-red-900/30 text-red-400 border-red-500/30' },
};

const FILTERS = [
  { key: 'pending', label: 'Awaiting approval' },
  { key: 'active', label: 'Active' },
  { key: 'invited', label: 'Invited' },
  { key: 'disabled', label: 'Disabled' },
  { key: 'all', label: 'All' },
];

const USERS_KEY = ['adminUsers'];

function formatDate(value, withTime = false) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return withTime ? d.toLocaleString() : d.toLocaleDateString();
}

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || { label: status, className: 'bg-slate-800 text-slate-300 border-slate-600' };
  return <span className={`inline-block px-2 py-0.5 rounded border text-xs ${meta.className}`}>{meta.label}</span>;
}

/** Shows a one-time reset or invite link with a copy button. */
function LinkDialog({ result, onClose }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result.link);
      setCopied(true);
    } catch {
      toast.error("Unable to copy. Select the link and copy it manually.");
    }
  };
  return (
    <Dialog open={!!result} onOpenChange={(open) => { if (!open) { setCopied(false); onClose(); } }}>
      <DialogContent className="bg-[#0f1729] border-slate-700">
        <DialogHeader>
          <DialogTitle className="text-slate-100">{result?.title}</DialogTitle>
          <DialogDescription className="text-slate-400">
            {result?.emailed ? `We emailed it to ${result?.email}. ` : `Send this to ${result?.email} yourself. `}
            It works once and expires {formatDate(result?.expires_at, true)}. It won't be shown again.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input readOnly value={result?.link || ''} aria-label="One-time link" className="bg-slate-900 border-slate-700 text-xs font-mono" onFocus={(e) => e.target.select()} />
          <Button type="button" onClick={copy} variant="outline" className="border-slate-600 shrink-0">
            {copied ? <Check className="w-4 h-4" aria-hidden="true" /> : <Copy className="w-4 h-4" aria-hidden="true" />}
            <span className="ml-1">{copied ? 'Copied' : 'Copy'}</span>
          </Button>
        </div>
        <DialogFooter>
          <Button type="button" onClick={onClose} className="bg-cyan-600 hover:bg-cyan-700">Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DisableDialog({ user, onCancel, onConfirm, busy }) {
  const [reason, setReason] = useState('');
  return (
    <Dialog open={!!user} onOpenChange={(open) => { if (!open) { setReason(''); onCancel(); } }}>
      <DialogContent className="bg-[#0f1729] border-slate-700">
        <DialogHeader>
          <DialogTitle className="text-slate-100">Disable {user?.email}?</DialogTitle>
          <DialogDescription className="text-slate-400">
            The account will be signed out immediately and remain unable to sign in until an administrator re-enables it.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="disable-reason" id="disable-reason-label" className="text-slate-300">Reason (optional, visible to admins)</Label>
          <Textarea id="disable-reason" aria-labelledby="disable-reason-label" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} className="bg-slate-900 border-slate-700" />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel} className="border-slate-600">Cancel</Button>
          <Button type="button" disabled={busy} onClick={() => onConfirm(reason)} className="bg-red-600 hover:bg-red-700 text-white">
            {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />}Disable account
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Invite roles: a member or an owner of the organization; platform admins may
// also make platform-wide admins.
const INVITE_ROLES = {
  user: { label: 'Member', body: { role: 'user', org_role: 'member' } },
  owner: { label: 'Owner', body: { role: 'user', org_role: 'owner' } },
  admin: { label: 'Platform admin', body: { role: 'admin', org_role: 'owner' } },
};

function InviteCard({ onInvited, platformAdmin, seats }) {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('user');
  const queryClient = useQueryClient();
  const seatsFull = !!seats && seats.limit > 0 && seats.used >= seats.limit;
  const invite = useMutation({
    mutationFn: () => base44.admin.users.invite({ email, full_name: fullName, ...INVITE_ROLES[role].body }),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: USERS_KEY });
      onInvited({ ...r, email: r.user.email, title: 'Invite link' });
      setEmail('');
      setFullName('');
      setRole('user');
    },
    onError: (err) => toast.error(err.message),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UserPlus className="w-5 h-5 text-emerald-400" aria-hidden="true" />
          Invite a user
        </CardTitle>
        <CardDescription>
          The user will receive a link to set a password. Invited accounts do not require approval.
          {seats && seats.limit > 0 && <> {seats.used} of {seats.limit} seats used{seatsFull && <>; <Link to="/Billing" className="text-cyan-400 hover:underline">upgrade the plan</Link> to add people</>}.</>}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => { e.preventDefault(); invite.mutate(); }} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="invite-email" id="invite-email-label" className="text-slate-300">Email</Label>
            <Input id="invite-email" aria-labelledby="invite-email-label" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="bg-slate-800 border-slate-700" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="invite-name" id="invite-name-label" className="text-slate-300">Name (optional)</Label>
            <Input id="invite-name" aria-labelledby="invite-name-label" value={fullName} onChange={(e) => setFullName(e.target.value)} className="bg-slate-800 border-slate-700" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="invite-role" className="text-slate-300">Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger id="invite-role" className="bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="user">Member</SelectItem>
                <SelectItem value="owner">Owner (manages people and billing)</SelectItem>
                {platformAdmin && <SelectItem value="admin">Platform admin</SelectItem>}
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={invite.isPending || !email || seatsFull} className="w-full bg-emerald-600 hover:bg-emerald-700">
            {invite.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" /> : <UserPlus className="w-4 h-4 mr-2" aria-hidden="true" />}
            Create invite
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default function UserManagement() {
  const { user: me } = useAuth();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState(null);
  const [linkResult, setLinkResult] = useState(null);
  const [disabling, setDisabling] = useState(null);

  const { data, isLoading, error } = useQuery({ queryKey: USERS_KEY, queryFn: () => base44.admin.users.list() });
  const users = useMemo(() => data?.users ?? [], [data]);
  const platformAdmin = !!data?.platform_admin;
  const organization = data?.organization ?? null;

  const counts = useMemo(() => {
    const c = { all: users.length };
    for (const u of users) c[u.status] = (c[u.status] || 0) + 1;
    return c;
  }, [users]);
  const activeFilter = filter ?? (counts.pending ? 'pending' : 'active');

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filteredUsers = users.filter((u) =>
      (activeFilter === 'all' || u.status === activeFilter)
      && (!q || u.email.toLowerCase().includes(q) || (u.full_name || '').toLowerCase().includes(q)));
    return sort ? sortRows(filteredUsers, sort, (user, key) => {
      if (key === 'user') return user.full_name || user.email;
      if (key === 'role') return [user.org_role || '', user.role === 'admin' ? 'platform admin' : ''].filter(Boolean).join(' ');
      return user[key];
    }) : filteredUsers;
  }, [users, activeFilter, search, sort]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: USERS_KEY });
    queryClient.invalidateQueries({ queryKey: ['pendingAccounts'] });
    queryClient.invalidateQueries({ queryKey: ['accountActivity'] });
  };

  const act = useMutation({
    mutationFn: ({ fn }) => fn(),
    onSuccess: (result, { success, onDone }) => {
      refresh();
      if (success) toast.success(typeof success === 'function' ? success(result) : success);
      onDone?.(result);
    },
    onError: (err) => toast.error(err.message),
  });
  const busy = act.isPending;

  const approve = (u) => act.mutate({
    fn: () => base44.admin.users.approve(u.id),
    success: (r) => `${u.email} approved${r?.emailed ? ' and emailed' : ''}`,
  });
  const changeRole = async (u, role) => {
    if (role === u.role) return;
    const ok = await confirm({
      title: role === 'admin' ? `Make ${u.email} a platform admin?` : `Remove platform admin access from ${u.email}?`,
      description: role === 'admin'
        ? 'Platform admins import data, run the crawler and maintenance, and manage every organization’s accounts.'
        : 'They keep their account and organization but lose the platform pages and actions. This takes effect within 30 seconds.',
      confirmLabel: role === 'admin' ? 'Make platform admin' : 'Remove platform admin',
      destructive: role !== 'admin',
    });
    if (ok) act.mutate({ fn: () => base44.admin.users.update(u.id, { role }), success: 'Role updated' });
  };
  const changeOrgRole = async (u, org_role) => {
    if (org_role === u.org_role) return;
    const ok = await confirm({
      title: org_role === 'owner' ? `Make ${u.email} an owner?` : `Make ${u.email} a member?`,
      description: org_role === 'owner'
        ? 'Owners manage the organization’s people, plan and billing, and can send outreach email.'
        : 'They keep their account but lose the owner pages and actions. This takes effect within 30 seconds.',
      confirmLabel: org_role === 'owner' ? 'Make owner' : 'Make member',
      destructive: org_role !== 'owner',
    });
    if (ok) act.mutate({ fn: () => base44.admin.users.update(u.id, { org_role }), success: 'Role updated' });
  };
  const enable = (u) => act.mutate({ fn: () => base44.admin.users.enable(u.id), success: `${u.email} enabled` });
  const resetLink = (u) => act.mutate({
    fn: () => base44.admin.users.resetLink(u.id),
    onDone: (r) => setLinkResult({ ...r, email: u.email, title: r.purpose === 'invite' ? 'New invite link' : 'Password reset link' }),
  });
  const revoke = async (u) => {
    const ok = await confirm({
      title: `Sign ${u.email} out everywhere?`,
      description: 'Every browser they are signed in on is signed out. Their password stays the same.',
      confirmLabel: 'Sign out everywhere',
      destructive: true,
    });
    if (ok) act.mutate({ fn: () => base44.admin.users.revokeSessions(u.id), success: 'Sessions ended' });
  };
  const remove = async (u) => {
    const ok = await confirm({
      title: u.status === 'invited' ? `Cancel the invite for ${u.email}?` : `Reject and delete ${u.email}?`,
      description: 'The account is removed. They can sign up again later.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (ok) act.mutate({ fn: () => base44.admin.users.remove(u.id), success: 'Account deleted' });
  };
  const disable = (reason) => act.mutate({
    fn: () => base44.admin.users.disable(disabling.id, reason),
    success: `${disabling.email} disabled`,
    onDone: () => setDisabling(null),
  });

  return (
    <div className="grid grid-cols-1 2xl:grid-cols-3 gap-6">
      <Card className="2xl:col-span-2 min-w-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="w-5 h-5 text-cyan-400" aria-hidden="true" />
            Users
          </CardTitle>
          <CardDescription>
            {/* A self-serve sign-up starts its own organization, so only a platform admin sees it here; paying approves it too. */}
            {organization ? `People in ${organization.name || 'your organization'}. ` : 'Every organization’s people. New sign-ups wait here until you approve them or they subscribe. '}
            {organization?.seats && organization.seats.limit > 0 && ` ${organization.seats.used} of ${organization.seats.limit} seats used.`}
            {data && !data.email_enabled && ' Email isn’t set up, so reset and invite links are shown here for you to pass on.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                aria-pressed={activeFilter === f.key}
                onClick={() => setFilter(f.key)}
                className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${activeFilter === f.key
                  ? 'bg-cyan-900/30 text-cyan-400 border-cyan-500/30'
                  : 'border-slate-700 text-slate-400 hover:text-slate-200'}`}
              >
                {f.label} <span className="ml-1 text-slate-400">{counts[f.key] || 0}</span>
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or email" aria-label="Search users" className="pl-9 bg-slate-800 border-slate-700" />
          </div>

          {isLoading ? (
            <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-slate-400" aria-label="Loading users" /></div>
          ) : error ? (
            <p className="text-sm text-red-400" role="alert">Unable to load users: {error.message}</p>
          ) : (
            <div className="relative border border-slate-700/50 rounded-lg overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-800/50 text-slate-400 border-b border-slate-700/50">
                  <tr>
                    <SortableTableHead label="User" column="user" sort={sort} onSort={(column) => setSort((current) => nextSort(current, column))} className="px-4 py-3 font-medium" />
                    <SortableTableHead label="Role" column="role" sort={sort} onSort={(column) => setSort((current) => nextSort(current, column))} className="px-4 py-3 font-medium" />
                    <SortableTableHead label="Status" column="status" sort={sort} onSort={(column) => setSort((current) => nextSort(current, column))} className="px-4 py-3 font-medium" />
                    <SortableTableHead label="Last sign-in" column="last_login_at" sort={sort} onSort={(column) => setSort((current) => nextSort(current, column))} className="px-4 py-3 font-medium hidden md:table-cell" />
                    <SortableTableHead label="Joined" column="created_date" sort={sort} onSort={(column) => setSort((current) => nextSort(current, column))} className="px-4 py-3 font-medium hidden lg:table-cell" />
                    <th scope="col" className="px-4 py-3 font-medium"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {shown.map((u) => {
                    const self = u.id === me?.id;
                    return (
                      <tr key={u.id} className="hover:bg-slate-800/30">
                        <td className="px-4 py-3">
                          <div className="text-slate-200">{u.full_name || '—'}{self && <span className="ml-1 text-xs text-slate-400">(you)</span>}</div>
                          <div className="text-xs text-slate-400">{u.email}</div>
                          {u.status === 'disabled' && u.disabled_reason && (
                            <div className="text-xs text-red-400/80 mt-0.5">{u.disabled_reason}</div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            {u.org_id ? (
                              <Select value={u.org_role || 'member'} onValueChange={(org_role) => changeOrgRole(u, org_role)} disabled={self || busy || u.status === 'disabled'}>
                                <SelectTrigger className="h-8 w-28 bg-slate-800 border-slate-700 text-xs" aria-label={`Organization role for ${u.email}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="member">Member</SelectItem>
                                  <SelectItem value="owner">Owner</SelectItem>
                                </SelectContent>
                              </Select>
                            ) : (
                              <span className="text-xs text-slate-400">No organization</span>
                            )}
                            {platformAdmin && (
                              <Select value={u.role || 'user'} onValueChange={(role) => changeRole(u, role)} disabled={self || busy || u.status === 'disabled'}>
                                <SelectTrigger className="h-8 w-28 bg-slate-800 border-slate-700 text-xs" aria-label={`Platform role for ${u.email}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="user">Customer</SelectItem>
                                  <SelectItem value="admin">Platform admin</SelectItem>
                                </SelectContent>
                              </Select>
                            )}
                            {platformAdmin && u.org_name && <span className="text-[11px] text-slate-400 truncate max-w-[10rem]" title={u.org_name}>{u.org_name}</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3"><StatusBadge status={u.status} /></td>
                        <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap hidden md:table-cell">{formatDate(u.last_login_at, true)}</td>
                        <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap hidden lg:table-cell">{formatDate(u.created_date)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            {u.status === 'pending' && (
                              <Button size="sm" disabled={busy} onClick={() => approve(u)} className="h-8 bg-emerald-600 hover:bg-emerald-700">Approve</Button>
                            )}
                            {u.status === 'disabled' && (
                              <Button size="sm" variant="outline" disabled={busy} onClick={() => enable(u)} className="h-8 border-slate-600 bg-transparent text-slate-200 hover:bg-slate-800">Enable</Button>
                            )}
                            {!self && (
                              <DropdownMenu modal={false}>
                                <DropdownMenuTrigger asChild>
                                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0" aria-label={`More actions for ${u.email}`}>
                                    <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  {u.status !== 'disabled' && (
                                    <DropdownMenuItem onSelect={() => resetLink(u)}>
                                      {u.status === 'invited' ? 'New invite link' : 'Password reset link'}
                                    </DropdownMenuItem>
                                  )}
                                  {u.status === 'active' && (
                                    <DropdownMenuItem onSelect={() => revoke(u)}>Sign out everywhere</DropdownMenuItem>
                                  )}
                                  {(u.status === 'active' || u.status === 'pending') && (
                                    <>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem onSelect={() => setDisabling(u)} className="text-red-400">Disable account</DropdownMenuItem>
                                    </>
                                  )}
                                  {(u.status === 'pending' || u.status === 'invited') && (
                                    <DropdownMenuItem onSelect={() => remove(u)} className="text-red-400">
                                      {u.status === 'invited' ? 'Cancel invite' : 'Reject and delete'}
                                    </DropdownMenuItem>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {shown.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                        {activeFilter === 'pending' ? 'No accounts are awaiting approval.' : 'No accounts match the current search and status filter.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-1 gap-6 content-start">
        <InviteCard onInvited={setLinkResult}  platformAdmin={platformAdmin} seats={organization?.seats} />
        <AccountActivity />
      </div>

      {/* Keyed by what they show, so a new link or a different user always
          starts fresh ("Copy", empty reason) however the last one closed. */}
      <LinkDialog key={linkResult?.link ?? 'link-none'} result={linkResult} onClose={() => setLinkResult(null)} />
      <DisableDialog key={disabling?.id ?? 'disable-none'} user={disabling} busy={busy} onCancel={() => setDisabling(null)} onConfirm={disable} />
    </div>
  );
}

const ACTIVITY_LABELS = {
  signup: 'signed up',
  login: 'signed in',
  login_failed: 'failed sign-in',
  login_blocked: 'blocked sign-in (disabled)',
  approve: 'approved',
  role_change: 'changed role',
  rename: 'renamed',
  disable: 'disabled',
  enable: 'enabled',
  invite: 'invited',
  invite_accepted: 'accepted invite',
  reset_link: 'created reset link',
  reset_requested: 'requested password reset',
  password_reset: 'reset password',
  password_change: 'changed password',
  revoke_sessions: 'signed out everywhere (admin)',
  logout_all: 'signed out everywhere',
  delete: 'deleted',
  recover_admin: 'restored admin access for',
};

function AccountActivity() {
  const { data, isLoading } = useQuery({
    queryKey: ['accountActivity'],
    queryFn: () => base44.admin.users.activity(30),
    staleTime: 30000,
  });
  const events = data?.events ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recent account activity</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Loader2 className="w-5 h-5 animate-spin text-slate-400" aria-label="Loading activity" />
        ) : events.length === 0 ? (
          <p className="text-sm text-slate-400">Nothing yet.</p>
        ) : (
          <ul className="space-y-2 text-xs">
            {events.map((e) => {
              const target = e.details?.target_email;
              const self = !target || target === e.user_email;
              return (
                <li key={e.id} className="text-slate-300">
                  <span className="text-slate-200">{e.user_email}</span>{' '}
                  {ACTIVITY_LABELS[e.action] || e.action}
                  {!self && <> <span className="text-slate-200">{target}</span></>}
                  {e.action === 'role_change' && e.details?.to && <> to {e.details.to}</>}
                  <div className="text-slate-400">{formatDate(e.created_date, true)}</div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
