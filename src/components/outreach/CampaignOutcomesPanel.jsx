import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Target } from 'lucide-react';

// Conversions/revenue are stored in the OutreachCampaign.metrics jsonb column
// (no schema change), preserving any other keys already present there.
export default function CampaignOutcomesPanel({ campaign }) {
  const queryClient = useQueryClient();
  const [conversions, setConversions] = useState('');
  const [revenue, setRevenue] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const m = campaign?.metrics || {};
    setConversions(m.conversions != null ? String(m.conversions) : '');
    setRevenue(m.revenue != null ? String(m.revenue) : '');
  }, [campaign?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!campaign?.id) return null;

  const save = async () => {
    setSaving(true);
    try {
      const metrics = {
        ...(campaign.metrics || {}),
        conversions: Number(conversions) || 0,
        revenue: Number(revenue) || 0,
      };
      await base44.entities.OutreachCampaign.update(campaign.id, { metrics });
      toast.success('Outcomes saved');
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    } catch (e) {
      toast.error(e?.message || 'Failed to save outcomes');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="bg-[#141d30] border-slate-700/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-base text-slate-200 flex items-center gap-2">
          <Target className="w-4 h-4 text-emerald-400" /> Business Outcomes
        </CardTitle>
        <p className="text-xs text-slate-400">Record conversions and revenue attributed to this campaign.</p>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <Label htmlFor="campaign-conversions" className="text-xs text-slate-400">Conversions</Label>
            <Input
              id="campaign-conversions"
              type="number"
              min="0"
              value={conversions}
              onChange={e => setConversions(e.target.value)}
              className="w-32"
              placeholder="0"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="campaign-revenue" className="text-xs text-slate-400">Revenue ($)</Label>
            <Input
              id="campaign-revenue"
              type="number"
              min="0"
              value={revenue}
              onChange={e => setRevenue(e.target.value)}
              className="w-40"
              placeholder="0"
            />
          </div>
          <Button onClick={save} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
            {saving ? 'Saving...' : 'Save Outcomes'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
