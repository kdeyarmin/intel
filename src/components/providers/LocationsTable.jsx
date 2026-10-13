import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { MapPin, Phone, Printer } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { telHref } from './ProviderHeader';
import SortableTableHead from '@/components/shared/SortableTableHead';
import { nextSort, sortRows } from '@/lib/tableSorting';

export default function LocationsTable({ locations = [] }) {
  const [sort, setSort] = useState(null);
  const sortedLocations = useMemo(
    () => (sort ? sortRows(locations, sort, (location, key) => location[key]) : locations),
    [locations, sort],
  );
  if (!locations.length) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <MapPin className="w-4 h-4 text-sky-400" />
          All Practice Locations
          <Badge variant="outline" className="ml-auto text-xs">{locations.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableTableHead label="Address" column="address_1" sort={sort} onSort={(column) => setSort((current) => nextSort(current, column))} />
                <SortableTableHead label="City" column="city" sort={sort} onSort={(column) => setSort((current) => nextSort(current, column))} />
                <SortableTableHead label="State" column="state" sort={sort} onSort={(column) => setSort((current) => nextSort(current, column))} />
                <SortableTableHead label="ZIP" column="zip" sort={sort} onSort={(column) => setSort((current) => nextSort(current, column))} />
                <SortableTableHead label="Phone" column="phone" sort={sort} onSort={(column) => setSort((current) => nextSort(current, column))} />
                <SortableTableHead label="Type" column="location_type" sort={sort} onSort={(column) => setSort((current) => nextSort(current, column))} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedLocations.map(loc => (
                <TableRow key={loc.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Link to={createPageUrl(`LocationDetail?id=${loc.id}`)} className="hover:text-cyan-400 hover:underline">
                        {loc.address_1 || '-'}
                      </Link>
                      {loc.is_primary && <Badge className="bg-blue-900/30 text-blue-400 text-[10px]">Primary</Badge>}
                    </div>
                  </TableCell>
                  <TableCell>{loc.city || '-'}</TableCell>
                  <TableCell>{loc.state || '-'}</TableCell>
                  <TableCell className="font-mono text-xs">{loc.zip || '-'}</TableCell>
                  <TableCell>
                    <div className="space-y-0.5">
                      {loc.phone && (
                        <a href={telHref(loc.phone)} className="flex items-center gap-1 text-xs hover:text-cyan-400 hover:underline">
                          <Phone className="w-3 h-3 text-slate-400" />{loc.phone}
                        </a>
                      )}
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