import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Activity, AlertTriangle, CheckCircle, Clock, FileDown, Database, XCircle, Search, Filter } from "lucide-react";
import { format, differenceInMilliseconds } from 'date-fns';
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function ImportOverviewPage() {
    const [searchQuery, setSearchQuery] = useState('');
    const [importTypeFilter, setImportTypeFilter] = useState('all');
    const [dataYearFilter, setDataYearFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');

    const { data: batches = [], isLoading } = useQuery({
        queryKey: ['import_batches_overview'],
        queryFn: () => base44.entities.ImportBatch.list('-created_date', 100),
    });

    const filteredBatches = useMemo(() => {
        return batches.filter(b => {
            const matchesSearch = !searchQuery || 
                b.id.toLowerCase().includes(searchQuery.toLowerCase()) || 
                (b.file_name && b.file_name.toLowerCase().includes(searchQuery.toLowerCase()));
            const matchesType = importTypeFilter === 'all' || b.import_type === importTypeFilter;
            const matchesYear = dataYearFilter === 'all' || String(b.data_year) === dataYearFilter;
            const matchesStatus = statusFilter === 'all' || b.status === statusFilter;
            return matchesSearch && matchesType && matchesYear && matchesStatus;
        });
    }, [batches, searchQuery, importTypeFilter, dataYearFilter, statusFilter]);

    const uniqueTypes = useMemo(() => [...new Set(batches.map(b => b.import_type).filter(Boolean))], [batches]);
    const uniqueYears = useMemo(() => [...new Set(batches.map(b => b.data_year).filter(Boolean))], [batches]);

    const metrics = useMemo(() => {
        if (!filteredBatches.length) return { total: 0, success: 0, failed: 0, avgTime: 0, recentErrors: [] };

        let successCount = 0;
        let failCount = 0;
        let totalTimeMs = 0;
        let timedBatchesCount = 0;
        const recentErrors = [];

        filteredBatches.forEach(batch => {
            if (batch.status === 'completed') successCount++;
            if (batch.status === 'failed') failCount++;
            
            if (batch.completed_at && batch.created_date) {
                totalTimeMs += differenceInMilliseconds(new Date(batch.completed_at), new Date(batch.created_date));
                timedBatchesCount++;
            }

            if (batch.error_samples && Array.isArray(batch.error_samples)) {
                batch.error_samples.forEach(err => {
                    recentErrors.push({
                        ...err,
                        batch_id: batch.id,
                        import_type: batch.import_type,
                        batch_date: batch.created_date
                    });
                });
            }
        });

        recentErrors.sort((a, b) => new Date(b.timestamp || b.batch_date) - new Date(a.timestamp || a.batch_date));

        return {
            total: batches.length,
            success: successCount,
            failed: failCount,
            avgTime: timedBatchesCount > 0 ? (totalTimeMs / timedBatchesCount / 1000).toFixed(1) : 0,
            recentErrors: recentErrors.slice(0, 50)
        };
    }, [batches]);

    if (isLoading) {
        return <div className="p-8 flex items-center justify-center h-full"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>;
    }

    return (
        <div className="max-w-7xl mx-auto p-6 space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Import Overview</h1>
                <p className="text-muted-foreground mt-1">Comprehensive overview of all data import processes and system health.</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Imports</CardTitle>
                        <Database className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{metrics.total}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Successful</CardTitle>
                        <CheckCircle className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-600">{metrics.success}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Failed</CardTitle>
                        <XCircle className="h-4 w-4 text-red-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-600">{metrics.failed}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Avg Processing Time</CardTitle>
                        <Clock className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{metrics.avgTime}s</div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-amber-500" />
                        Recent Import Errors
                    </CardTitle>
                    <CardDescription>Detailed logs of recent validation, API, and parsing errors across all imports.</CardDescription>
                </CardHeader>
                <CardContent>
                    {metrics.recentErrors.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">No recent errors found.</div>
                    ) : (
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Timestamp</TableHead>
                                        <TableHead>Import Type</TableHead>
                                        <TableHead>Phase</TableHead>
                                        <TableHead>Error Type</TableHead>
                                        <TableHead>Context / Details</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {metrics.recentErrors.map((err, i) => (
                                        <TableRow key={i}>
                                            <TableCell className="whitespace-nowrap">
                                                {err.timestamp ? format(new Date(err.timestamp), 'MMM d, HH:mm:ss') : 'N/A'}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline">{err.import_type}</Badge>
                                            </TableCell>
                                            <TableCell className="capitalize">{err.phase}</TableCell>
                                            <TableCell>
                                                <div className="font-medium text-red-600 dark:text-red-400">
                                                    {err.rule || err.detail?.split(':')[0] || 'Unknown'}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="text-sm">
                                                    {err.file_name && <span className="font-semibold mr-2">File: {err.file_name}</span>}
                                                    {err.sheet && <span className="font-semibold mr-2">Sheet: {err.sheet}</span>}
                                                    {err.field && <span className="font-semibold mr-2">Field: {err.field}</span>}
                                                    {err.row && <span className="text-muted-foreground mr-2">Row: {err.row}</span>}
                                                    {err.value !== undefined && <span className="text-amber-600 mr-2">Value: '{err.value}'</span>}
                                                    {err.endpoint && <span className="text-blue-600 truncate max-w-xs block">Endpoint: {err.endpoint}</span>}
                                                    {err.status_code && <span className="text-red-500 mr-2">Status: {err.status_code}</span>}
                                                    <div className="text-muted-foreground mt-1 truncate max-w-md" title={err.detail}>{err.detail}</div>
                                                    {err.response_body && <div className="text-xs text-muted-foreground mt-1 bg-gray-100 dark:bg-gray-800 p-1 rounded max-h-20 overflow-auto whitespace-pre-wrap">{err.response_body}</div>}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}