import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download } from 'lucide-react';
import { exportCSV } from '../exports/exportUtils';

const LEAD_FIELDS = [
  { key: 'npi', label: 'NPI' }, { key: 'name', label: 'Name' }, { key: 'specialty', label: 'Specialty' },
  { key: 'city', label: 'City' }, { key: 'state', label: 'State' }, { key: 'phone', label: 'Phone' },
  { key: 'score', label: 'Score' }, { key: 'beneficiaries', label: 'Beneficiaries' },
  { key: 'referrals', label: 'Referrals' }, { key: 'status', label: 'Status' }, { key: 'notes', label: 'Notes' },
];

export default function LeadListStatusExport({ leads, listName }) {
  const [statusFilter, setStatusFilter] = useState('all');

  const handleExport = () => {
    const filtered = statusFilter === 'all'
      ? leads
      : leads.filter(l => (l.member?.status || 'New') === statusFilter);

    const rows = filtered.map(l => ({
      npi: l.member?.npi || '',
      name: l.provider?.entity_type === 'Individual'
        ? `${l.provider?.first_name || ''} ${l.provider?.last_name || ''}`.trim()
        : l.provider?.organization_name || '',
      specialty: l.taxonomy?.taxonomy_description || '',
      city: l.location?.city || '',
      state: l.location?.state || '',
      phone: l.location?.phone || '',
      score: l.score?.score ?? '',
      beneficiaries: l.utilization?.total_medicare_beneficiaries ?? 0,
      referrals: l.referrals?.total_referrals ?? 0,
      status: l.member?.status || 'New',
      notes: l.member?.notes || '',
    }));

    const suffix = statusFilter !== 'all' ? `-${statusFilter.toLowerCase().replace(/\s+/g, '_')}` : '';
    const fileName = `${(listName || 'lead-list').replace(/\s+/g, '-').toLowerCase()}${suffix}-${new Date().toISOString().split('T')[0]}`;
    exportCSV(rows, LEAD_FIELDS, fileName);
  };

  const counts = {};
  leads.forEach(l => {
    const s = l.member?.status || 'New';
    counts[s] = (counts[s] || 0) + 1;
  });

  return (
    <div className="flex items-center gap-2">
      <Select value={statusFilter} onValueChange={setStatusFilter}>
        <SelectTrigger className="w-36 h-8 text-xs">
          <SelectValue placeholder="Filter status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All ({leads.length})</SelectItem>
          <SelectItem value="New">New ({counts['New'] || 0})</SelectItem>
          <SelectItem value="Contacted">Contacted ({counts['Contacted'] || 0})</SelectItem>
          <SelectItem value="Qualified">Qualified ({counts['Qualified'] || 0})</SelectItem>
          <SelectItem value="Not a fit">Not a fit ({counts['Not a fit'] || 0})</SelectItem>
        </SelectContent>
      </Select>
      <Button size="sm" variant="outline" onClick={handleExport} className="gap-1 text-xs h-8">
        <Download className="w-3 h-3" /> Export
      </Button>
    </div>
  );
}