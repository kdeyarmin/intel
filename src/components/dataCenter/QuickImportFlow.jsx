import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Upload, Loader2, CheckCircle2, AlertCircle, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import ImportWizardAccordion from '../imports/ImportWizardAccordion';

import { IMPORT_CATEGORIES } from './ImportCategoryCards';

export default function QuickImportFlow({ category, onClose, onComplete }) {
  const actualCategory = IMPORT_CATEGORIES.find(c => c.id === category?.id) || category;
  const [selectedType, setSelectedType] = useState(actualCategory.types.length === 1 ? actualCategory.types[0] : null);
  const [step, setStep] = useState(actualCategory.types.length === 1 ? 'wizard' : 'pickType');
  const [processing, setProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');
  const [result, setResult] = useState(null);

  const queryClient = useQueryClient();

  const handleSelectType = (type) => {
    setSelectedType(type);
    if (type.id === 'nppes_registry') {
      window.location.href = '/NPPESCrawler';
      return;
    }
    if (type.requiredColumns.length === 0) {
      setStep('autoImport');
    } else {
      setStep('wizard');
    }
  };

  const handleAutoImport = async () => {
    setProcessing(true);
    setProcessingStatus('Starting import...');
    try {
      const res = await base44.functions.invoke('triggerImport', {
        import_type: selectedType.id,
        dry_run: false,
      });
      setResult({ success: true, data: res.data });
      setStep('done');
      toast.success('Import started successfully');
      queryClient.invalidateQueries();
    } catch (err) {
      setResult({ success: false, error: err.message });
      setStep('done');
      toast.error('Import failed');
    } finally {
      setProcessing(false);
    }
  };

  const handleReset = () => {
    setStep('pickType');
    setSelectedType(null);
    setResult(null);
  };

  return (
    <Card className="bg-[#141d30] border-slate-700/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {step !== 'pickType' && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  if (step === 'wizard' || step === 'autoImport') handleReset();
                  else onClose();
                }}
                className="h-8 w-8 text-slate-400 hover:text-white"
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
            )}
            <CardTitle className="text-lg text-slate-200">
              {step === 'pickType' ? `Import ${actualCategory.label}` : selectedType?.name || 'Import'}
            </CardTitle>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 text-slate-500 hover:text-white">
            <X className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Pick Type */}
        {step === 'pickType' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {actualCategory.types.map(type => (
              <button
                key={type.id}
                onClick={() => handleSelectType(type)}
                className="text-left p-3 rounded-lg border border-slate-700/40 hover:border-cyan-500/30 hover:bg-slate-800/30 transition-all"
              >
                <p className="text-sm font-medium text-slate-200">{type.name}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">{type.description}</p>
              </button>
            ))}
          </div>
        )}

        {/* Accordion Wizard */}
        {step === 'wizard' && selectedType && (
          <ImportWizardAccordion
            selectedType={selectedType}
            onReset={handleReset}
            onComplete={onComplete}
            compact
          />
        )}

        {/* Auto Import (Medicare Stats) */}
        {step === 'autoImport' && (
          <div className="text-center py-8 space-y-4">
            <p className="text-sm text-slate-400">
              This dataset will be imported automatically from CMS.
            </p>
            <Button
              onClick={handleAutoImport}
              disabled={processing}
              className="bg-cyan-600 hover:bg-cyan-700"
            >
              {processing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
              {processing ? processingStatus : 'Start Import'}
            </Button>
          </div>
        )}

        {/* Done (auto-import result) */}
        {step === 'done' && result && (
          <div className="text-center py-6 space-y-4">
            {result.success ? (
              <>
                <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
                <h3 className="text-lg font-semibold text-emerald-400">Import Started</h3>
              </>
            ) : (
              <>
                <AlertCircle className="w-12 h-12 text-red-400 mx-auto" />
                <div>
                  <h3 className="text-lg font-semibold text-red-400">Import Failed</h3>
                  <p className="text-sm text-slate-400 mt-1">{result.error}</p>
                </div>
              </>
            )}
            <div className="flex justify-center gap-2">
              <Button variant="outline" onClick={onClose} className="bg-transparent border-slate-700 text-slate-300">
                Done
              </Button>
              <Button onClick={handleReset} className="bg-cyan-600 hover:bg-cyan-700">
                Import Another
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}