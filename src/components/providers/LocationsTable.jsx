import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MapPin, Phone, Printer } from 'lucide-react';

export default function LocationsTable({ locations = [] }) {
  if (!locations.length) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <MapPin className="w-4 h-4 text-sky-600" />
          All Practice Locations
          <Badge variant="outline" className="ml-auto text-xs">{locations.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Address</TableHead>
                <TableHead>City</TableHead>
                <TableHead>State</TableHead>
                <TableHead>ZIP</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Type</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {locations.map(loc => (
                <TableRow key={loc.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {loc.address_1 || '-'}
                      {loc.is_primary && <Badge className="bg-blue-100 text-blue-700 text-[10px]">Primary</Badge>}
                    </div>
                  </TableCell>
                  <TableCell>{loc.city || '-'}</TableCell>
                  <TableCell>{loc.state || '-'}</TableCell>
                  <TableCell className="font-mono text-xs">{loc.zip || '-'}</TableCell>
                  <TableCell>
                    <div className="space-y-0.5">
                      {loc.phone && <div className="flex items-center gap-1 text-xs"><Phone className="w-3 h-3 text-slate-400" />{loc.phone}</div>}
                      {loc.fax && <div className="flex items-center gap-1 text-xs text-slate-400"><Printer className="w-3 h-3" />{loc.fax}</div>}
                      {!loc.phone && !loc.fax && '-'}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">{loc.location_type || '-'}</Badge>
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