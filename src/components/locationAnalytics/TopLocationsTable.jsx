import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default function TopLocationsTable({ locations }) {
  return (
    <Card className="bg-gray-100">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Top Locations by Provider Density</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>City</TableHead>
                <TableHead>State</TableHead>
                <TableHead className="text-right">Providers</TableHead>
                <TableHead className="text-right">Locations</TableHead>
                <TableHead className="text-right">Total Referrals</TableHead>
                <TableHead className="text-right">Avg Beneficiaries</TableHead>
                <TableHead>Density</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {locations.slice(0, 15).map((loc, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{loc.city || '-'}</TableCell>
                  <TableCell>{loc.state || '-'}</TableCell>
                  <TableCell className="text-right">{loc.providerCount}</TableCell>
                  <TableCell className="text-right">{loc.locationCount}</TableCell>
                  <TableCell className="text-right">{(loc.totalReferrals || 0).toLocaleString()}</TableCell>
                  <TableCell className="text-right">{(loc.avgBeneficiaries || 0).toLocaleString()}</TableCell>
                  <TableCell>
                    <Badge className={
                      loc.providerCount >= 10 ? 'bg-green-100 text-green-700' :
                      loc.providerCount >= 5 ? 'bg-yellow-100 text-yellow-700' :
                      'bg-gray-200 text-gray-600'
                    }>
                      {loc.providerCount >= 10 ? 'High' : loc.providerCount >= 5 ? 'Medium' : 'Low'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {locations.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-gray-400">No location data</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}