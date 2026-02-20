import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { base44 } from '@/api/base44Client';

const CATEGORIES = [
  { value: 'nppes', label: 'NPPES' },
  { value: 'cms_claims', label: 'CMS Claims' },
  { value: 'cms_enrollment', label: 'CMS Enrollment' },
  { value: 'cms_statistics', label: 'CMS Statistics' },
  { value: 'provider_data', label: 'Provider Data' },
  { value: 'other', label: 'Other' },
];

export default function BatchCategorySelector({ batch, onUpdate }) {
  const handleChange = async (value) => {
    await base44.entities.ImportBatch.update(batch.id, { category: value });
    onUpdate?.();
  };

  return (
    <Select value={batch.category || ''} onValueChange={handleChange}>
      <SelectTrigger className="h-7 w-36 text-xs bg-slate-800/50 border-slate-700 text-slate-300">
        <SelectValue placeholder="Set category" />
      </SelectTrigger>
      <SelectContent className="bg-[#141d30] border-slate-700">
        {CATEGORIES.map(c => (
          <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}