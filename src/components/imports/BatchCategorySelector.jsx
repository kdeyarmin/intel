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

export default function BatchCategorySelector({ batch }) {
  const label = CATEGORIES.find(c => c.value === batch.category)?.label || batch.category || 'Uncategorized';
  
  return (
    <div className="h-7 w-36 px-3 py-1.5 rounded-md bg-slate-800/50 border border-slate-700 text-xs text-slate-300 flex items-center">
      {label}
    </div>
  );
}