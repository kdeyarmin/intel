import React, { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ArrowUpDown, Edit, Eye, UserMinus } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { Link } from 'react-router-dom';

const statusColors = {
  'New': 'bg-blue-100 text-blue-800',
  'Contacted': 'bg-yellow-100 text-yellow-800',
  'Qualified': 'bg-green-100 text-green-800',
  'Not a fit': 'bg-gray-100 text-gray-800',
};

export default function LeadListTable({ leads, onUpdateStatus, onUpdateNotes, onRemove }) {
  const [sortField, setSortField] = useState('score');
  const [sortDir, setSortDir] = useState('desc');
  const [editingNotes, setEditingNotes] = useState(null);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const sortedLeads = [...leads].sort((a, b) => {
    let aVal = a[sortField];
    let bVal = b[sortField];
    
    if (sortField === 'score') {
      aVal = a.score?.score || 0;
      bVal = b.score?.score || 0;
    } else if (sortField === 'name') {
      aVal = a.provider?.last_name || a.provider?.organization_name || '';
      bVal = b.provider?.last_name || b.provider?.organization_name || '';
    } else if (sortField === 'beneficiaries') {
      aVal = a.utilization?.total_medicare_beneficiaries || 0;
      bVal = b.utilization?.total_medicare_beneficiaries || 0;
    } else if (sortField === 'referrals') {
      aVal = a.referrals?.total_referrals || 0;
      bVal = b.referrals?.total_referrals || 0;
    }

    if (sortDir === 'asc') {
      return aVal > bVal ? 1 : -1;
    } else {
      return aVal < bVal ? 1 : -1;
    }
  });

  const SortButton = ({ field, children }) => (
    <button onClick={() => handleSort(field)} className="flex items-center gap-1 hover:text-teal-600">
      {children}
      <ArrowUpDown className="w-3 h-3" />
    </button>
  );

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead><SortButton field="score">Score</SortButton></TableHead>
          <TableHead><SortButton field="name">Name</SortButton></TableHead>
          <TableHead>Specialty</TableHead>
          <TableHead>Location</TableHead>
          <TableHead>Phone</TableHead>
          <TableHead><SortButton field="beneficiaries">Beneficiaries</SortButton></TableHead>
          <TableHead><SortButton field="referrals">Referrals</SortButton></TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sortedLeads.map(lead => (
          <TableRow key={lead.member.id}>
            <TableCell>
              <div className="text-lg font-bold text-teal-600">
                {lead.score?.score || 'N/A'}
              </div>
            </TableCell>
            <TableCell className="font-medium">
              {lead.provider?.entity_type === 'Individual'
                ? `${lead.provider.last_name}, ${lead.provider.first_name}`
                : lead.provider?.organization_name}
            </TableCell>
            <TableCell className="text-sm text-gray-600">
              {lead.taxonomy?.taxonomy_description || '-'}
            </TableCell>
            <TableCell className="text-sm">
              {lead.location ? `${lead.location.city}, ${lead.location.state}` : '-'}
            </TableCell>
            <TableCell className="text-sm">
              {lead.location?.phone || '-'}
            </TableCell>
            <TableCell>{lead.utilization?.total_medicare_beneficiaries?.toLocaleString() || 0}</TableCell>
            <TableCell>{lead.referrals?.total_referrals?.toLocaleString() || 0}</TableCell>
            <TableCell>
              <Select
                value={lead.member.status || 'New'}
                onValueChange={(value) => onUpdateStatus(lead.member.id, value)}
              >
                <SelectTrigger className="w-32">
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
              <div className="flex gap-2">
                <Link to={createPageUrl('ProviderDetail') + `?npi=${lead.provider.npi}`}>
                  <Button size="sm" variant="outline">
                    <Eye className="w-4 h-4" />
                  </Button>
                </Link>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline" onClick={() => setEditingNotes(lead)}>
                      <Edit className="w-4 h-4" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Notes</DialogTitle>
                    </DialogHeader>
                    <Textarea
                      placeholder="Add notes about this lead..."
                      defaultValue={lead.member.notes || ''}
                      rows={5}
                      onBlur={(e) => {
                        onUpdateNotes(lead.member.id, e.target.value);
                        setEditingNotes(null);
                      }}
                    />
                  </DialogContent>
                </Dialog>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}