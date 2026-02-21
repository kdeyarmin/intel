import React from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, AlertTriangle, CheckCircle2, XCircle, Clock, Database, FileText } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

export default function StateDetailSheet({ stateCode, isOpen, onClose }) {
  // Fetch the latest batch for this state
  const { data: batch, isLoading: batchLoading } = useQuery({
    queryKey: ['stateBatch', stateCode],
    queryFn: async () => {
      if (!stateCode) return null;
      // Fetch recent NPPES batches and find the one for this state
      const batches = await base44.entities.ImportBatch.filter({ import_type: 'nppes_registry' }, '-created_date', 100);
      return batches.find(b => b.file_name?.includes(`crawler_${stateCode}_`)) || null;
    },
    enabled: !!stateCode && isOpen,
    refetchInterval: (data) => (data && data.status === 'processing' ? 2000 : false), // Poll if processing
  });

  // Fetch errors for this batch if it exists
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
      case 'completed': return 'text-green-600 bg-green-50 border-green-200';
      case 'failed': return 'text-red-600 bg-red-50 border-red-200';
      case 'processing': return 'text-amber-600 bg-amber-50 border-amber-200';
      default: return 'text-slate-600 bg-slate-50 border-slate-200';
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
      <SheetContent className="w-[400px] sm:w-[540px] overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle className="flex items-center gap-3 text-2xl">
            <Badge variant="outline" className="text-xl px-3 py-1 bg-slate-100">{stateCode}</Badge>
            Crawler Details
          </SheetTitle>
          <SheetDescription>
            Real-time status and logs for the {stateCode} crawler process.
          </SheetDescription>
        </SheetHeader>

        {batchLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
          </div>
        ) : !batch ? (
          <div className="text-center py-12 text-slate-500 bg-slate-50 rounded-lg border border-dashed">
            <Database className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No crawl data found for {stateCode}</p>
            <p className="text-xs mt-1">Has this state been crawled yet?</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Status Card */}
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
                  <Badge className="animate-pulse bg-amber-500 hover:bg-amber-600">Live</Badge>
                )}
              </CardContent>
            </Card>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-slate-50 rounded-lg border">
                <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Total Fetched</div>
                <div className="text-2xl font-bold text-slate-700">{batch.total_rows?.toLocaleString() || 0}</div>
              </div>
              <div className="p-3 bg-green-50 rounded-lg border border-green-100">
                <div className="text-xs text-green-600 uppercase tracking-wider mb-1">Imported</div>
                <div className="text-2xl font-bold text-green-700">{batch.imported_rows?.toLocaleString() || 0}</div>
              </div>
              <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                <div className="text-xs text-blue-600 uppercase tracking-wider mb-1">Updated</div>
                <div className="text-2xl font-bold text-blue-700">{batch.updated_rows?.toLocaleString() || 0}</div>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg border">
                <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Skipped</div>
                <div className="text-2xl font-bold text-slate-700">{batch.skipped_rows?.toLocaleString() || 0}</div>
              </div>
            </div>

            {/* Progress (if processing) */}
            {batch.status === 'processing' && (
               <div className="space-y-2">
                 <div className="flex justify-between text-xs text-slate-500">
                   <span>Processing...</span>
                   <span>{batch.total_rows} rows</span>
                 </div>
                 <Progress value={100} className="h-1 animate-pulse" />
               </div>
            )}

            {/* Error Reports */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                Error Reports
                {errors?.length > 0 && <Badge variant="destructive" className="ml-auto text-xs h-5">{errors.length}</Badge>}
              </h3>
              
              <ScrollArea className="h-[300px] rounded-md border bg-slate-50 p-4">
                {errorsLoading ? (
                   <div className="space-y-3">
                     {[1,2,3].map(i => <div key={i} className="h-16 bg-slate-200 animate-pulse rounded" />)}
                   </div>
                ) : errors?.length > 0 ? (
                  <div className="space-y-3">
                    {errors.map((err) => (
                      <div key={err.id} className="bg-white p-3 rounded border shadow-sm space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="font-medium text-sm text-red-700">{err.title || 'Unknown Error'}</div>
                          <div className="text-[10px] text-slate-400 whitespace-nowrap">
                            {new Date(err.timestamp).toLocaleTimeString()}
                          </div>
                        </div>
                        <p className="text-xs text-slate-600 line-clamp-2">{err.description}</p>
                        {err.error_samples && err.error_samples.length > 0 && (
                          <div className="mt-2 bg-slate-900 text-slate-50 p-2 rounded text-[10px] font-mono overflow-x-auto">
                             {err.error_samples[0]?.message || JSON.stringify(err.error_samples[0])}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : batch.error_samples && batch.error_samples.length > 0 ? (
                    // Fallback to batch error samples if no ErrorReport entities
                    <div className="space-y-3">
                        {batch.error_samples.map((err, idx) => (
                            <div key={idx} className="bg-white p-3 rounded border shadow-sm space-y-2">
                                <div className="font-medium text-sm text-red-700">Batch Error Sample</div>
                                <p className="text-xs text-slate-600">{err.message || JSON.stringify(err)}</p>
                            </div>
                        ))}
                    </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-slate-400 text-sm">
                    <CheckCircle2 className="w-8 h-8 mb-2 opacity-20" />
                    <p>No errors reported</p>
                  </div>
                )}
              </ScrollArea>
            </div>
            
            <div className="text-[10px] text-center text-slate-400">
              Batch ID: {batch.id}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}