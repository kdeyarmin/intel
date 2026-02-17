import React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ExternalLink, Phone } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function LeadResultsTable({ results, onStatusChange }) {
  const navigate = useNavigate();

  const getScoreColor = (score) => {
    if (score >= 80) return 'bg-green-100 text-green-800';
    if (score >= 60) return 'bg-yellow-100 text-yellow-800';
    return 'bg-gray-100 text-gray-800';
  };

  const getPatientFingerprint = (provider, utilization, taxonomy) => {
    const signals = [];
    const volume = utilization?.total_medicare_beneficiaries || 0;
    const intensity = volume > 0 ? (utilization?.total_services || 0) / volume : 0;

    if (volume >= 300) signals.push('High Volume');
    if (intensity >= 10) signals.push('Complex Care');
    
    const taxonomyDesc = (taxonomy?.[0]?.taxonomy_description || '').toLowerCase();
    if (['psychiatry', 'psychology', 'behavioral', 'mental'].some(t => taxonomyDesc.includes(t))) {
      signals.push('Behavioral Health');
    }

    return signals.length > 0 ? signals.join(' • ') : 'Standard Practice';
  };

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Provider Name</TableHead>
            <TableHead>Specialty</TableHead>
            <TableHead>City, ST</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>Score</TableHead>
            <TableHead>Patient Fingerprint</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {results.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-gray-500 py-8">
                No providers match your filters
              </TableCell>
            </TableRow>
          ) : (
            results.map((result) => {
              const { provider, score, location, taxonomy, utilization, listMember } = result;
              
              return (
                <TableRow key={provider.npi}>
                  <TableCell className="font-medium">
                    {provider.entity_type === 'Organization' 
                      ? provider.organization_name 
                      : `${provider.first_name} ${provider.last_name}${provider.credential ? ', ' + provider.credential : ''}`
                    }
                  </TableCell>
                  <TableCell className="text-sm text-gray-600">
                    {taxonomy?.[0]?.taxonomy_description || '-'}
                  </TableCell>
                  <TableCell className="text-sm">
                    {location ? `${location.city}, ${location.state}` : '-'}
                  </TableCell>
                  <TableCell className="text-sm">
                    {location?.phone ? (
                      <div className="flex items-center gap-1">
                        <Phone className="h-3 w-3 text-gray-400" />
                        <span>{location.phone}</span>
                      </div>
                    ) : '-'}
                  </TableCell>
                  <TableCell>
                    <Badge className={getScoreColor(score?.score || 0)}>
                      {score?.score || 0}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-gray-600">
                    {getPatientFingerprint(provider, utilization, taxonomy)}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={listMember?.status || 'New'}
                      onValueChange={(v) => onStatusChange(provider.npi, v)}
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
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate(createPageUrl('ProviderDetail') + '?npi=' + provider.npi)}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}