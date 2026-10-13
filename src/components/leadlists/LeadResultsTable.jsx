import React, { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ExternalLink, Phone } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { HIGH_INTENSITY_THRESHOLD } from '@/lib/scoringRules';
import SortableTableHead from '@/components/shared/SortableTableHead';
import { nextSort, sortRows } from '@/lib/tableSorting';

const PAGE_SIZE = 50;

// A provider can carry several taxonomy rows; prefer the primary one when flagged.
const primaryTaxonomy = (taxonomy) => (taxonomy || []).find(t => t?.is_primary) || (taxonomy || [])[0];

export default function LeadResultsTable({ results, onStatusChange }) {
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState(null);
  const pageCount = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);

  const getScoreColor = (score) => {
    if (score >= 80) return 'bg-green-900/30 text-green-400';
    if (score >= 60) return 'bg-yellow-900/30 text-yellow-400';
    return 'bg-slate-700/40 text-slate-200';
  };

  const getPatientFingerprint = (provider, utilization, taxonomy) => {
    const signals = [];
    const volume = utilization?.total_medicare_beneficiaries || 0;
    const intensity = volume > 0 ? (utilization?.total_services || 0) / volume : 0;

    if (volume >= 300) signals.push('High Volume');
    if (intensity >= HIGH_INTENSITY_THRESHOLD) signals.push('Complex Care');

    const taxonomyDesc = (primaryTaxonomy(taxonomy)?.taxonomy_description || '').toLowerCase();
    if (['psychiatry', 'psychology', 'behavioral', 'mental'].some(t => taxonomyDesc.includes(t))) {
      signals.push('Behavioral Health');
    }

    return signals.length > 0 ? signals.join(' • ') : 'Standard Practice';
  };
  const sortedResults = sort
    ? sortRows(results, sort, (result, key) => {
      const { provider, score, location, taxonomy, utilization, listMember } = result;
      const name = provider.entity_type === 'Organization'
        ? provider.organization_name
        : `${provider.first_name || ''} ${provider.last_name || ''}`.trim();
      if (key === 'name') return name;
      if (key === 'specialty') return primaryTaxonomy(taxonomy)?.taxonomy_description;
      if (key === 'location') return [location?.city, location?.state].filter(Boolean).join(', ');
      if (key === 'score') return score?.score;
      if (key === 'fingerprint') return getPatientFingerprint(provider, utilization, taxonomy);
      if (key === 'status') return listMember?.status || 'New';
      return location?.phone;
    })
    : results;
  const pageRows = sortedResults.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  return (
    <div className="border rounded-lg overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <SortableTableHead label="Provider" column="name" sort={sort} onSort={(column) => setSort((current) => nextSort(current, column))} />
            <SortableTableHead label="Specialty" column="specialty" sort={sort} onSort={(column) => setSort((current) => nextSort(current, column))} />
            <SortableTableHead label="City, state" column="location" sort={sort} onSort={(column) => setSort((current) => nextSort(current, column))} />
            <SortableTableHead label="Phone" column="phone" sort={sort} onSort={(column) => setSort((current) => nextSort(current, column))} />
            <SortableTableHead label="Score" column="score" sort={sort} onSort={(column) => setSort((current) => nextSort(current, column))} />
            <SortableTableHead label="Utilization signals" column="fingerprint" sort={sort} onSort={(column) => setSort((current) => nextSort(current, column))} />
            <SortableTableHead label="Status" column="status" sort={sort} onSort={(column) => setSort((current) => nextSort(current, column))} />
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {results.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-slate-400 py-8">
                No providers match your filters
              </TableCell>
            </TableRow>
          ) : (
            pageRows.map((result) => {
              const { provider, score, location, taxonomy, utilization, listMember } = result;
              const name = provider.entity_type === 'Organization'
                ? provider.organization_name
                : `${provider.first_name} ${provider.last_name}`;

              return (
                <TableRow key={provider.npi}>
                  <TableCell className="font-medium">
                    {provider.entity_type === 'Organization'
                      ? name
                      : `${name}${provider.credential ? ', ' + provider.credential : ''}`
                    }
                  </TableCell>
                  <TableCell className="text-sm text-slate-400">
                    {primaryTaxonomy(taxonomy)?.taxonomy_description || '-'}
                  </TableCell>
                  <TableCell className="text-sm">
                    {location ? `${location.city}, ${location.state}` : '-'}
                  </TableCell>
                  <TableCell className="text-sm">
                    {location?.phone ? (
                      <div className="flex items-center gap-1">
                        <Phone className="h-3 w-3 text-slate-400" />
                        <span>{location.phone}</span>
                      </div>
                    ) : '-'}
                  </TableCell>
                  <TableCell>
                    <Badge className={getScoreColor(score?.score || 0)}>
                      {score?.score || 0}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-slate-400">
                    {getPatientFingerprint(provider, utilization, taxonomy)}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={listMember?.status || 'New'}
                      onValueChange={(v) => onStatusChange(provider.npi, v)}
                    >
                      <SelectTrigger aria-label={`Status for ${name || provider.npi}`} className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="New">New</SelectItem>
                        <SelectItem value="Contacted">Contacted</SelectItem>
                        <SelectItem value="Qualified">Qualified</SelectItem>
                        <SelectItem value="Not a fit">Not a fit</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Button asChild variant="ghost" size="sm">
                      <Link to={createPageUrl('ProviderDetail') + '?npi=' + provider.npi} aria-label={`Open ${name || provider.npi}`}>
                        <ExternalLink className="h-4 w-4" aria-hidden="true" />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
      {pageCount > 1 && (
        <div className="flex items-center justify-between px-4 py-3 text-sm text-slate-400 border-t">
          <span>
            Showing {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, results.length)} of {results.length.toLocaleString()}
          </span>
          <div className="flex items-center gap-2">
            <span>Page {safePage + 1} of {pageCount}</span>
            <Button variant="outline" size="sm" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}