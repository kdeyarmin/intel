import React from 'react';
import DashboardAIAssistant from '../components/dashboard/DashboardAIAssistant';
import DataSourcesFooter from '../components/compliance/DataSourcesFooter';

export default function AIAssistantPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto flex flex-col h-[calc(100vh-60px)]">
      <div className="mb-4 sm:mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">AI Assistant</h1>
        <p className="text-sm sm:text-base text-slate-300 mt-0.5">Your personal healthcare data analyst</p>
      </div>

      <div className="flex-1 min-h-0 mb-4 sm:mb-6">
        <DashboardAIAssistant isFullPage={true} />
      </div>

      <div className="mt-auto">
        <DataSourcesFooter />
      </div>
    </div>
  );
}