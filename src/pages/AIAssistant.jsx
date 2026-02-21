import React from 'react';
import DashboardAIAssistant from '../components/dashboard/DashboardAIAssistant';
import DataSourcesFooter from '../components/compliance/DataSourcesFooter';

export default function AIAssistantPage() {
  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto flex flex-col h-[calc(100vh-60px)]">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-white tracking-tight">AI Assistant</h1>
        <p className="text-base text-slate-300 mt-0.5">Your personal healthcare data analyst</p>
      </div>

      <div className="flex-1 min-h-0 mb-6">
        <DashboardAIAssistant isFullPage={true} />
      </div>

      <div className="mt-auto">
        <DataSourcesFooter />
      </div>
    </div>
  );
}