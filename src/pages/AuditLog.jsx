import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { FileText, Upload, Download, Calculator } from 'lucide-react';
import PageHeader from '../components/shared/PageHeader';

export default function AuditLog() {
  const { data: events = [], isLoading } = useQuery({
    queryKey: ['auditEvents'],
    queryFn: () => base44.entities.AuditEvent.list('-created_date', 100),
  });

  const getEventIcon = (type) => {
    switch (type) {
      case 'import': return Upload;
      case 'export': return Download;
      case 'scoring_run': return Calculator;
      default: return FileText;
    }
  };

  const getEventColor = (type) => {
    switch (type) {
      case 'import': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'export': return 'bg-green-100 text-green-800 border-green-200';
      case 'scoring_run': return 'bg-purple-100 text-purple-800 border-purple-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <div className="p-8">
      <PageHeader
        title="Audit Log"
        subtitle="System activity and data operations"
        icon={FileText}
        breadcrumbs={[{ label: 'Admin' }, { label: 'Audit Log' }]}
      />

      <Card>
        <CardHeader>
          <CardTitle>Recent Events</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>Timestamp</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array(5).fill(0).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    </TableRow>
                  ))
                ) : events.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-gray-500">
                      No audit events recorded yet
                    </TableCell>
                  </TableRow>
                ) : (
                  events.map(event => {
                    const Icon = getEventIcon(event.event_type);
                    return (
                      <TableRow key={event.id}>
                        <TableCell>
                          <Badge variant="outline" className={`${getEventColor(event.event_type)} flex items-center gap-1 w-fit`}>
                            <Icon className="w-3 h-3" />
                            {event.event_type?.replace('_', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{event.user_email}</TableCell>
                        <TableCell className="text-sm font-medium">
                          {event.details?.action || '-'}
                        </TableCell>
                        <TableCell className="text-sm text-gray-600">
                          {event.details?.row_count && (
                            <span className="text-teal-600 font-semibold">
                              {event.details.row_count} rows
                            </span>
                          )}
                          {event.details?.message && (
                            <span> • {event.details.message}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-gray-500">
                          {new Date(event.created_date).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })} ET
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}