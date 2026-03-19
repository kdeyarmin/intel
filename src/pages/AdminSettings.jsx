import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '../components/shared/PageHeader';
import { Settings, Users, Shield, Mail, Key, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function AdminSettings() {
  const queryClient = useQueryClient();
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('user');
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setCurrentUser).catch(console.error);
  }, []);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['systemUsers'],
    queryFn: () => base44.asServiceRole.entities.User.list('-created_date', 100),
    enabled: currentUser?.role === 'admin'
  });

  const inviteMutation = useMutation({
    mutationFn: async ({ email, role }) => {
      await base44.users.inviteUser(email, role);
    },
    onSuccess: () => {
      toast.success('Invitation sent successfully');
      setInviteEmail('');
      setInviteRole('user');
      queryClient.invalidateQueries({ queryKey: ['systemUsers'] });
    },
    onError: (err) => {
      toast.error('Failed to invite user: ' + err.message);
    }
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ id, role }) => {
      await base44.asServiceRole.entities.User.update(id, { role });
    },
    onSuccess: () => {
      toast.success('User role updated');
      queryClient.invalidateQueries({ queryKey: ['systemUsers'] });
    },
    onError: (err) => {
      toast.error('Failed to update role: ' + err.message);
    }
  });

  const handleInvite = (e) => {
    e.preventDefault();
    if (!inviteEmail) return;
    inviteMutation.mutate({ email: inviteEmail, role: inviteRole });
  };

  if (!currentUser) {
    return (
      <div className="p-8 text-center text-slate-400">
        <Loader2 className="w-8 h-8 mx-auto animate-spin text-slate-500" />
      </div>
    );
  }

  if (currentUser.role !== 'admin') {
    return (
      <div className="p-8 text-center text-slate-400">
        <Shield className="w-12 h-12 mx-auto mb-4 text-slate-500 opacity-50" />
        <h2 className="text-xl font-bold text-white mb-2">Access Denied</h2>
        <p>You need administrator privileges to view this page.</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1200px] mx-auto space-y-6">
      <PageHeader
        title="Admin Settings"
        subtitle="Manage users, access controls, and system preferences"
        icon={Settings}
        breadcrumbs={[{ label: 'Admin Settings' }]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5 text-cyan-400" />
                User Management
              </CardTitle>
              <CardDescription>View and manage users who have access to CareMetric AI.</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
              ) : (
                <div className="space-y-4 border border-slate-700/50 rounded-lg overflow-hidden">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-800/50 text-slate-400 border-b border-slate-700/50">
                      <tr>
                        <th className="px-4 py-3 font-medium">Name</th>
                        <th className="px-4 py-3 font-medium">Email</th>
                        <th className="px-4 py-3 font-medium">Role</th>
                        <th className="px-4 py-3 font-medium">Joined</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/50">
                      {users.map(user => (
                        <tr key={user.id} className="hover:bg-slate-800/30 transition-colors">
                          <td className="px-4 py-3 text-slate-200">{user.full_name || '-'}</td>
                          <td className="px-4 py-3 text-slate-300">{user.email}</td>
                          <td className="px-4 py-3">
                            <Select 
                              value={user.role || 'user'} 
                              onValueChange={(val) => updateRoleMutation.mutate({ id: user.id, role: val })}
                              disabled={user.id === currentUser?.id || updateRoleMutation.isPending}
                            >
                              <SelectTrigger className="h-8 w-28 bg-slate-800 border-slate-700 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="admin">Admin</SelectItem>
                                <SelectItem value="user">User</SelectItem>
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="px-4 py-3 text-slate-400 text-xs">
                            {user.created_date ? new Date(user.created_date).toLocaleDateString() : '-'}
                          </td>
                        </tr>
                      ))}
                      {users.length === 0 && (
                        <tr>
                          <td colSpan="4" className="px-4 py-8 text-center text-slate-500">No users found</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="w-5 h-5 text-emerald-400" />
                Invite New User
              </CardTitle>
              <CardDescription>Send an invitation email to add a new team member.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleInvite} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-300">Email Address</label>
                  <Input 
                    type="email" 
                    placeholder="colleague@example.com" 
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    required
                    className="bg-slate-800 border-slate-700"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-300">Role</label>
                  <Select value={inviteRole} onValueChange={setInviteRole}>
                    <SelectTrigger className="bg-slate-800 border-slate-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">User (View Only)</SelectItem>
                      <SelectItem value="admin">Admin (Full Access)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button 
                  type="submit" 
                  disabled={inviteMutation.isPending || !inviteEmail} 
                  className="w-full bg-emerald-600 hover:bg-emerald-700"
                >
                  {inviteMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Mail className="w-4 h-4 mr-2" />}
                  Send Invitation
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="bg-slate-800/30 border-blue-500/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2 text-blue-400">
                <Key className="w-4 h-4" />
                Authentication Notice
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-slate-400 leading-relaxed">
                For security reasons, CareMetric AI uses modern passwordless authentication and OAuth managed securely by the platform. You do not need to create or manage passwords manually. Invited users will receive a secure link to access the system and set up their accounts.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}