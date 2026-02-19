import React from 'react';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';

const CSV_COLUMNS = [
  { key: 'table_name', label: 'Table' },
  { key: 'data_year', label: 'Year' },
  { key: 'category', label: 'Category' },
  { key: 'subcategory', label: 'Subcategory' },
  { key: 'hospital_type', label: 'Hospital Type' },
  { key: 'entitlement_type', label: 'Entitlement Type' },
  { key: 'demographic_group', label: 'Demographic Group' },
  { key: 'state', label: 'State' },
  { key: 'total_discharges', label: 'Total Discharges' },
  { key: 'total_covered_days', label: 'Total Covered Days' },
  { key: 'total_stays', label: 'Total Stays' },
  { key: 'persons_served', label: 'Persons Served' },
  { key: 'avg_length_of_stay', label: 'Avg Length of Stay' },
  { key: 'covered_days_per_1000', label: 'Covered Days/1000' },
  { key: 'discharges_per_1000', label: 'Discharges/1000' },
  { key: 'total_enrollees', label: 'Total Enrollees' },
];

function escapeCsv(val) {
  if (val == null || val === '') return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export default function ExportCSVButton({ data }) {
  const handleExport = () => {
    const header = CSV_COLUMNS.map(c => c.label).join(',');
    const rows = data.map(record =>
      CSV_COLUMNS.map(c => escapeCsv(record[c.key])).join(',')
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ma_inpatient_export_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    a.remove();
  };

  return (
    <Button variant="outline" size="sm" onClick={handleExport} disabled={data.length === 0} className="gap-2">
      <Download className="w-4 h-4" />
      Export CSV
      {data.length > 0 && <span className="text-xs text-slate-400">({data.length.toLocaleString()})</span>}
    </Button>
  );
}