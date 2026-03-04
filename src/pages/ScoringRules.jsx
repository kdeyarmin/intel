import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Calculator, Save, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import PackageSelector from '../components/scoring/PackageSelector';
import PageHeader from '../components/shared/PageHeader';

export default function ScoringRules() {
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

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['scoringRules'],
    queryFn: async () => {
      const existing = await base44.entities.ScoringRule.list();
      
      // Initialize default rules if none exist
      if (existing.length === 0) {
        const defaultRules = [
          { rule_name: 'Specialty Match', category: 'specialty_match', weight: 20, description: 'Family Medicine, Internal Med, NP, Geriatrics, Psychiatry' },
          { rule_name: 'Medicare Participation', category: 'medicare_participation', weight: 15, description: 'Active Medicare ordering eligibility' },
          { rule_name: 'Patient Volume', category: 'patient_volume', weight: 20, description: 'Estimated Medicare beneficiary count' },
          { rule_name: 'Part D Prescribing Signals', category: 'part_d_signals', weight: 15, description: 'Geriatric/complex care medication indicators' },
          { rule_name: 'Geographic Priority', category: 'geographic_priority', weight: 10, description: 'Pennsylvania county location' },
          { rule_name: 'Practice Type', category: 'practice_type', weight: 10, description: 'Solo or small group practice preference' },
          { rule_name: 'Behavioral Health Potential', category: 'behavioral_health', weight: 10, description: 'Mental health referral likelihood' }
        ];
        
        await Promise.all(defaultRules.map(rule => base44.entities.ScoringRule.create(rule)));
        return await base44.entities.ScoringRule.list();
      }
      
      return existing;
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ScoringRule.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['scoringRules']);
      setEditingRule(null);
    },
  });

  const handleSave = (rule) => {
    updateMutation.mutate({ id: rule.id, data: editingRule });
  };

  const handleApplyPackage = (weights) => {
    const categoryMap = {
      specialty: 'specialty',
      enrollment: 'enrollment',
      volume: 'volume',
      referrals: 'referrals',
      group_size: 'group_size',
      geography: 'geography',
    };

    rules.forEach(rule => {
      const newWeight = weights[categoryMap[rule.category]];
      if (newWeight !== undefined) {
        updateMutation.mutate({ 
          id: rule.id, 
          data: { ...rule, weight: newWeight } 
        });
      }
    });
  };

  const handleRecalculate = async () => {
    if (!confirm('Recalculate CareMetric Referral Propensity Scores for all providers? This may take several minutes.')) return;
    
    setCalculating(true);
    try {
      const providers = await base44.entities.Provider.list();
      const utilizations = await base44.entities.CMSUtilization.list();
      const referrals = await base44.entities.CMSReferral.list();
      const locations = await base44.entities.ProviderLocation.list();
      const taxonomies = await base44.entities.ProviderTaxonomy.list();
      const currentRules = rules.filter(r => r.enabled);

      // Validate total weight
      const totalWeight = currentRules.reduce((sum, r) => sum + r.weight, 0);
      if (Math.abs(totalWeight - 100) > 1) {
        alert(`Warning: Total weights = ${totalWeight}%. Recommended: 100%`);
      }

      for (const provider of providers.slice(0, 100)) {
        const util = utilizations.find(u => u.npi === provider.npi);
        const ref = referrals.find(r => r.npi === provider.npi);
        const providerLocs = locations.filter(l => l.npi === provider.npi);
        const providerTax = taxonomies.filter(t => t.npi === provider.npi);
        const primaryTax = providerTax.find(t => t.primary_flag) || providerTax[0];

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

        // 4. Part D Signals
        const intensity = volume > 0 ? (util?.total_services || 0) / volume : 0;
        scores.part_d_signals = intensity >= 12 ? 100 : intensity >= 8 ? 70 : intensity >= 4 ? 40 : 0;
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
          const rule = currentRules.find(r => r.category === category);
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

      // Log audit event
      await base44.entities.AuditEvent.create({
        event_type: 'scoring_run',
        user_email: user?.email || 'system',
        details: {
          action: 'Recalculate Scores',
          entity: 'LeadScore',
          row_count: providers.length,
          message: 'Scores recalculated',
        },
        timestamp: new Date().toISOString(),
      });

      alert('Scoring complete!');
      queryClient.invalidateQueries();
    } catch (error) {
      alert('Scoring failed: ' + error.message);
    } finally {
      setCalculating(false);
    }
  };

  if (user?.role !== 'admin') {
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
          {calculating ? 'Calculating...' : 'Recalculate All Scores'}
        </Button>
      </div>

      <Card className="mb-6 bg-cyan-500/10 border-cyan-500/20">
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
                    {rule.rule_name?.replace(/_/g, ' ')}
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
                        onChange={(e) => setEditingRule({
                          ...editingRule,
                          threshold: parseFloat(e.target.value)
                        })}
                        className="w-24"
                      />
                    ) : (
                      rule.threshold || '-'
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
                        onClick={() => setEditingRule({ ...rule, id: rule.id })}
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