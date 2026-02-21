import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { CheckCircle2, AlertTriangle, Clock, Loader2, RefreshCw, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';

export default function ReconciliationDashboard() {
  const [runningJob, setRunningJob] = useState(null);
  const [selectedSources, setSelectedSources] = useState(['nppes']);
  const [expandedId, setExpandedId] = useState(null);

  const queryClient = useQueryClient();

  const { data: jobs = [] } = useQuery({
    queryKey: ['reconciliationJobs'],
    queryFn: () => base44.entities.ReconciliationJob.list('-started_at', 20),
  });

  const { data: reconciliations = [] } = useQuery({
    queryKey: ['reconciliations'],
    queryFn: () => base44.entities.ProviderReconciliation.filter({ status: 'discrepancy' }),
  });

  const recentJob = jobs[0];

  const handleStartReconciliation = async () => {
    setRunningJob('pending');
    toast.loading('Starting reconciliation...');
    try {
      const response = await base44.functions.invoke('reconcileProviderData', {
        sources: selectedSources,
        job_type: 'manual'
      });

      toast.dismiss();
      toast.success(response.data.message);
      setRunningJob(null);
      queryClient.invalidateQueries();
    } catch (error) {
      toast.dismiss();
      toast.error('Reconciliation failed: ' + error.message);
      setRunningJob(null);
    }
  };

  const handleResolveDiscrepancy = async (reconciliationId, action) => {
    try {
      await base44.entities.ProviderReconciliation.update(reconciliationId, {
        resolution_status: action === 'accept' ? 'accepted' : 'rejected',
        resolved_at: new Date().toISOString(),
        resolved_by: (await base44.auth.me()).email,
      });
      toast.success(`Discrepancy ${action === 'accept' ? 'accepted' : 'rejected'}`);
      queryClient.invalidateQueries();
    } catch (error) {
      toast.error('Failed to update resolution');
    }
  };

  return (
    <div className="space-y-6">
      {/* Control Panel */}
      <Card>
        <CardHeader>
          <CardTitle>Start Reconciliation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-200 mb-2 block">Sources to Reconcile</label>
            <div className="flex flex-wrap gap-2">
              {['nppes', 'pecos', 'cms'].map(source => (
                <label key={source} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedSources.includes(source)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedSources([...selectedSources, source]);
                      } else {
                        setSelectedSources(selectedSources.filter(s => s !== source));
                      }
                    }}
                    className="rounded bg-slate-800 border-slate-600"
                  />
                  <span className="text-sm text-slate-300 uppercase">{source}</span>
                </label>
              ))}
            </div>
          </div>

          <Button
            onClick={handleStartReconciliation}
            disabled={runningJob || selectedSources.length === 0}
            className="w-full bg-cyan-600 hover:bg-cyan-700"
          >
            {runningJob ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Running Reconciliation...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 mr-2" />
                Start Reconciliation
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Recent Job Summary */}
      {recentJob && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Last Reconciliation Job</span>
              <Badge variant={recentJob.status === 'completed' ? 'default' : recentJob.status === 'running' ? 'outline' : 'destructive'}>
                {recentJob.status}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-slate-500">Total Providers</p>
                <p className="text-2xl font-bold text-white">{recentJob.total_providers || 0}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Matched</p>
                <p className="text-2xl font-bold text-green-400">{recentJob.matched || 0}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Discrepancies</p>
                <p className="text-2xl font-bold text-red-400">{recentJob.discrepancies_found || 0}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">AI Suggestions</p>
                <p className="text-2xl font-bold text-blue-400">{recentJob.ai_suggestions_generated || 0}</p>
              </div>
            </div>
            <p className="text-xs text-slate-400 mt-4">
              Started: {new Date(recentJob.started_at).toLocaleString()}
              {recentJob.completed_at && ` • Completed: ${new Date(recentJob.completed_at).toLocaleString()}`}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Discrepancies List */}
      {reconciliations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Active Discrepancies ({reconciliations.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {reconciliations.slice(0, 10).map(recon => (
                <div key={recon.id} className="border border-slate-700/50 rounded-lg overflow-hidden">
                  <button
                    onClick={() => setExpandedId(expandedId === recon.id ? null : recon.id)}
                    className="w-full p-4 flex items-center justify-between hover:bg-slate-800/30 transition-colors"
                  >
                    <div className="flex items-center gap-3 flex-1 text-left">
                      <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
                      <div>
                        <p className="font-medium text-slate-200">NPI {recon.npi}</p>
                        <p className="text-sm text-slate-400">{recon.discrepancies?.length || 0} field(s) differ</p>
                      </div>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${expandedId === recon.id ? 'rotate-180' : ''}`} />
                  </button>

                  {expandedId === recon.id && (
                    <div className="border-t border-slate-700/50 bg-slate-800/20 p-4 space-y-4">
                      {recon.discrepancies?.map((disc, idx) => (
                        <div key={idx} className="space-y-2">
                          <p className="font-medium text-slate-200">{disc.field}</p>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div className="bg-slate-700/30 p-2 rounded">
                              <p className="text-slate-400 text-xs mb-1">Our Record</p>
                              <p className="text-slate-200">{disc.internal_value}</p>
                            </div>
                            <div className="bg-slate-700/30 p-2 rounded">
                              <p className="text-slate-400 text-xs mb-1">External Source</p>
                              <p className="text-slate-200">{disc.external_value}</p>
                            </div>
                          </div>
                          <Badge variant="outline" className={`h-5 text-xs ${disc.severity === 'high' ? 'border-red-500/30 text-red-400' : disc.severity === 'medium' ? 'border-amber-500/30 text-amber-400' : 'border-blue-500/30 text-blue-400'}`}>
                            {disc.severity} severity
                          </Badge>
                        </div>
                      ))}

                      {recon.ai_suggestions?.length > 0 && (
                        <div className="mt-4 p-3 bg-cyan-900/20 border border-cyan-700/30 rounded">
                          <p className="text-xs font-medium text-cyan-300 mb-2">🤖 AI Suggestions</p>
                          {recon.ai_suggestions.map((sug, idx) => (
                            <p key={idx} className="text-sm text-cyan-200 mb-1">
                              <span className="font-medium">{sug.field}:</span> {sug.suggestion}
                            </p>
                          ))}
                        </div>
                      )}

                      <div className="flex gap-2 pt-2">
                        <Button
                          size="sm"
                          onClick={() => handleResolveDiscrepancy(recon.id, 'accept')}
                          className="flex-1 bg-green-600/20 text-green-400 hover:bg-green-600/30 border border-green-600/30"
                        >
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleResolveDiscrepancy(recon.id, 'reject')}
                          className="flex-1 text-slate-400 border-slate-700/50 hover:bg-slate-800/50"
                        >
                          Keep Current
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}