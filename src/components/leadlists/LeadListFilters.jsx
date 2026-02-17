import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Filter, X } from 'lucide-react';

export default function LeadListFilters({ filters, onChange, onReset }) {
  const handleChange = (field, value) => {
    onChange({ ...filters, [field]: value });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Lead Filters
          </CardTitle>
          <Button variant="outline" size="sm" onClick={onReset}>
            <X className="h-4 w-4 mr-1" />
            Reset
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>State</Label>
            <Select value={filters.state} onValueChange={(v) => handleChange('state', v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PA">Pennsylvania</SelectItem>
                <SelectItem value="all">All States</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>County</Label>
            <Input
              placeholder="e.g., Allegheny"
              value={filters.county || ''}
              onChange={(e) => handleChange('county', e.target.value)}
            />
          </div>

          <div>
            <Label>ZIP Code</Label>
            <Input
              placeholder="e.g., 15222"
              value={filters.zip || ''}
              onChange={(e) => handleChange('zip', e.target.value)}
            />
          </div>

          <div>
            <Label>Radius (miles)</Label>
            <Input
              type="number"
              placeholder="e.g., 25"
              value={filters.radius || ''}
              onChange={(e) => handleChange('radius', e.target.value)}
            />
          </div>

          <div>
            <Label>Specialty (contains)</Label>
            <Input
              placeholder="e.g., Family Medicine"
              value={filters.specialty || ''}
              onChange={(e) => handleChange('specialty', e.target.value)}
            />
          </div>

          <div>
            <Label>Min Score</Label>
            <Input
              type="number"
              min="0"
              max="100"
              placeholder="e.g., 70"
              value={filters.minScore || ''}
              onChange={(e) => handleChange('minScore', e.target.value)}
            />
          </div>

          <div>
            <Label>Max Score</Label>
            <Input
              type="number"
              min="0"
              max="100"
              placeholder="e.g., 100"
              value={filters.maxScore || ''}
              onChange={(e) => handleChange('maxScore', e.target.value)}
            />
          </div>

          <div>
            <Label>Min Patient Volume</Label>
            <Input
              type="number"
              placeholder="e.g., 100"
              value={filters.minVolume || ''}
              onChange={(e) => handleChange('minVolume', e.target.value)}
            />
          </div>
        </div>

        <div className="pt-4 border-t space-y-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="medicare">Medicare Participation Required</Label>
            <Switch
              id="medicare"
              checked={filters.requireMedicare}
              onCheckedChange={(v) => handleChange('requireMedicare', v)}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="behavioral">Behavioral Health Focus</Label>
            <Switch
              id="behavioral"
              checked={filters.behavioralHealth}
              onCheckedChange={(v) => handleChange('behavioralHealth', v)}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="geriatric">Geriatric-Heavy Practice</Label>
            <Switch
              id="geriatric"
              checked={filters.geriatricHeavy}
              onCheckedChange={(v) => handleChange('geriatricHeavy', v)}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}