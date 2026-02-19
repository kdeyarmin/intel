import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, Camera } from 'lucide-react';
import ProviderGrowthChart from '../components/analytics/ProviderGrowthChart';
import DataCompletenessChart from '../components/analytics/DataCompletenessChart';
import ImportActivityChart from '../components/analytics/ImportActivityChart';
import PredictiveAlerts from '../components/analytics/PredictiveAlerts';
import DataSourcesFooter from '../components/compliance/DataSourcesFooter';

export default function Analytics() {
  const queryClient = useQueryClient();

  const { data: metrics = [], isLoading } = useQuery({
    queryKey: ['importMetrics'],
    queryFn: () => base44.entities.ImportMetrics.list('-snapshot_date', 90),
    staleTime: 60000,
  });

  const snapshotMutation = useMutation({
    mutationFn: () => base44.functions.invoke('captureMetricsSnapshot', {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['importMetrics'] });
    },
  });

  return (
    <div className="p-8 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Analytics</h1>
          <p className="text-gray-600 mt-1">Time-series metrics, trends, and predictive quality alerts</p>
        </div>
        <Button
          onClick={() => snapshotMutation.mutate()}
          disabled={snapshotMutation.isPending}
          className="bg-teal-600 hover:bg-teal-700"
        >
          {snapshotMutation.isPending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Camera className="w-4 h-4 mr-2" />
          )}
          Capture Snapshot
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
        </div>
      ) : metrics.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <Camera className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="font-medium text-lg">No metrics snapshots yet</p>
          <p className="text-sm mt-1 mb-4">Click "Capture Snapshot" to start collecting daily metrics for trend analysis.</p>
          <Button
            onClick={() => snapshotMutation.mutate()}
            disabled={snapshotMutation.isPending}
            className="bg-teal-600 hover:bg-teal-700"
          >
            {snapshotMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Camera className="w-4 h-4 mr-2" />}
            Capture First Snapshot
          </Button>
        </div>
      ) : (
        <>
          {/* Predictive Alerts */}
          <PredictiveAlerts metrics={metrics} />

          {/* Time Series Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ProviderGrowthChart metrics={metrics} />
            <DataCompletenessChart metrics={metrics} />
          </div>

          <ImportActivityChart metrics={metrics} />

          <p className="text-xs text-gray-400 text-center">
            {metrics.length} snapshots collected • Latest: {metrics[0]?.snapshot_date || 'N/A'}
          </p>
        </>
      )}

      <DataSourcesFooter />
    </div>
  );
}