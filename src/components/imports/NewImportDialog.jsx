import React, { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Upload, FileText, Database, TrendingUp, Activity,
  Loader2, CheckCircle2, AlertCircle, Search, X, Tag, Plus, Settings
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ActiveRulesBadge from './ActiveRulesBadge';
import FileParser from './FileParser';
import ColumnMapper from './ColumnMapper';
import { generateAIMapping } from './columnMappingAI';

// Required columns for AI mapping
const REQUIRED_COLUMNS = {
  nppes_monthly: ['NPI'],
  nppes_registry: ['NPI'],
  cms_utilization: ['NPI'],
  cms_part_d: ['NPI'],
  cms_order_referring: ['NPI'],
  provider_service_utilization: ['NPI'],
};

// Available data years per import type — only these years have actual CMS data
const AVAILABLE_YEARS = {
  cms_order_referring: [2023, 2022, 2021, 2020, 2019],
  provider_service_utilization: [2022, 2021, 2020, 2019],
  hospice_enrollments: [2024, 2023, 2022],
  home_health_enrollments: [2024, 2023, 2022],
  medicare_hha_stats: [2023, 2022, 2021, 2020],
  medicare_ma_inpatient: [2023, 2022, 2021, 2020],
  medicare_part_d_stats: [2023, 2022, 2021, 2020],
  medicare_snf_stats: [2023, 2022, 2021, 2020],
};

const IMPORT_TYPES = [
  { id: 'nppes_monthly', name: 'NPPES Monthly', desc: 'Provider registry data', icon: FileText, hasUrl: false },
  { id: 'nppes_registry', name: 'NPPES Registry', desc: 'Full NPI registry', icon: FileText, hasUrl: false },
  { id: 'cms_utilization', name: 'CMS Utilization', desc: 'Part B utilization & payment', icon: TrendingUp, hasUrl: false },
  { id: 'cms_part_d', name: 'CMS Part D', desc: 'Prescription drug claims', icon: Activity, hasUrl: false },
  { id: 'cms_order_referring', name: 'Order & Referring', desc: 'Order/referring providers', icon: Database, hasUrl: true },
  { id: 'provider_service_utilization', name: 'Provider Service Util', desc: 'Provider-level HCPCS', icon: Activity, hasUrl: true },
  { id: 'hospice_enrollments', name: 'Hospice Enrollments', desc: 'CMS hospice enrollment', icon: Database, hasUrl: true },
  { id: 'home_health_enrollments', name: 'HH Enrollments', desc: 'CMS home health enrollment', icon: Database, hasUrl: true },
  { id: 'home_health_cost_reports', name: 'HH Cost Reports', desc: 'Financial & utilization', icon: TrendingUp, hasUrl: false },
  { id: 'nursing_home_chains', name: 'Nursing Home Chains', desc: 'Chain performance', icon: TrendingUp, hasUrl: false },
  { id: 'home_health_pdgm', name: 'HH PDGM', desc: 'PDGM utilization', icon: TrendingUp, hasUrl: false },
  { id: 'inpatient_drg', name: 'Inpatient DRG', desc: 'Hospital DRG data', icon: TrendingUp, hasUrl: false },
  { id: 'provider_ownership', name: 'Provider Ownership', desc: 'Ownership/control info', icon: Database, hasUrl: false },
  { id: 'medicare_hha_stats', name: 'Medicare HHA Stats', desc: 'Home health aggregate', icon: Activity, hasUrl: true },
  { id: 'medicare_ma_inpatient', name: 'Medicare MA Inpatient', desc: 'MA inpatient stats', icon: Activity, hasUrl: true },
  { id: 'medicare_part_d_stats', name: 'Medicare Part D Stats', desc: 'Part D aggregate', icon: Activity, hasUrl: true },
  { id: 'medicare_snf_stats', name: 'Medicare SNF Stats', desc: 'SNF aggregate', icon: Activity, hasUrl: true },
  { id: 'opt_out_physicians', name: 'Opt-Out Physicians', desc: 'CMS Opt-Out', icon: Database, hasUrl: true },
  { id: 'medical_equipment_suppliers', name: 'Med Equip Suppliers', desc: 'DMEPOS Suppliers', icon: Database, hasUrl: true },
  { id: 'hospice_provider_measures', name: 'Hospice Provider Measures', desc: 'Hospice quality', icon: Activity, hasUrl: true },
  { id: 'hospice_state_measures', name: 'Hospice State Measures', desc: 'Hospice state aggregate', icon: Activity, hasUrl: true },
  { id: 'hospice_national_measures', name: 'Hospice National Measures', desc: 'Hospice national aggregate', icon: Activity, hasUrl: true },
  { id: 'snf_provider_measures', name: 'SNF Provider Measures', desc: 'SNF quality', icon: Activity, hasUrl: true },
  { id: 'nursing_home_providers', name: 'Nursing Home Providers', desc: 'Nursing home details', icon: Database, hasUrl: true },
  { id: 'nursing_home_deficiencies', name: 'Nursing Home Deficiencies', desc: 'Nursing home inspections', icon: Activity, hasUrl: true },
  { id: 'home_health_national_measures', name: 'HH National Measures', desc: 'Home health national aggregate', icon: Activity, hasUrl: true },
];

export default function NewImportDialog({ open, onOpenChange, onImportStarted }) {
  const [step, setStep] = useState(1);
  const [selectedType, setSelectedType] = useState(null);
  const [typeSearch, setTypeSearch] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const [uploadedFile, setUploadedFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);

  const [tags, setTags] = useState([]);
  const [tagInput, setTagInput] = useState('');
  const [dryRun, setDryRun] = useState(false);
  const [skipValidation, setSkipValidation] = useState(false);
  const [rowOffset, setRowOffset] = useState('');
  const [rowLimit, setRowLimit] = useState('');
  const [npiFilter, setNpiFilter] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [sheetFilter, setSheetFilter] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [year, setYear] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  // Mapping states
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [mapping, setMapping] = useState({});
  const [mappingConfidence, setMappingConfidence] = useState({});
  const [mappingScores, setMappingScores] = useState({});
  const [aiLoading, setAiLoading] = useState(false);
  const [optionalColumns, setOptionalColumns] = useState([]);

  const reset = () => {
    setStep(1);
    setSelectedType(null);
    setTypeSearch('');
    setFileUrl('');
    setUploadedFile(null);

    setTags([]);
    setTagInput('');
    setDryRun(false);
    setSkipValidation(false);
    setRowOffset('');
    setRowLimit('');
    setNpiFilter('');
    setStateFilter('');
    setSheetFilter('');
    setShowAdvanced(false);
    setYear(String(new Date().getFullYear()));
    setResult(null);
    setError(null);
  };

  const handleClose = (openState) => {
    if (!openState) reset();
    onOpenChange(openState);
  };

  const filteredTypes = IMPORT_TYPES.filter(t => {
    if (!t.hasUrl) return false; // Only show types with automatic import URLs
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

    // Don't create a separate batch here — triggerImport and sub-functions create their own.
    // Creating one here caused orphan "validating" batches that never got updated.
    try {
      const invokeParams = {
        import_type: selectedType.id,
        file_url: fileUrl || undefined,
        dry_run: dryRun,
        year: parseInt(year) || new Date().getFullYear(),
      };
      if (rowOffset) invokeParams.row_offset = Number(rowOffset);
      if (rowLimit) invokeParams.row_limit = Number(rowLimit);
      if (sheetFilter) invokeParams.sheet_filter = sheetFilter;

      const response = await base44.functions.invoke('triggerImport', invokeParams);
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
                    onClick={() => { 
                      setSelectedType(t); 
                      const years = AVAILABLE_YEARS[t.id];
                      setYear(years ? String(years[0]) : String(new Date().getFullYear() - 2));
                      setStep(2); 
                    }}
                    className="w-full flex items-center gap-3 p-3 rounded-lg border border-slate-700/50 hover:border-cyan-500/30 hover:bg-slate-800/40 transition-colors text-left"
                  >
                    <div className="w-9 h-9 rounded-lg bg-cyan-500/10 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-4 h-4 text-cyan-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-200">{t.name}</p>
                      <p className="text-xs text-slate-400">{t.desc}</p>
                    </div>

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

              <ActiveRulesBadge importType={selectedType.id} />
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
                  <span className="text-[10px] text-slate-400">Or use a direct URL:</span>
                  <Input
                    value={!uploadedFile ? fileUrl : ''}
                    onChange={(e) => { setFileUrl(e.target.value); setUploadedFile(null); }}
                    placeholder="https://data.cms.gov/..."
                    className="h-8 text-xs bg-slate-800/50 border-slate-700 text-slate-300 placeholder:text-slate-600"
                    disabled={!!uploadedFile}
                  />
                  {selectedType.hasUrl && (
                    <p className="text-[10px] text-slate-500">Leave blank to use the default CMS API endpoint</p>
                  )}
                </div>
              </div>
            </div>

            {/* Year */}
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400">Data Year</Label>
              {AVAILABLE_YEARS[selectedType.id] ? (
                <Select value={year} onValueChange={setYear}>
                  <SelectTrigger className="h-8 w-36 text-sm bg-slate-800/50 border-slate-700 text-slate-300">
                    <SelectValue placeholder="Select year" />
                  </SelectTrigger>
                  <SelectContent>
                    {AVAILABLE_YEARS[selectedType.id].map(y => (
                      <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  type="number"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  min={2015}
                  max={2030}
                  className="h-8 w-28 text-sm bg-slate-800/50 border-slate-700 text-slate-300"
                />
              )}
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

            {/* Processing Options */}
            <div className="space-y-3 border-t border-slate-700/50 pt-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm text-slate-300">Dry Run</Label>
                  <p className="text-[10px] text-slate-400">Validate only — no data will be written</p>
                </div>
                <Switch checked={dryRun} onCheckedChange={setDryRun} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm text-slate-300">Skip Validation</Label>
                  <p className="text-[10px] text-slate-400">Import directly without row-level validation</p>
                </div>
                <Switch checked={skipValidation} onCheckedChange={setSkipValidation} />
              </div>
            </div>

            {/* Advanced Parameters */}
            <div className="border-t border-slate-700/50 pt-3">
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 mb-3"
              >
                <Settings className="w-3 h-3" />
                {showAdvanced ? 'Hide' : 'Show'} Advanced Parameters
              </button>
              {showAdvanced && (
                <div className="space-y-3 bg-slate-800/30 border border-slate-700/50 rounded-lg p-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-400">Row Offset</Label>
                      <Input
                        type="number"
                        value={rowOffset}
                        onChange={(e) => setRowOffset(e.target.value)}
                        min={0}
                        placeholder="0 (start)"
                        className="h-8 text-xs bg-slate-800/50 border-slate-700 text-slate-300 placeholder:text-slate-600"
                      />
                      <p className="text-[10px] text-slate-500">Skip N rows from the start</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-400">Row Limit</Label>
                      <Input
                        type="number"
                        value={rowLimit}
                        onChange={(e) => setRowLimit(e.target.value)}
                        min={1}
                        placeholder="All rows"
                        className="h-8 text-xs bg-slate-800/50 border-slate-700 text-slate-300 placeholder:text-slate-600"
                      />
                      <p className="text-[10px] text-slate-500">Max rows to process</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-400">NPI Filter</Label>
                      <Input
                        value={npiFilter}
                        onChange={(e) => setNpiFilter(e.target.value)}
                        placeholder="1234567890, 0987654321"
                        className="h-8 text-xs bg-slate-800/50 border-slate-700 text-slate-300 placeholder:text-slate-600"
                      />
                      <p className="text-[10px] text-slate-500">Comma-separated NPIs</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-400">State Filter</Label>
                      <Input
                        value={stateFilter}
                        onChange={(e) => setStateFilter(e.target.value.toUpperCase())}
                        placeholder="NY"
                        maxLength={2}
                        className="h-8 text-xs bg-slate-800/50 border-slate-700 text-slate-300 placeholder:text-slate-600"
                      />
                      <p className="text-[10px] text-slate-500">2-letter state code</p>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-400">Sheet Filter</Label>
                    <Input
                      value={sheetFilter}
                      onChange={(e) => setSheetFilter(e.target.value)}
                      placeholder="e.g. MA4, Sheet1"
                      className="h-8 text-xs bg-slate-800/50 border-slate-700 text-slate-300 placeholder:text-slate-600"
                    />
                    <p className="text-[10px] text-slate-500">For multi-sheet ZIP/Excel imports — filter to a specific sheet</p>
                  </div>
                </div>
              )}
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
                  <p className="text-sm text-slate-400 mt-1">
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
                  <p className="text-xs text-slate-400 mt-2">The batch record was created — check Import Monitoring for details.</p>
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