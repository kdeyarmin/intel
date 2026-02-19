import React, { useState, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle, XCircle, Clock, Filter, ArrowUpDown, Eye } from 'lucide-react';
import BatchDetailDialog from './BatchDetailDialog';

const statusIcons = {
  completed: <CheckCircle className="w-4 h-4 text-green-600" />,
  failed: <XCircle className="w-4 h-4 text-red-600" />,
  processing: <Clock className="w-4 h-4 text-blue-600" />,
  validating: <Clock className="w-4 h-4 text-yellow-600" />,
};

export default function ImportHistoryPanel({ batches }) {
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortBy, setSortBy] = useState('date_desc');
  const [selectedBatch, setSelectedBatch] = useState(null);

  const filtered = useMemo(() => {
    let result = [...batches];

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter(b => b.status === statusFilter);
    }

    // Date range
    if (dateFrom) {
      const from = new Date(dateFrom);
      result = result.filter(b => new Date(b.created_date) >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      result = result.filter(b => new Date(b.created_date) <= to);
    }

    // Sort
    result.sort((a, b) => {
      if (sortBy === 'date_asc') return new Date(a.created_date) - new Date(b.created_date);
      if (sortBy === 'date_desc') return new Date(b.created_date) - new Date(a.created_date);
      if (sortBy === 'status_asc') return (a.status || '').localeCompare(b.status || '');
      if (sortBy === 'status_desc') return (b.status || '').localeCompare(a.status || '');
      return 0;
    });

    return result;
  }, [batches, statusFilter, dateFrom, dateTo, sortBy]);

  const hasFilters = statusFilter !== 'all' || dateFrom || dateTo;

  return (
    <div className="border-t px-4 py-3 bg-gray-50">
      {/* Filters Row */}
      <div className="flex flex-wrap items-end gap-3 mb-3">
        <div className="flex items-center gap-1.5">
          <Filter className="w-3.5 h-3.5 text-gray-500" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-[130px] text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="processing">Processing</SelectItem>
              <SelectItem value="validating">Validating</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1.5">
          <Input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="h-8 w-[130px] text-xs"
            placeholder="From"
          />
          <span className="text-xs text-gray-400">to</span>
          <Input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="h-8 w-[130px] text-xs"
            placeholder="To"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <ArrowUpDown className="w-3.5 h-3.5 text-gray-500" />
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date_desc">Newest First</SelectItem>
              <SelectItem value="date_asc">Oldest First</SelectItem>
              <SelectItem value="status_asc">Status A-Z</SelectItem>
              <SelectItem value="status_desc">Status Z-A</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={() => { setStatusFilter('all'); setDateFrom(''); setDateTo(''); }}
          >
            Clear
          </Button>
        )}

        <Badge variant="outline" className="ml-auto text-xs">{filtered.length} of {batches.length} runs</Badge>
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-4">
          {batches.length === 0 ? 'No import history yet' : 'No results match your filters'}
        </p>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {filtered.map((batch) => (
            <div
              key={batch.id}
              className="bg-white p-3 rounded-lg border hover:border-teal-300 transition-colors cursor-pointer"
              onClick={() => setSelectedBatch(batch)}
            >
              <div className="flex items-start justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  {statusIcons[batch.status] || statusIcons.validating}
                  <Badge
                    variant={batch.status === 'completed' ? 'default' : batch.status === 'failed' ? 'destructive' : 'outline'}
                  >
                    {batch.status}
                  </Badge>
                  {batch.dry_run && <Badge variant="outline" className="text-xs">Dry Run</Badge>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">{new Date(batch.created_date).toLocaleString()}</span>
                  <Eye className="w-3.5 h-3.5 text-gray-400" />
                </div>
              </div>
              <div className="text-sm space-y-1">
                <p className="text-gray-700 truncate">{batch.file_name}</p>
                {batch.total_rows != null && (
                  <div className="flex gap-4 text-xs text-gray-600">
                    <span>Total: {batch.total_rows}</span>
                    <span className="text-green-600">Valid: {batch.valid_rows || 0}</span>
                    <span className="text-red-600">Invalid: {batch.invalid_rows || 0}</span>
                    {batch.imported_rows != null && <span className="text-blue-600">Imported: {batch.imported_rows}</span>}
                  </div>
                )}
                {batch.error_samples && batch.error_samples.length > 0 && batch.status === 'failed' && (
                  <p className="text-xs text-red-600 truncate">
                    Error: {batch.error_samples[0]?.message}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <BatchDetailDialog
        batch={selectedBatch}
        open={!!selectedBatch}
        onOpenChange={(open) => { if (!open) setSelectedBatch(null); }}
      />
    </div>
  );
}