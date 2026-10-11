import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { createPageUrl } from '@/utils';

export default function AccessDenied() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto">
      <div className="mx-auto mt-12 max-w-md rounded-xl border border-slate-700 bg-slate-800/60 p-8 text-center">
        <ShieldAlert className="mx-auto mb-4 h-12 w-12 text-amber-400" />
        <h1 className="mb-2 text-xl font-bold text-white">Access denied</h1>
        <p className="mb-6 text-sm text-slate-400">
          This page is only available to administrators. If you need access, ask an admin to
          update your role.
        </p>
        <Link
          to={createPageUrl('Dashboard')}
          className="inline-flex items-center rounded-lg bg-cyan-700 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-800"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
