import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Link } from 'react-router-dom';
import { canAccessPage, effectiveRole } from '@/components/layout/navConfig';
import { useConfirm } from '@/components/shared/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { MIN_PASSWORD_LENGTH } from './AuthShell';

/** The signed-in person's own account: change password, sign out everywhere. */
export default function AccountDialog({ open, onOpenChange }) {
  const { user, logoutEverywhere } = useAuth();
  const confirm = useConfirm();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const reset = () => { setCurrent(''); setNext(''); setAgain(''); setError(''); };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (next !== again) {
      setError("The new passwords don't match.");
      return;
    }
    setSaving(true);
    try {
      await base44.auth.changePassword(current, next);
      toast.success('Password changed. Other devices were signed out.');
      reset();
      onOpenChange(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const signOutEverywhere = async () => {
    const ok = await confirm({
      title: 'Sign out on every device?',
      description: 'This signs you out here and in every other browser.',
      confirmLabel: 'Sign out everywhere',
      destructive: true,
    });
    if (!ok) return;
    try {
      await logoutEverywhere();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="bg-[#0f1729] border-slate-700">
        <DialogHeader>
          <DialogTitle className="text-slate-100">Your account</DialogTitle>
          <DialogDescription className="text-slate-400">
            Signed in as {user?.email} ({effectiveRole(user) === 'admin' ? 'platform admin' : effectiveRole(user)}{user?.orgName ? ` of ${user.orgName}` : ''}).
            {user?.orgName && canAccessPage('Billing', user) && <> <Link to="/Billing" className="text-cyan-400 hover:underline">Plan and billing</Link></>}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <h3 className="text-sm font-medium text-slate-200">Change password</h3>
          {error && <p className="text-sm text-red-400" role="alert">{error}</p>}
          <div className="space-y-1">
            <Label id="account-current-label" htmlFor="account-current" className="text-slate-300">Current password</Label>
            <Input id="account-current" aria-labelledby="account-current-label" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} className="bg-slate-900 border-slate-700" />
          </div>
          <div className="space-y-1">
            <Label id="account-new-label" htmlFor="account-new" className="text-slate-300">New password</Label>
            <Input id="account-new" aria-labelledby="account-new-label" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD_LENGTH} value={next} onChange={(e) => setNext(e.target.value)} className="bg-slate-900 border-slate-700" />
          </div>
          <div className="space-y-1">
            <Label id="account-again-label" htmlFor="account-again" className="text-slate-300">Confirm new password</Label>
            <Input id="account-again" aria-labelledby="account-again-label" type="password" autoComplete="new-password" required value={again} onChange={(e) => setAgain(e.target.value)} className="bg-slate-900 border-slate-700" />
          </div>
          <Button type="submit" disabled={saving} className="w-full bg-cyan-600 hover:bg-cyan-700">
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />}Change password
          </Button>
        </form>
        <div className="border-t border-slate-700/60 pt-4">
          <Button type="button" variant="outline" onClick={signOutEverywhere} className="w-full border-slate-600 text-slate-300">
            Sign out on every device
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
