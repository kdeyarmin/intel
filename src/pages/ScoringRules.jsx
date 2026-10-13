import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Calculator, Save, AlertCircle, Loader2, Clock } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import PageHeader from '../components/shared/PageHeader';
import { useConfirm } from '@/components/shared/ConfirmDialog';
import { toast } from 'sonner';
import PageTabs from '@/components/layout/PageTabs';
import { CONDITION_FIELDS, conditionList, parseList } from '@/lib/scoringRules';
import { SPECIALTY_GROUPS } from '@/lib/specialtyGroups';

// The score is computed on the server (server/lib/leadScoring.ts) for every
// individual provider located in the configured states. This page edits each
// rule's weight and, for two rules, its Conditions, and starts the job.
// Each signal's cutoffs are fixed in the server calculation, so an editable
// threshold would change nothing.

const fmtWhen = (v) => (v ? new Date(v).toLocaleString() : '—');
const fmtCount = (v) => (v == null ? '—' : Number(v).toLocaleString());
const ruleLabel = (rule) => (rule.name || rule.rule_type || '').replace(/_/g, ' ');

export default function ScoringRules() {
  const confirm = useConfirm();
  const [user, setUser] = useState(null);
  const [editingRule, setEditingRule] = useState(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    const loadUser = async () => {
      const currentUser = await base44.auth.me();
      setUser(currentUser);
    };
    loadUser();
  }, []);

  // Seeds the default rules on first use and reports the last scoring run.
  const { data: status, isLoading } = useQuery({
    queryKey: ['leadScoringStatus'],
    queryFn: async () => (await base44.functions.invoke('getLeadScoringStatus', {})).data,
    enabled: user?.role === 'admin',
    refetchInterval: (q) => (q.state.data?.job?.running ? 4000 : false),
  });
  const rules = status?.rules || [];
  const job = status?.job || {};
  const territory = status?.territory || { states: [], counties: [] };

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ScoringRule.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leadScoringStatus'] });
      setEditingRule(null);
    },
    onError: (error) => toast.error('Could not save the rule: ' + error.message),
  });

  const startEdit = (rule) => {
    const fields = CONDITION_FIELDS[rule.rule_type] || [];
    const conditions = {};
    for (const f of fields) conditions[f.key] = conditionList(rule, f.key).join(', ');
    setEditingRule({ id: rule.id, rule_type: rule.rule_type, weight: rule.weight, conditions });
  };

  const handleSave = (rule) => {
    const data = { weight: editingRule.weight };
    const fields = CONDITION_FIELDS[rule.rule_type] || [];
    if (fields.length) {
      const next = { ...(rule.conditions || {}) };
      for (const f of fields) next[f.key] = parseList(editingRule.conditions[f.key]);
      if (JSON.stringify(next) !== JSON.stringify(rule.conditions || {})) data.conditions = next;
    }
    if (!Number.isFinite(data.weight) || data.weight < 0 || data.weight > 100) {
      toast.error('The weight must be a number from 0 to 100.');
      return;
    }
    updateMutation.mutate({ id: rule.id, data });
  };

  const recalcMutation = useMutation({
    mutationFn: async () => (await base44.functions.invoke('recalculateLeadScores', {})).data,
    onSuccess: (r) => {
      if (r?.started) toast.success(`Scoring started for ${r.territory?.states?.join(', ') || 'the configured states'}. This runs in the background.`);
      else toast.info('Scoring is already running.');
      queryClient.invalidateQueries({ queryKey: ['leadScoringStatus'] });
    },
    onError: (error) => toast.error('Scoring failed to start: ' + error.message),
  });

  const handleRecalculate = async () => {
    if (territory.states.length === 0) {
      toast.error("Add at least one state to the Geographic Priority rule's conditions first.");
      return;
    }
    const ok = await confirm({
      title: 'Recalculate scores?',
      description: `Every individual provider with a practice location in ${territory.states.join(', ')} is re-scored in the background. Existing scores are replaced as each batch finishes.`,
      confirmLabel: 'Recalculate',
    });
    if (!ok) return;
    recalcMutation.mutate();
  };

  if (!user) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 flex justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (user.role !== 'admin') {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Only administrators can access scoring rules.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // The total the server actually scores with: rules the backend drops
  // (not explicitly enabled, or a non-positive weight) add nothing.
  const totalWeight = rules.filter(r => r.enabled === true && Number(r.weight) > 0).reduce((sum, r) => sum + (Number(r.weight) || 0), 0);
  const running = !!job.running || recalcMutation.isPending;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageTabs current="ScoringRules" />
      <PageHeader
        title="Scoring Configuration"
        subtitle="CareMetric Healthcare Advisors Referral Propensity Score (0-100) — configure weights for each factor"
        icon={Calculator}
        breadcrumbs={[{ label: 'Admin', page: 'DataCenter' }, { label: 'Scoring Rules' }]}
      />
      <div className="mb-8 flex items-center justify-between">
        <div />
        <Button
          onClick={handleRecalculate}
          disabled={running || isLoading}
          className="bg-teal-700 hover:bg-teal-800 text-white"
        >
          <Calculator className="w-4 h-4 mr-2" aria-hidden="true" />
          {running ? 'Scoring…' : 'Recalculate scores'}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 mb-6">
        <Card className="bg-cyan-900/10 border-cyan-500/20">
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-semibold text-cyan-300 mb-1">Scoring Methodology</h2>
                <p className="text-sm text-slate-300">
                  Each individual provider located in the scored states gets a weighted score from its NUCC specialty group,
                  the CMS Order &amp; Referring list, Medicare volume and intensity (Physician &amp; Other Practitioners by Provider),
                  location and practice size. Adjust the weights to match your targeting strategy.
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-cyan-300">{totalWeight}%</p>
                <p className="text-xs text-cyan-400/70">Total Weight</p>
              </div>
            </div>
            {Math.abs(totalWeight - 100) > 1 && (
              <p className="text-xs text-amber-400 mt-2">Weights total {totalWeight}%; scores are most meaningful when they total 100%.</p>
            )}
          </CardContent>
        </Card>
        <Card className="bg-[#141d30] border-slate-700/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-slate-200 text-base flex items-center gap-2">
              <Clock className="w-4 h-4 text-cyan-400" aria-hidden="true" />
              Last scoring run
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-300 space-y-1">
            {isLoading ? (
              <p className="text-slate-400">Loading…</p>
            ) : (
              <>
                <p>
                  Status: <Badge variant="outline" className={job.running ? 'bg-sky-900/30 text-sky-400 border-sky-500/30' : job.status === 'failed' ? 'bg-rose-900/30 text-rose-400 border-rose-500/30' : job.status === 'success' ? 'bg-emerald-900/30 text-emerald-400 border-emerald-500/30' : 'bg-slate-800 text-slate-400 border-slate-600'}>
                    {job.running ? 'Running' : job.status === 'success' ? 'Completed' : job.status === 'failed' ? 'Failed' : 'Never run'}
                  </Badge>
                  {job.running && job.progress ? <span className="text-xs text-slate-400 ml-2">{job.progress.phase === 'scoring' ? `${fmtCount(job.progress.done)} of ${fmtCount(job.progress.candidates)} providers` : `reading locations (${fmtCount(job.progress.chunk)} of ${fmtCount(job.progress.chunks)} chunks)`}</span> : null}
                </p>
                <p>Scored states: <span className="text-slate-200">{territory.states.length ? territory.states.join(', ') : 'none configured'}</span>{territory.counties.length ? ` · ${territory.counties.length} priority ${territory.counties.length === 1 ? 'county' : 'counties'}` : ''}</p>
                <p>Last completed: <span className="text-slate-200">{fmtWhen(job.last_success_at)}</span>{job.scored != null ? ` · ${fmtCount(job.scored)} of ${fmtCount(job.candidates)} candidates scored` : ''}</p>
                <p>Providers with a score: <span className="text-slate-200">{fmtCount(job.scored_total)}</span></p>
                {job.error && !job.running ? <p className="text-rose-400 text-xs">{job.error}</p> : null}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="bg-[#141d30] border-slate-700/50">
        <CardHeader>
          <CardTitle className="text-slate-200">Scoring Components</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
              <TableRow>
                <TableHead>Rule Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Weight</TableHead>
                <TableHead>Conditions</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map(rule => {
                const editing = editingRule?.id === rule.id;
                const fields = CONDITION_FIELDS[rule.rule_type] || [];
                // Matches the server (normalizeRules): only an explicitly
                // enabled rule with a positive weight scores.
                const isActive = rule.enabled === true && Number(rule.weight) > 0;
                return (
                <TableRow key={rule.id}>
                  <TableCell className="font-medium capitalize text-slate-200">
                    {ruleLabel(rule)}
                  </TableCell>
                  <TableCell className="text-sm text-slate-400">
                    {rule.description || '-'}
                  </TableCell>
                  <TableCell>
                   {editing ? (
                     <div className="flex items-center gap-1">
                       <Input
                         type="number"
                         min="0"
                         max="100"
                         value={editingRule.weight}
                         aria-label={`Weight for ${ruleLabel(rule)} (%)`}
                         onChange={(e) => setEditingRule({
                           ...editingRule,
                           weight: parseFloat(e.target.value)
                         })}
                         className="w-20"
                       />
                       <span className="text-sm text-slate-400">%</span>
                     </div>
                   ) : (
                     <Badge variant="outline">{rule.weight}%</Badge>
                   )}
                  </TableCell>
                  <TableCell className="text-sm text-slate-400">
                    {fields.length === 0 ? '—' : editing ? (
                      <div className="space-y-2 min-w-[16rem]">
                        {fields.map(f => (
                          <div key={f.key}>
                            <Input
                              type="text"
                              value={editingRule.conditions[f.key]}
                              aria-label={`${f.label} for ${ruleLabel(rule)}`}
                              placeholder={f.hint}
                              onChange={(e) => setEditingRule({ ...editingRule, conditions: { ...editingRule.conditions, [f.key]: e.target.value } })}
                            />
                            <p className="text-[11px] text-slate-400 mt-1">{f.hint}{f.key === 'groups' ? ` (${SPECIALTY_GROUPS.map(g => g.key).join(', ')})` : ''}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      fields.map(f => (
                        <div key={f.key}>
                          <span className="text-slate-300">{f.label}:</span> {conditionList(rule, f.key).length ? conditionList(rule, f.key).join(', ') : 'none'}
                        </div>
                      ))
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={isActive ? 'default' : 'secondary'}>
                      {isActive ? 'Active' : 'Disabled'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {editing ? (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleSave(rule)}
                          disabled={updateMutation.isPending}
                        >
                          <Save className="w-4 h-4 mr-1" aria-hidden="true" />
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingRule(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => startEdit(rule)}
                      >
                        Edit
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
