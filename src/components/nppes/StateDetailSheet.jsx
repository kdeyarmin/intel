import React from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, AlertTriangle, CheckCircle2, XCircle, Clock, Database, History } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import StateBatchHistory from './StateBatchHistory';

export default function StateDetailSheet({ stateCode, isOpen, onClose }) {
  const { data: batch, isLoading: batchLoading } = useQuery({
    queryKey: ['stateBatch', stateCode],
    queryFn: async () => {
      if (!stateCode) return null;
      const batches = await base44.entities.ImportBatch.filter({ import_type: 'nppes_registry' }, '-created_date', 100);
      return batches.find(b => 
        (b.file_url?.includes(`- ${stateCode}`) || b.file_name?.includes(`crawler_${stateCode}_`)) &&
        !['cancelled'].includes(b.status)
      ) || null;
    },
    enabled: !!stateCode && isOpen,
    refetchInterval: (data) => (data && data.status === 'processing' ? 2000 : false),
  });

  const { data: errors, isLoading: errorsLoading } = useQuery({
    queryKey: ['stateErrors', batch?.id],
    queryFn: async () => {
      if (!batch?.id) return [];
      return await base44.entities.ErrorReport.filter({ source: batch.id }, '-timestamp', 50);
    },
    enabled: !!batch?.id && isOpen,
  });

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return 'text-green-700 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-950/40 dark:border-green-800';
      case 'failed': return 'text-red-700 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-950/40 dark:border-red-800';
      case 'processing': return 'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950/40 dark:border-amber-800';
      default: return 'text-slate-700 bg-slate-100 border-slate-200 dark:text-slate-400 dark:bg-slate-800/40 dark:border-slate-700';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed': return <CheckCircle2 className="w-5 h-5" />;
      case 'failed': return <XCircle className="w-5 h-5" />;
      case 'processing': return <Loader2 className="w-5 h-5 animate-spin" />;
      default: return <Clock className="w-5 h-5" />;
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-[420px] sm:w-[560px] overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle className="flex items-center gap-3 text-2xl">
            <Badge variant="outline" className="text-xl px-3 py-1">{stateCode}</Badge>
            Crawler Details
          </SheetTitle>
          <SheetDescription>
            Status, metrics, and full batch history for {stateCode}.
          </SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="current" className="w-full">
          <TabsList className="w-full grid grid-cols-2 mb-4">
            <TabsTrigger value="current">Current Run</TabsTrigger>
            <TabsTrigger value="history" className="gap-1.5">
              <History className="w-3.5 h-3.5" />
              Batch History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="current">
            {batchLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-slate-500" />
              </div>
            ) : !batch ? (
              <div className="text-center py-12 text-slate-500 bg-slate-800/30 rounded-lg border border-dashed border-slate-700">
                <Database className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No crawl data found for {stateCode}</p>
                <p className="text-xs mt-1">Has this state been crawled yet?</p>
              </div>
            ) : (
              <div className="space-y-5">
                <Card className={getStatusColor(batch.status)}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {getStatusIcon(batch.status)}
                      <div>
                        <div className="font-semibold capitalize">{batch.status}</div>
                        <div className="text-xs opacity-80">
                          {batch.completed_at 
                            ? `Ended ${new Date(batch.completed_at).toLocaleString()}`
                            : `Started ${new Date(batch.created_date).toLocaleString()}`}
                        </div>
                      </div>
                    </div>
                    {batch.status === 'processing' && (
                      <Badge className="animate-pulse bg-amber-600">Live</Badge>
                    )}
                  </CardContent>
                </Card>

                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Total Fetched', value: batch.total_rows, color: 'text-slate-900 dark:text-slate-100' },
                    { label: 'Imported', value: batch.imported_rows, color: 'text-green-600 dark:text-green-400' },
                    { label: 'Updated', value: batch.updated_rows, color: 'text-blue-600 dark:text-blue-400' },
                    { label: 'Skipped', value: batch.skipped_rows, color: 'text-slate-600 dark:text-slate-400' },
                  ].map(item => (
                    <div key={item.label} className="p-3 bg-white dark:bg-slate-800/30 rounded-lg border border-slate-200 dark:border-slate-700/50 shadow-sm">
                      <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{item.label}</div>
                      <div className={`text-2xl font-bold ${item.color}`}>
                        {item.value?.toLocaleString() || '—'}
                      </div>
                    </div>
                  ))}
                </div>

                {batch.api_requests_count > 0 && (
                  <div className="flex items-center justify-between text-xs text-slate-500 px-1">
                    <span>{batch.api_requests_count} API requests</span>
                    {batch.rate_limit_count > 0 && (
                      <span className="text-amber-500">{batch.rate_limit_count} rate limits hit</span>
                    )}
                  </div>
                )}

                {batch.status === 'processing' && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>Processing...</span>
                      <span>{batch.total_rows || '?'} rows</span>
                    </div>
                    <Progress value={100} className="h-1 animate-pulse" />
                  </div>
                )}

                <div className="space-y-3">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-500" />
                    Errors
                    {errors?.length > 0 && <Badge variant="destructive" className="ml-auto text-xs h-5">{errors.length}</Badge>}
                  </h3>
                  
                  <ScrollArea className="h-[200px] rounded-md border border-slate-700/50 bg-slate-800/20 p-3">
                    {errorsLoading ? (
                      <div className="space-y-3">
                        {[1,2,3].map(i => <div key={i} className="h-12 bg-slate-700/30 animate-pulse rounded" />)}
                      </div>
                    ) : errors?.length > 0 ? (
                      <div className="space-y-2">
                        {errors.map((err) => (
                          <div key={err.id} className="bg-slate-800/50 p-2.5 rounded border border-slate-700/50 space-y-1">
                            <div className="flex items-start justify-between gap-2">
                              <div className="font-medium text-xs text-red-400">{err.title || 'Error'}</div>
                              <div className="text-[10px] text-slate-500 whitespace-nowrap">
                                {new Date(err.timestamp).toLocaleTimeString()}
                              </div>
                            </div>
                            <p className="text-[11px] text-slate-400 line-clamp-2">{err.description}</p>
                          </div>
                        ))}
                      </div>
                    ) : batch.error_samples?.length > 0 ? (
                      <div className="space-y-2">
                        {batch.error_samples.map((err, idx) => (
                          <div key={idx} className="bg-slate-800/50 p-2.5 rounded border border-slate-700/50">
                            <div className="font-medium text-xs text-red-400">Batch Error</div>
                            <p className="text-[11px] text-slate-400">{err.message || JSON.stringify(err)}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full text-slate-500 text-sm">
                        <CheckCircle2 className="w-6 h-6 mb-2 opacity-20" />
                        <p>No errors</p>
                      </div>
                    )}
                  </ScrollArea>
                </div>
                
                <div className="text-[10px] text-center text-slate-500">
                  Batch ID: {batch.id}
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="history">
            <StateBatchHistory stateCode={stateCode} />
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}