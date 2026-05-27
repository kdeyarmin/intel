import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Users } from 'lucide-react';

// Individuals practicing at the same physical address(es) as an organization NPI.
// Rendered on ProviderDetail for organization-type providers.
export default function OrgAffiliatedProvidersCard({ npi, locations = [], allProviders = [], allLocations = [] }) {
  const affiliatedNPIs = useMemo(() => {
    if (!locations.length || !allLocations.length) return [];
    // Skip blank addresses so an org without a usable address doesn't match
    // every other blank-address record.
    const orgAddresses = new Set(
      locations.filter(l => l.address_1).map(l => `${l.address_1}|${l.city}|${l.state}`),
    );
    if (orgAddresses.size === 0) return [];
    const npis = new Set();
    allLocations.forEach(l => {
      const key = `${l.address_1}|${l.city}|${l.state}`;
      if (orgAddresses.has(key) && l.npi !== npi) npis.add(l.npi);
    });
    return [...npis];
  }, [locations, allLocations, npi]);

  const affiliatedProviders = allProviders.filter(p => affiliatedNPIs.includes(p.npi) && p.entity_type === 'Individual');

  if (affiliatedProviders.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="w-4 h-4 text-indigo-400" />
          Affiliated Providers
          <Badge variant="outline" className="ml-auto text-xs">{affiliatedProviders.length}</Badge>
        </CardTitle>
        <p className="text-[11px] text-slate-500">Individual providers practicing at this organization&apos;s address(es)</p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>NPI</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Credential</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {affiliatedProviders.slice(0, 50).map(p => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs">{p.npi}</TableCell>
                  <TableCell className="font-medium">{p.last_name}, {p.first_name}</TableCell>
                  <TableCell>{p.credential || '-'}</TableCell>
                  <TableCell><Badge className={p.status === 'Active' ? 'bg-emerald-900/20 text-emerald-400' : 'bg-red-900/20 text-red-400'}>{p.status}</Badge></TableCell>
                  <TableCell>
                    <Link to={createPageUrl(`ProviderDetail?npi=${p.npi}`)}>
                      <Button variant="outline" size="sm" className="text-xs h-7">View</Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
