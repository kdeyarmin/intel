import { Settings } from 'lucide-react';
import PageHeader from '../components/shared/PageHeader';
import UserManagement from '../components/admin/UserManagement';

// Admin-only (roles: ['admin'] in navConfig); ProtectedRoute enforces it.
export default function AdminSettings() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      <PageHeader
        title="Admin Settings"
        subtitle="Approve new accounts, invite people, and manage roles and access"
        icon={Settings}
        breadcrumbs={[{ label: 'Admin Settings' }]}
      />
      <UserManagement />
      <section aria-labelledby="account-rules" className="rounded-lg border border-slate-700/50 bg-slate-800/30 p-4 text-sm text-slate-400 space-y-2">
        <h2 id="account-rules" className="text-slate-200 font-medium">How accounts work</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Anyone can sign up, but a new account sees nothing until an admin approves it.</li>
          <li>Users can browse and work with provider data, lead lists and campaigns. Admins can also import data, send outreach email, change settings and manage accounts.</li>
          <li>Role changes and disabling take effect within 30 seconds. Disabling or “Sign out everywhere” ends every session for that account.</li>
          <li>Reset and invite links work once. Emailed reset links expire after an hour, reset links you create here after 24 hours, and invites after 7 days.</li>
          <li>You can't change your own role or disable yourself, and the last active admin can't be demoted or disabled.</li>
        </ul>
      </section>
    </div>
  );
}
