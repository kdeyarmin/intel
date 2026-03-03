import React from 'react';
import ReconciliationDashboardComponent from '../components/reconciliation/ReconciliationDashboard';

export default function ReconciliationDashboardPage() {
  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Provider Data Reconciliation</h1>
        <p className="text-slate-500 mt-2">Manage provider data synchronization, review discrepancies, and merge external data.</p>
      </div>
      <ReconciliationDashboardComponent />
    </div>
  );
}