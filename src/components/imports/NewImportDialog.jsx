import React, { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Upload, FileText, Database, TrendingUp, Activity,
  Loader2, CheckCircle2, AlertCircle, Search, X, Tag, Plus
} from 'lucide-react';
import { base44 } from '@/api/base44Client';

const IMPORT_TYPES = [
  { id: 'nppes_monthly', name: 'NPPES Monthly', desc: 'Provider registry data', icon: FileText, cat: 'nppes', hasUrl: false },
  { id: 'nppes_registry', name: 'NPPES Registry', desc: 'Full NPI registry', icon: FileText, cat: 'nppes', hasUrl: false },
  { id: 'cms_utilization', name: 'CMS Utilization', desc: 'Part B utilization & payment', icon: TrendingUp, cat: 'cms_claims', hasUrl: false },
  { id: 'cms_part_d', name: 'CMS Part D', desc: 'Prescription drug claims', icon: Activity, cat: 'cms_claims', hasUrl: false },
  { id: 'cms_order_referring', name: 'Order & Referring', desc: 'Order/referring providers', icon: Database, cat: 'cms_claims', hasUrl: true },
  { id: 'provider_service_utilization', name: 'Provider Service Util', desc: 'Provider-level HCPCS', icon: Activity, cat: 'cms_claims', hasUrl: true },
  { id: 'hospice_enrollments', name: 'Hospice Enrollments', desc: 'CMS hospice enrollment', icon: Database, cat: 'cms_enrollment', hasUrl: true },
  { id: 'home_health_enrollments', name: 'HH Enrollments', desc: 'CMS home health enrollment', icon: Database, cat: 'cms_enrollment', hasUrl: true },
  { id: 'home_health_cost_reports', name: 'HH Cost Reports', desc: 'Financial & utilization', icon: TrendingUp, cat: 'cms_claims', hasUrl: false },
  { id: 'nursing_home_chains', name: 'Nursing Home Chains', desc: 'Chain performance', icon: TrendingUp, cat: 'provider_data', hasUrl: false },
  { id: 'home_health_pdgm', name: 'HH PDGM', desc: 'PDGM utilization', icon: TrendingUp, cat: 'cms_claims', hasUrl: false },
  { id: 'inpatient_drg', name: 'Inpatient DRG', desc: 'Hospital DRG data', icon: TrendingUp, cat: 'cms_claims', hasUrl: false },
  { id: 'provider_ownership', name: 'Provider Ownership', desc: 'Ownership/control info', icon: Database, cat: 'provider_data', hasUrl: false },
  { id: 'medicare_hha_stats', name: 'Medicare HHA Stats', desc: 'Home health aggregate', icon: Activity, cat: 'cms_statistics', hasUrl: true },
  { id: 'medicare_ma_inpatient', name: 'Medicare MA Inpatient', desc: 'MA inpatient stats', icon: Activity, cat: 'cms_statistics', hasUrl: true },
  { id: 'medicare_part_d_stats', name: 'Medicare Part D Stats', desc: 'Part D aggregate', icon: Activity, cat: 'cms_statistics', hasUrl: true },
  { id: 'medicare_snf_stats', name: 'Medicare SNF Stats', desc: 'SNF aggregate', icon: Activity, cat: 'cms_statistics', hasUrl: true },
];

const CATEGORY_LABELS = {
  nppes: 'NPPES',
  cms_claims: 'CMS Claims',
  cms_enrollment: 'CMS Enrollment',
  cms_statistics: 'CMS Statistics',
  provider_data: 'Provider Data',
};

export default function NewImportDialog({ open, onOpenChange, onImportStarted }) {
  const [step, setStep] = useState(1);
  const [selectedType, setSelectedType] = useState(null);
  const [typeSearch, setTypeSearch] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const [uploadedFile, setUploadedFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [category, setCategory] = useState('');
  const [tags, setTags] = useState([]);
  const [tagInput, setTagInput] = useState('');
  const [dryRun, setDryRun] = useState(false);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  const reset = () => {
    setStep(1);
    setSelectedType(null);
    setTypeSearch('');
    setFileUrl('');
    setUploadedFile(null);
    setCategory('');
    setTags([]);
    setTagInput('');
    setDryRun(false);
    setYear(String(new Date().getFullYear()));
    setResult(null);
    setError(null);
  };

  const handleClose = (openState) => {
    if (!openState) reset();
    onOpenChange(openState);
  };

  const filteredTypes = IMPORT_TYPES.filter(t => {
    if (!typeSearch) return true;
    const q = typeSearch.toLowerCase();
    return t.name.toLowerCase().includes(q) || t.desc.toLowerCase().includes(q) || t.id.toLowerCase().includes(q);
  });

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setFileUrl(file_url);
    setUploadedFile(file.name);
    setIsUploading(false);
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setTagInput('');
  };

  const handleSubmit = async () => {
    if (!selectedType) return;
    setIsSubmitting(true);
    setError(null);
    setResult(null);

    const batchData = {
      import_type: selectedType.id,
      file_name: uploadedFile || `manual_${selectedType.id}_${Date.now()}`,
      file_url: fileUrl || '',
      status: 'validating',
      dry_run: dryRun,
      category: category || selectedType.cat || '',
      tags: tags.length > 0 ? tags : ['manual-import'],
      retry_count: 0,
    };

    await base44.entities.ImportBatch.create(batchData);

    try {
      const response = await base44.functions.invoke('triggerImport', {
        import_type: selectedType.id,
        file_url: fileUrl || undefined,
        dry_run: dryRun,
        year: parseInt(year) || new Date().getFullYear(),
      });
      setResult({ success: true, data: response.data });
      setStep(3);
    } catch (e) {
      const msg = e.response?.data?.error || e.message || 'Import trigger failed';
      setError(msg);
      setStep(3);
    }
    setIsSubmitting(false);
    onImportStarted?.();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col bg-[#141d30] border-slate-700">
        <DialogHeader>
          <DialogTitle className="text-slate-200 flex items-center gap-2">
            <Upload className="w-5 h-5 text-cyan-400" />
            {step === 1 && 'New Import — Select Type'}
            {step === 2 && `Configure — ${selectedType?.name}`}
            {step === 3 && 'Import Status'}
          </DialogTitle>
        </DialogHeader>

        {/* Step 1: Select import type */}
        {step === 1 && (
          <div className="flex-1 overflow-hidden flex flex-col space-y-3">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <Input
                value={typeSearch}
                onChange={(e) => setTypeSearch(e.target.value)}
                placeholder="Search import types..."
                className="pl-8 h-8 text-xs bg-slate-800/50 border-slate-700 text-slate-300 placeholder:text-slate-600"
              />
            </div>
            <div className="flex-1 overflow-y-auto space-y-1.5 min-h-0 pr-1">
              {filteredTypes.map(t => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    onClick={() => { setSelectedType(t); setCategory(t.cat || ''); setStep(2); }}
                    className="w-full flex items-center gap-3 p-3 rounded-lg border border-slate-700/50 hover:border-cyan-500/30 hover:bg-slate-800/40 transition-colors text-left"
                  >
                    <div className="w-9 h-9 rounded-lg bg-cyan-500/10 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-4 h-4 text-cyan-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-200">{t.name}</p>
                      <p className="text-xs text-slate-500">{t.desc}</p>
                    </div>
                    <Badge className="bg-slate-800 text-slate-400 text-[10px] border border-slate-700/50 flex-shrink-0">
                      {CATEGORY_LABELS[t.cat] || t.cat}
                    </Badge>
                  </button>
                );
              })}
              {filteredTypes.length === 0 && (
                <p className="text-center text-slate-500 py-8 text-sm">No import types match "{typeSearch}"</p>
              )}
            </div>
          </div>
        )}

        {/* Step 2: Configure */}
        {step === 2 && selectedType && (
          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {/* Selected type badge */}
            <div className="flex items-center gap-2 bg-slate-800/50 border border-slate-700/50 rounded-lg p-3">
              <selectedType.icon className="w-4 h-4 text-cyan-400" />
              <span className="text-sm font-medium text-slate-200">{selectedType.name}</span>
              <Badge className="bg-slate-700/50 text-slate-400 text-[10px]">{CATEGORY_LABELS[selectedType.cat]}</Badge>
              <Button variant="ghost" size="sm" className="ml-auto text-xs text-slate-500 hover:text-slate-300 h-6" onClick={() => setStep(1)}>
                Change
              </Button>
            </div>

            {/* File upload / URL */}
            <div className="space-y-2">
              <Label className="text-xs text-slate-400">Data Source</Label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    accept=".csv,.xlsx,.xls,.json,.zip"
                    className="hidden"
                  />
                  <Button
                    variant="outline"
                    className="w-full h-20 flex-col gap-1.5 bg-transparent border-slate-700 border-dashed text-slate-400 hover:bg-slate-800 hover:text-cyan-400 hover:border-cyan-500/30"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                  >
                    {isUploading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : uploadedFile ? (
                      <>
                        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                        <span className="text-[10px] text-emerald-400 truncate max-w-[150px]">{uploadedFile}</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-5 h-5" />
                        <span className="text-[10px]">Upload File</span>
                      </>
                    )}
                  </Button>
                </div>
                <div className="space-y-1.5">
                  <span className="text-[10px] text-slate-500">Or use a direct URL:</span>
                  <Input
                    value={!uploadedFile ? fileUrl : ''}
                    onChange={(e) => { setFileUrl(e.target.value); setUploadedFile(null); }}
                    placeholder="https://data.cms.gov/..."
                    className="h-8 text-xs bg-slate-800/50 border-slate-700 text-slate-300 placeholder:text-slate-600"
                    disabled={!!uploadedFile}
                  />
                  {selectedType.hasUrl && (
                    <p className="text-[10px] text-slate-600">Leave blank to use the default CMS API endpoint</p>
                  )}
                </div>
              </div>
            </div>

            {/* Year */}
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400">Data Year</Label>
              <Input
                type="number"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                min={2015}
                max={2030}
                className="h-8 w-28 text-sm bg-slate-800/50 border-slate-700 text-slate-300"
              />
            </div>

            {/* Category */}
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400">Category</Label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="text-xs border border-slate-700 rounded-md px-2 py-1.5 bg-slate-800/50 text-slate-300 h-8 w-full"
              >
                <option value="">None</option>
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>

            {/* Tags */}
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400">Tags</Label>
              <div className="flex items-center gap-2">
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                  placeholder="Add a tag..."
                  className="h-8 text-xs bg-slate-800/50 border-slate-700 text-slate-300 placeholder:text-slate-600 flex-1"
                />
                <Button variant="outline" size="sm" className="h-8 text-xs bg-transparent border-slate-700 text-slate-400 hover:text-cyan-400" onClick={addTag}>
                  <Plus className="w-3 h-3" />
                </Button>
              </div>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {tags.map(t => (
                    <Badge key={t} className="bg-slate-700/50 text-slate-300 text-[10px] gap-1">
                      <Tag className="w-2.5 h-2.5" />
                      {t}
                      <button onClick={() => setTags(tags.filter(x => x !== t))} className="hover:text-red-400">
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Dry run */}
            <div className="flex items-center justify-between border-t border-slate-700/50 pt-3">
              <div>
                <Label className="text-sm text-slate-300">Dry Run</Label>
                <p className="text-[10px] text-slate-500">Validate only — no data will be written</p>
              </div>
              <Switch checked={dryRun} onCheckedChange={setDryRun} />
            </div>
          </div>
        )}

        {/* Step 3: Result */}
        {step === 3 && (
          <div className="flex-1 flex flex-col items-center justify-center py-8 space-y-4">
            {result?.success ? (
              <>
                <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                </div>
                <div className="text-center">
                  <p className="text-lg font-semibold text-slate-200">Import Triggered</p>
                  <p className="text-sm text-slate-500 mt-1">
                    {selectedType?.name} import has been queued and is now processing.
                  </p>
                  {dryRun && <Badge className="bg-violet-500/15 text-violet-400 mt-2">Dry Run Mode</Badge>}
                </div>
              </>
            ) : (
              <>
                <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
                  <AlertCircle className="w-8 h-8 text-red-400" />
                </div>
                <div className="text-center">
                  <p className="text-lg font-semibold text-slate-200">Import Failed to Start</p>
                  <p className="text-sm text-red-400 mt-1 max-w-sm">{error}</p>
                  <p className="text-xs text-slate-500 mt-2">The batch record was created — check Import Monitoring for details.</p>
                </div>
              </>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          {step === 1 && (
            <Button variant="outline" onClick={() => handleClose(false)} className="bg-transparent border-slate-700 text-slate-300 hover:bg-slate-800">
              Cancel
            </Button>
          )}
          {step === 2 && (
            <>
              <Button variant="outline" onClick={() => setStep(1)} className="bg-transparent border-slate-700 text-slate-300 hover:bg-slate-800">
                Back
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting || (!fileUrl && !selectedType.hasUrl)}
                className="bg-cyan-600 hover:bg-cyan-700 text-white"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                {isSubmitting ? 'Starting...' : dryRun ? 'Validate Only' : 'Start Import'}
              </Button>
            </>
          )}
          {step === 3 && (
            <Button onClick={() => handleClose(false)} className="bg-cyan-600 hover:bg-cyan-700 text-white">
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}