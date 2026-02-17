import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';

const US_STATES = ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'];

export default function FilterBuilder({ filters, onChange }) {
  const handleStateToggle = (state) => {
    const states = filters.states || [];
    const updated = states.includes(state)
      ? states.filter(s => s !== state)
      : [...states, state];
    onChange({ ...filters, states: updated });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Filter Criteria</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Geographic Filters */}
        <div className="space-y-3">
          <Label className="text-base font-semibold">Geography</Label>
          
          <div>
            <Label className="text-sm">States</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {US_STATES.map(state => (
                <Badge
                  key={state}
                  variant={(filters.states || []).includes(state) ? 'default' : 'outline'}
                  className="cursor-pointer"
                  onClick={() => handleStateToggle(state)}
                >
                  {state}
                </Badge>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>ZIP Code</Label>
              <Input
                placeholder="90210"
                value={filters.zip || ''}
                onChange={(e) => onChange({ ...filters, zip: e.target.value })}
              />
            </div>
            <div>
              <Label>Radius (miles)</Label>
              <Input
                type="number"
                placeholder="50"
                value={filters.radius_miles || ''}
                onChange={(e) => onChange({ ...filters, radius_miles: parseFloat(e.target.value) || 0 })}
              />
            </div>
          </div>
        </div>

        {/* Score Filters */}
        <div className="space-y-3">
          <Label className="text-base font-semibold">CareMetric Fit Score</Label>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Minimum Score</Label>
              <Input
                type="number"
                min="0"
                max="100"
                placeholder="0"
                value={filters.min_score || ''}
                onChange={(e) => onChange({ ...filters, min_score: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div>
              <Label>Maximum Score</Label>
              <Input
                type="number"
                min="0"
                max="100"
                placeholder="100"
                value={filters.max_score || ''}
                onChange={(e) => onChange({ ...filters, max_score: parseFloat(e.target.value) || 100 })}
              />
            </div>
          </div>
        </div>

        {/* Activity Filters */}
        <div className="space-y-3">
          <Label className="text-base font-semibold">Activity Thresholds</Label>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Min Medicare Beneficiaries</Label>
              <Input
                type="number"
                placeholder="100"
                value={filters.min_beneficiaries || ''}
                onChange={(e) => onChange({ ...filters, min_beneficiaries: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div>
              <Label>Min Referrals</Label>
              <Input
                type="number"
                placeholder="10"
                value={filters.min_referrals || ''}
                onChange={(e) => onChange({ ...filters, min_referrals: parseFloat(e.target.value) || 0 })}
              />
            </div>
          </div>
        </div>

        {/* Medicare Status */}
        <div className="flex items-center justify-between">
          <div>
            <Label>Medicare Active Only</Label>
            <p className="text-sm text-gray-500">Exclude deactivated providers</p>
          </div>
          <Switch
            checked={filters.medicare_active || false}
            onCheckedChange={(checked) => onChange({ ...filters, medicare_active: checked })}
          />
        </div>
      </CardContent>
    </Card>
  );
}