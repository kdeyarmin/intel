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
    if (!confirm('Recalculate scores for all providers? This may take a few minutes.')) return;
    
    setCalculating(true);
    try {
      const providers = await base44.entities.Provider.list();
      const utilizations = await base44.entities.CMSUtilization.list();
      const referrals = await base44.entities.CMSReferral.list();
      const currentRules = rules.filter(r => r.enabled);

      for (const provider of providers.slice(0, 50)) {
        const util = utilizations.find(u => u.npi === provider.npi);
        const ref = referrals.find(r => r.npi === provider.npi);

        let score = 0;
        const contributions = {};
        const reasons = [];

        // Medicare volume scoring
        const medicareRule = currentRules.find(r => r.rule_name === 'medicare_volume');
        if (medicareRule && util?.total_medicare_beneficiaries) {
          const medicareScore = Math.min((util.total_medicare_beneficiaries / 500) * 25, 25);
          score += medicareScore * medicareRule.weight;
          contributions.medicare_volume = medicareScore;
          if (util.total_medicare_beneficiaries >= medicareRule.threshold) {
            reasons.push(`High Medicare volume (${util.total_medicare_beneficiaries} beneficiaries)`);
          }
        }

        // Home health referrals scoring
        const hhRule = currentRules.find(r => r.rule_name === 'home_health_referrals');
        if (hhRule && ref?.home_health_referrals) {
          const hhScore = Math.min((ref.home_health_referrals / 100) * 25, 25);
          score += hhScore * hhRule.weight;
          contributions.home_health_referrals = hhScore;
          if (ref.home_health_referrals >= hhRule.threshold) {
            reasons.push(`Active home health referrer (${ref.home_health_referrals} referrals)`);
          }
        }

        // Save score
        const existingScore = await base44.entities.LeadScore.filter({ npi: provider.npi });
        if (existingScore.length > 0) {
          await base44.entities.LeadScore.update(existingScore[0].id, {
            score: Math.min(score, 100),
            score_date: new Date().toISOString(),
            reasons,
            contributions,
          });
        } else {
          await base44.entities.LeadScore.create({
            npi: provider.npi,
            score: Math.min(score, 100),
            score_date: new Date().toISOString(),
            reasons,
            contributions,
          });
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
      <div className="p-8">
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
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Scoring Rules</h1>
          <p className="text-gray-600 mt-1">Configure CareMetric Fit Score calculation</p>
        </div>
        <Button
          onClick={handleRecalculate}
          disabled={calculating}
          className="bg-teal-600 hover:bg-teal-700"
        >
          <Calculator className="w-4 h-4 mr-2" />
          {calculating ? 'Calculating...' : 'Recalculate All Scores'}
        </Button>
      </div>

      <div className="mb-6">
        <PackageSelector onApply={handleApplyPackage} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Scoring Components</CardTitle>
        </CardHeader>
        <CardContent>
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
                  <TableCell className="font-medium capitalize">
                    {rule.rule_name?.replace(/_/g, ' ')}
                  </TableCell>
                  <TableCell className="text-sm text-gray-600">
                    {rule.description || '-'}
                  </TableCell>
                  <TableCell>
                    {editingRule?.id === rule.id ? (
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        max="1"
                        value={editingRule.weight}
                        onChange={(e) => setEditingRule({
                          ...editingRule,
                          weight: parseFloat(e.target.value)
                        })}
                        className="w-20"
                      />
                    ) : (
                      <Badge variant="outline">{rule.weight}</Badge>
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
        </CardContent>
      </Card>
    </div>
  );
}