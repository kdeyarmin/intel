import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { RotateCcw } from 'lucide-react';

export default function MAInpatientFilters({ data, filters, onChange }) {
  const hospitalTypes = [...new Set(data.map(r => r.hospital_type).filter(Boolean))].sort();
  const entitlementTypes = [...new Set(data.map(r => r.entitlement_type).filter(Boolean))].sort();
  const tables = [...new Set(data.map(r => r.table_name).filter(Boolean))].sort();

  const update = (key, value) => onChange({ ...filters, [key]: value });
  const hasFilters = filters.hospital_type !== 'all' || filters.entitlement_type !== 'all' || filters.table_name !== 'all';

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="space-y-1 min-w-[160px]">
        <Label className="text-xs text-slate-500">Table</Label>
        <Select value={filters.table_name} onValueChange={v => update('table_name', v)}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tables</SelectItem>
            {tables.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {hospitalTypes.length > 0 && (
        <div className="space-y-1 min-w-[180px]">
          <Label className="text-xs text-slate-500">Hospital Type</Label>
          <Select value={filters.hospital_type} onValueChange={v => update('hospital_type', v)}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Hospital Types</SelectItem>
              {hospitalTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      {entitlementTypes.length > 0 && (
        <div className="space-y-1 min-w-[180px]">
          <Label className="text-xs text-slate-500">Entitlement Type</Label>
          <Select value={filters.entitlement_type} onValueChange={v => update('entitlement_type', v)}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Entitlement Types</SelectItem>
              {entitlementTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange({ hospital_type: 'all', entitlement_type: 'all', table_name: 'all' })}
          className="text-slate-500 h-9"
        >
          <RotateCcw className="w-3.5 h-3.5 mr-1" /> Clear
        </Button>
      )}
    </div>
  );
}