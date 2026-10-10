import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Calculator, Save, AlertCircle, Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import PageHeader from '../components/shared/PageHeader';
import { useConfirm } from '@/components/shared/ConfirmDialog';
import { toast } from 'sonner';
import PageTabs from '@/components/layout/PageTabs';

// rule_type identifies which scoring signal a rule weights (see the score
// calculation below); threshold lives in the conditions jsonb column.
const DEFAULT_RULES = [
  { name: 'Specialty Match', rule_type: 'specialty_match', weight: 20, description: 'Family Medicine, Internal Med, NP, Geriatrics, Psychiatry' },
  { name: 'Medicare Participation', rule_type: 'medicare_participation', weight: 15, description: 'Active Medicare ordering eligibility' },
  { name: 'Patient Volume', rule_type: 'patient_volume', weight: 20, description: 'Estimated Medicare beneficiary count' },
  { name: 'Service Intensity', rule_type: 'service_intensity', weight: 15, description: 'Service-per-patient intensity indicators' },
  { name: 'Geographic Priority', rule_type: 'geographic_priority', weight: 10, description: 'Pennsylvania county location' },
  { name: 'Practice Type', rule_type: 'practice_type', weight: 10, description: 'Solo or small group practice preference' },
  { name: 'Behavioral Health Potential', rule_type: 'behavioral_health', weight: 10, description: 'Mental health referral likelihood' },
];

export default function ScoringRules() {
  const confirm = useConfirm();
  const [user, setUser] = useState(null);
  const [editingRule, setEditingRule] = useState(null);
  const [calculating, setCalculating] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    const loadUser = async () => {
      const currentUser = await base44.auth.me();
      setUser(currentUser);
    };
    loadUser();
  }, []);

  const { data: rules = [] } = useQuery({
    queryKey: ['scoringRules'],
    queryFn: async () => {
      const existing = await base44.entities.ScoringRule.list('-created_date', 200);

      if (existing.length === 0) {
        await Promise.all(DEFAULT_RULES.map(rule => base44.entities.ScoringRule.create({ ...rule, enabled: true })));
        return await base44.entities.ScoringRule.list('-created_date', 200);
      }

      // Rules seeded before the field fix were saved without name/rule_type
      // (the UI wrote rule_name/category, which aren't columns), so scoring
      // could never match a rule and every score came out 0. Repair them by
      // their description, which did persist.
      const broken = existing.filter(r => !r.rule_type);
      if (broken.length > 0) {
        await Promise.all(broken.map(r => {
          const match = DEFAULT_RULES.find(d => d.description === r.description);
          return match
            ? base44.entities.ScoringRule.update(r.id, { name: match.name, rule_type: match.rule_type })
            : null;
        }));
        return await base44.entities.ScoringRule.list('-created_date', 200);
      }

      return existing;
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ScoringRule.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scoringRules'] });
      setEditingRule(null);
    },
  });

  const handleSave = (rule) => {
    const { weight, threshold } = editingRule;
    updateMutation.mutate({
      id: rule.id,
      data: { weight, conditions: { ...(rule.conditions || {}), threshold } },
    });
  };

  const handleRecalculate = async () => {
    const ok = await confirm({
      title: 'Recalculate referral propensity scores?',
      description: 'Scores are recalculated for the 100 most recently added providers. This may take a minute.',
      confirmLabel: 'Recalculate',
    });
    if (!ok) return;
    
    setCalculating(true);
    try {
      const providers = await base44.entities.Provider.list('-created_date', 5000);
      const rawUtil = await base44.entities.ProviderServiceUtilization.list('-data_year', 5000);
      const utilizations = rawUtil.map(r => ({ ...r, year: r.data_year, total_medicare_payment: r.total_medicare_payment_amt || 0, total_medicare_beneficiaries: r.total_unique_benes || 0 }));
      const locations = await base44.entities.ProviderLocation.list('-created_date', 5000);
      const taxonomies = await base44.entities.ProviderTaxonomy.list('-created_date', 5000);
      const currentRules = rules.filter(r => r.enabled !== false);

      // Validate total weight
      const totalWeight = currentRules.reduce((sum, r) => sum + r.weight, 0);
      if (Math.abs(totalWeight - 100) > 1) {
        toast.warning(`Rule weights add up to ${totalWeight}%. Scores are most meaningful when they total 100%.`);
      }

      const batch = providers.slice(0, 100);
      for (const provider of batch) {
        const util = utilizations.find(u => u.npi === provider.npi);
        const providerLocs = locations.filter(l => l.npi === provider.npi);
        const providerTax = taxonomies.filter(t => t.npi === provider.npi);
        const primaryTax = providerTax.find(t => t.is_primary) || providerTax[0];

        const scores = {};
        const breakdown = {};
        const reasons = [];

        // 1. Specialty Match
        const targetSpecialties = ['family medicine', 'internal medicine', 'nurse practitioner', 'geriatric', 'psychiatry'];
        const taxonomyDesc = (primaryTax?.taxonomy_description || '').toLowerCase();
        const specialtyMatch = targetSpecialties.some(s => taxonomyDesc.includes(s));
        scores.specialty_match = specialtyMatch ? 100 : 40;
        if (specialtyMatch) reasons.push(`Specialty: ${primaryTax?.taxonomy_description}`);

        // 2. Medicare Participation
        scores.medicare_participation = util ? 100 : 0;
        if (util) reasons.push('Active Medicare participation');

        // 3. Patient Volume
        const volume = util?.total_medicare_beneficiaries || 0;
        scores.patient_volume = volume >= 500 ? 100 : volume >= 200 ? 75 : volume >= 50 ? 50 : volume > 0 ? 25 : 0;
        if (volume > 0) reasons.push(`${volume} Medicare beneficiaries`);

        // 4. Service Intensity
        const intensity = volume > 0 ? (util?.total_services || 0) / volume : 0;
        scores.service_intensity = intensity >= 12 ? 100 : intensity >= 8 ? 70 : intensity >= 4 ? 40 : 0;
        if (intensity >= 8) reasons.push('High service intensity');

        // 5. Geographic Priority
        const primaryLoc = providerLocs.find(l => l.is_primary) || providerLocs[0];
        const isPa = primaryLoc?.state === 'PA';
        scores.geographic_priority = isPa ? 100 : 20;
        if (isPa) reasons.push(`PA Location: ${primaryLoc?.city}`);

        // 6. Practice Type
        const locCount = providerLocs.length;
        scores.practice_type = locCount === 1 ? 100 : locCount <= 3 ? 80 : locCount <= 5 ? 60 : 30;
        if (locCount <= 3) reasons.push(`${locCount === 1 ? 'Solo' : 'Small group'} practice`);

        // 7. Behavioral Health
        const behavioralTerms = ['psychiatry', 'psychology', 'behavioral', 'mental health'];
        const isBehavioral = behavioralTerms.some(t => taxonomyDesc.includes(t));
        scores.behavioral_health = isBehavioral ? 100 : 50;
        if (isBehavioral) reasons.push('Behavioral health specialty');

        // Calculate final score
        let finalScore = 0;
        Object.keys(scores).forEach(category => {
          const rule = currentRules.find(r => r.rule_type === category);
          if (!rule) return;

          const weight = rule.weight / 100;
          const contribution = (scores[category] * weight);
          finalScore += contribution;

          breakdown[category] = {
            value: scores[category],
            weight: rule.weight,
            contribution: Math.round(contribution)
          };
        });

        finalScore = Math.round(finalScore);

        // Save score
        const existingScore = await base44.entities.LeadScore.filter({ npi: provider.npi });
        const scoreData = {
          npi: provider.npi,
          score: finalScore,
          last_calculated: new Date().toISOString(),
          // Stored in LeadScore.details (jsonb) by the entity API.
          score_date: new Date().toISOString(),
          score_breakdown: breakdown,
          reasons,
        };

        if (existingScore.length > 0) {
          await base44.entities.LeadScore.update(existingScore[0].id, scoreData);
        } else {
          await base44.entities.LeadScore.create(scoreData);
        }
      }

      // Log audit event (best-effort; never throws).
      await base44.audit.record('scoring_run', {
        action: 'Recalculate Scores',
        entity: 'LeadScore',
        row_count: batch.length,
        message: 'Scores recalculated (latest 100 providers)',
      });

      toast.success(`Scores updated for ${batch.length} providers.`);
      queryClient.invalidateQueries();
    } catch (error) {
      toast.error('Scoring failed: ' + error.message);
    } finally {
      setCalculating(false);
    }
  };

  if (!user) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 flex justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-500" />
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

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageTabs current="ScoringRules" />
      <PageHeader
        title="Scoring Configuration"
        subtitle="CareMetric Referral Propensity Score (0-100) — configure weights for each factor"
        icon={Calculator}
        breadcrumbs={[{ label: 'Admin', page: 'DataCenter' }, { label: 'Scoring Rules' }]}
      />
      <div className="mb-8 flex items-center justify-between">
        <div />
        <Button
          onClick={handleRecalculate}
          disabled={calculating}
          className="bg-teal-600 hover:bg-teal-700"
        >
          <Calculator className="w-4 h-4 mr-2" />
          {calculating ? 'Calculating...' : 'Recalculate Scores (latest 100)'}
        </Button>
      </div>

      <Card className="mb-6 bg-cyan-900/10 border-cyan-500/20">
        <CardContent className="pt-6">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-semibold text-cyan-300 mb-1">Scoring Methodology</h3>
              <p className="text-sm text-slate-300">
                Each provider receives a score based on weighted factors. Adjust weights to match your targeting strategy.
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-cyan-300">
                {rules.reduce((sum, r) => sum + (r.weight || 0), 0)}%
              </p>
              <p className="text-xs text-cyan-400/70">Total Weight</p>
            </div>
          </div>
        </CardContent>
      </Card>

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
                <TableHead>Threshold</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map(rule => (
                <TableRow key={rule.id}>
                  <TableCell className="font-medium capitalize text-slate-200">
                    {(rule.name || rule.rule_type)?.replace(/_/g, ' ')}
                  </TableCell>
                  <TableCell className="text-sm text-slate-400">
                    {rule.description || '-'}
                  </TableCell>
                  <TableCell>
                   {editingRule?.id === rule.id ? (
                     <div className="flex items-center gap-1">
                       <Input
                         type="number"
                         min="0"
                         max="100"
                         value={editingRule.weight}
                         aria-label={`Weight for ${(rule.name || rule.rule_type)?.replace(/_/g, ' ')} (%)`}
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
                  <TableCell>
                    {editingRule?.id === rule.id ? (
                      <Input
                        type="number"
                        value={editingRule.threshold}
                        aria-label={`Threshold for ${(rule.name || rule.rule_type)?.replace(/_/g, ' ')}`}
                        onChange={(e) => setEditingRule({
                          ...editingRule,
                          threshold: parseFloat(e.target.value)
                        })}
                        className="w-24"
                      />
                    ) : (
                      rule.conditions?.threshold ?? '-'
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={rule.enabled ? 'default' : 'secondary'}>
                      {rule.enabled ? 'Active' : 'Disabled'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {editingRule?.id === rule.id ? (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleSave(rule)}
                          disabled={updateMutation.isPending}
                        >
                          <Save className="w-4 h-4 mr-1" />
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
                        onClick={() => setEditingRule({ id: rule.id, weight: rule.weight, threshold: rule.conditions?.threshold ?? '' })}
                      >
                        Edit
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
