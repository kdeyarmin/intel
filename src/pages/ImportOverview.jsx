import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, CheckCircle, Clock, Database, XCircle, Search } from "lucide-react";
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
                String(b.id).toLowerCase().includes(searchQuery.toLowerCase()) ||
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
            total: filteredBatches.length,
            success: successCount,
            failed: failCount,
            avgTime: timedBatchesCount > 0 ? (totalTimeMs / timedBatchesCount / 1000).toFixed(1) : 0,
            recentErrors: recentErrors.slice(0, 50)
        };
    }, [filteredBatches]);

    if (isLoading) {
        return <div className="p-8 flex items-center justify-center h-full"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>;
    }

    return (
        <div className="max-w-7xl mx-auto p-6 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Import Overview</h1>
                    <p className="text-muted-foreground mt-1">Comprehensive overview of all data import processes and system health.</p>
                </div>
            </div>

            <div className="flex flex-wrap gap-4 items-center bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border">
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
                    <Input 
                        placeholder="Search by file name or ID..." 
                        className="pl-9" 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <Select value={importTypeFilter} onValueChange={setImportTypeFilter}>
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Import Type" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        {uniqueTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                </Select>
                <Select value={dataYearFilter} onValueChange={setDataYearFilter}>
                    <SelectTrigger className="w-[150px]">
                        <SelectValue placeholder="Data Year" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Years</SelectItem>
                        {uniqueYears.map(y => <SelectItem key={String(y)} value={String(y)}>{y}</SelectItem>)}
                    </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[150px]">
                        <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="failed">Failed</SelectItem>
                        <SelectItem value="processing">Processing</SelectItem>
                        <SelectItem value="validating">Validating</SelectItem>
                        <SelectItem value="paused">Paused</SelectItem>
                    </SelectContent>
                </Select>
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
                        <Database className="h-5 w-5 text-indigo-500" />
                        Recent Import Batches
                    </CardTitle>
                    <CardDescription>A list of import batches matching your filters.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>ID</TableHead>
                                    <TableHead>File Name</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead>Year</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Valid / Total Rows</TableHead>
                                    <TableHead>Last Run</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredBatches.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No batches found matching criteria.</TableCell>
                                    </TableRow>
                                ) : (
                                    filteredBatches.slice(0, 50).map(batch => (
                                        <TableRow key={batch.id}>
                                            <TableCell className="font-mono text-xs text-gray-500">{String(batch.id).substring(0, 8)}...</TableCell>
                                            <TableCell className="font-medium">{batch.file_name || 'N/A'}</TableCell>
                                            <TableCell><Badge variant="outline">{batch.import_type}</Badge></TableCell>
                                            <TableCell>{batch.data_year || '-'}</TableCell>
                                            <TableCell>
                                                <Badge className={
                                                    batch.status === 'completed' ? 'bg-green-100 text-green-800 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400' :
                                                    batch.status === 'failed' ? 'bg-red-100 text-red-800 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400' :
                                                    batch.status === 'processing' ? 'bg-blue-100 text-blue-800 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400' :
                                                    'bg-gray-100 text-gray-800 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-400'
                                                }>
                                                    {batch.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                {batch.valid_rows || 0} / {batch.total_rows || batch.valid_rows || 0}
                                            </TableCell>
                                            <TableCell className="whitespace-nowrap">
                                                {batch.updated_date || batch.created_date ? format(new Date(batch.updated_date || batch.created_date), 'MMM d, HH:mm') : 'N/A'}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

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