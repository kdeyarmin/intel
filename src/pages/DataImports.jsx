import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Upload } from 'lucide-react';
import ImportTypeSelector from '../components/imports/ImportTypeSelector';
import ImportWizardAccordion from '../components/imports/ImportWizardAccordion';
import PageHeader from '../components/shared/PageHeader';
import AIFailureAnalysis from '../components/imports/AIFailureAnalysis';
import RetryBatchDialog from '../components/imports/RetryBatchDialog';

export default function DataImports() {
  const [selectedType, setSelectedType] = useState(null);
  const [retryBatch, setRetryBatch] = useState(null);
  const [retryDialogOpen, setRetryDialogOpen] = useState(false);
  const [retryPresets, setRetryPresets] = useState(null);
  const queryClient = useQueryClient();

  const { data: batches = [] } = useQuery({
    queryKey: ['dataImportsBatches'],
    queryFn: () => base44.entities.ImportBatch.list('-created_date', 20),
  });

  const handleReset = () => {
    setSelectedType(null);
  };

  const handleSmartRetry = (batch, suggestedSettings) => {
    setRetryBatch(batch);
    setRetryPresets(suggestedSettings);
    setRetryDialogOpen(true);
  };

  const handleManualRetry = (batch) => {
    setRetryBatch(batch);
    setRetryPresets(null);
    setRetryDialogOpen(true);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Data Imports"
        subtitle="Upload and validate NPPES and CMS datasets"
        icon={Upload}
        breadcrumbs={[{ label: 'Admin', page: 'DataCenter' }, { label: 'Data Imports' }]}
        actions={selectedType ? (
          <Button variant="outline" onClick={handleReset} className="bg-transparent border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-cyan-400">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Choose Different Type
          </Button>
        ) : null}
      />

      {!selectedType ? (
        <div className="space-y-6">
          <ImportTypeSelector onSelect={(type) => setSelectedType(type)} />

          {batches.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Recent Imports</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {batches.slice(0, 5).map(batch => (
                    <div key={batch.id} className="space-y-2">
                      <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                        <div>
                          <p className="font-medium text-slate-200">{batch.file_name}</p>
                          <p className="text-sm text-slate-400">
                            {batch.import_type?.replace(/_/g, ' ')} • {batch.valid_rows || 0} valid rows
                            {batch.imported_rows > 0 && ` • ${batch.imported_rows} imported`}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {batch.status === 'failed' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleManualRetry(batch)}
                              className="h-7 text-xs gap-1 bg-transparent text-blue-400 border-blue-500/30 hover:bg-blue-500/10"
                            >
                              Retry
                            </Button>
                          )}
                          <div className="text-right">
                            <p className="text-sm text-slate-500">
                              {new Date(batch.created_date).toLocaleDateString()}
                            </p>
                            {batch.dry_run && (
                              <Badge className="text-xs bg-blue-900/50 text-blue-300 border-blue-700" variant="outline">Dry Run</Badge>
                            )}
                            {batch.status === 'completed' && !batch.dry_run && (
                              <Badge className="text-xs bg-green-900/50 text-green-300 border-green-700" variant="outline">Imported</Badge>
                            )}
                            {batch.status === 'failed' && (
                              <Badge className="text-xs bg-red-900/50 text-red-300 border-red-700" variant="outline">Failed</Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      {batch.status === 'failed' && (
                        <AIFailureAnalysis
                          batch={batch}
                          compact={true}
                          onRetryWithSettings={(settings) => handleSmartRetry(batch, settings)}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        <div className="max-w-3xl">
          <div className="mb-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-cyan-900/30 border border-cyan-700/30 flex items-center justify-center">
              {selectedType.icon && <selectedType.icon className="w-5 h-5 text-cyan-400" />}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-200">{selectedType.name}</h2>
              <p className="text-xs text-slate-500">{selectedType.description}</p>
            </div>
          </div>
          <ImportWizardAccordion
            selectedType={selectedType}
            onReset={handleReset}
          />
        </div>
      )}

      <RetryBatchDialog
        batch={retryBatch}
        open={retryDialogOpen}
        onOpenChange={(open) => {
          setRetryDialogOpen(open);
          if (!open) { setRetryBatch(null); setRetryPresets(null); }
        }}
        presets={retryPresets}
        onRetryStarted={() => {
          queryClient.invalidateQueries({ queryKey: ['dataImportsBatches'] });
        }}
      />
    </div>
  );
}