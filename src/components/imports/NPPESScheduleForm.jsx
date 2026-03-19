import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS',
  'KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY',
  'NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'
];

const COMMON_TAXONOMIES = [
  'Internal Medicine', 'Family Medicine', 'Psychiatry & Neurology', 'General Practice',
  'Nurse Practitioner', 'Physician Assistant', 'Physical Therapy', 'Occupational Therapy',
  'Speech-Language Pathology', 'Home Health', 'Hospice', 'Skilled Nursing Facility',
  'Social Worker', 'Psychology', 'Cardiology', 'Pediatrics',
];

export default function NPPESScheduleForm({ config, onChange }) {
  const update = (key, value) => {
    onChange({ ...config, [key]: value });
  };

  return (
    <div className="space-y-4 border rounded-lg p-4 bg-blue-50/50">
      <p className="text-sm font-medium text-blue-800">NPPES Search Criteria</p>

      <div className="flex items-center justify-between">
        <div>
          <Label>Crawl All 51 States</Label>
          <p className="text-xs text-gray-500">Process every state sequentially (ignores state filter below)</p>
        </div>
        <Switch
          checked={config.crawl_all_states || false}
          onCheckedChange={(v) => update('crawl_all_states', v)}
        />
      </div>

      {!config.crawl_all_states && (
        <div className="space-y-2">
          <Label>State</Label>
          <Select value={config.state || ''} onValueChange={(v) => update('state', v)}>
            <SelectTrigger>
              <SelectValue placeholder="Select a state" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All States</SelectItem>
              {US_STATES.map(s => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-2">
        <Label>Specialty / Taxonomy</Label>
        <Select value={config.taxonomy_description || ''} onValueChange={(v) => update('taxonomy_description', v)}>
          <SelectTrigger>
            <SelectValue placeholder="All specialties" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Specialties</SelectItem>
            {COMMON_TAXONOMIES.map(t => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          placeholder="Or type a custom specialty"
          value={config.custom_taxonomy || ''}
          onChange={(e) => {
            update('custom_taxonomy', e.target.value);
            if (e.target.value) update('taxonomy_description', e.target.value);
          }}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Provider Type</Label>
          <Select value={config.entity_type || ''} onValueChange={(v) => update('entity_type', v)}>
            <SelectTrigger>
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Types</SelectItem>
              <SelectItem value="NPI-1">Individual (NPI-1)</SelectItem>
              <SelectItem value="NPI-2">Organization (NPI-2)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>City (optional)</Label>
          <Input
            placeholder="e.g., Philadelphia"
            value={config.city || ''}
            onChange={(e) => update('city', e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}