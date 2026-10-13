import React, { useEffect, useId, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  FileText, Printer, Download, ChevronDown, ChevronUp, SlidersHorizontal, Database, Loader2,
} from 'lucide-react';
import { countExport } from '@/components/exports/exportUtils';
import { CAREMETRIC_LOGO_URL } from '@/lib/branding';
import ReportDocument from './ReportDocument';
import { availableSections, buildReportModel, orderedSelection } from './reportSections';

const TONE = {
  amber: 'text-amber-400',
  cyan: 'text-cyan-400',
  emerald: 'text-emerald-400',
  orange: 'text-orange-400',
  violet: 'text-violet-400',
};

function SectionCard({ title, children, count, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();
  return (
    <Card className="bg-slate-800/50 border-slate-700/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-slate-200">
          {/* The disclosure is a native button, so it works from the keyboard and reports its state. */}
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-controls={open ? contentId : undefined}
            className="flex w-full items-center gap-2 text-left cursor-pointer"
          >
            <span className="w-1 h-4 rounded-full bg-cyan-400" aria-hidden="true" />
            {title}
            {count != null && (
              <Badge className="bg-slate-700/50 text-slate-300 border-slate-600/50 text-[10px] ml-auto mr-2">{count}</Badge>
            )}
            {open
              ? <ChevronUp className={`w-3.5 h-3.5 text-slate-400 ${count == null ? 'ml-auto' : ''}`} aria-hidden="true" />
              : <ChevronDown className={`w-3.5 h-3.5 text-slate-400 ${count == null ? 'ml-auto' : ''}`} aria-hidden="true" />}
          </button>
        </CardTitle>
      </CardHeader>
      {open && <CardContent id={contentId}>{children}</CardContent>}
    </Card>
  );
}

function KeyValues({ items }) {
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
      {items.map((it) => (
        <div key={it.label} className="flex gap-3 text-xs">
          <dt className="min-w-[120px] text-slate-400">{it.label}</dt>
          <dd className={`text-slate-200 break-words ${it.emphasis ? 'text-2xl font-bold text-cyan-400' : ''}`}>{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function BlockBody({ block }) {
  const empty = block.kind === 'table' ? block.rows.length === 0 : block.items.length === 0;
  if (empty) return <p className="text-xs text-slate-400 italic">{block.emptyText || 'No records are available for this section.'}</p>;
  return (
    <>
      {block.kind === 'table' ? (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-900/60">
                {block.columns.map((c) => (
                  <th key={c.key} scope="col" className={`py-2 px-3 font-medium text-slate-400 ${c.align === 'right' ? 'text-right' : 'text-left'}`}>{c.label || c.key}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, i) => (
                <tr key={i} className="border-t border-slate-700/40">
                  {block.columns.map((c) => {
                    const cell = row[c.key] || {};
                    return (
                      <td key={c.key} className={`py-1.5 px-3 text-slate-200 ${c.align === 'right' ? 'text-right tabular-nums' : ''}`}>
                        {cell.to ? <Link to={cell.to} className="text-cyan-400 hover:underline">{cell.text}</Link> : cell.text}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <KeyValues items={block.items} />
      )}
      {block.note && <p className="mt-2 text-[11px] text-slate-400 italic">{block.note}</p>}
    </>
  );
}

function SectionPicker({ available, selected, onToggle, onAll, onNone, onGenerate }) {
  const baseId = useId();
  const allSelected = selected.length === available.length;
  return (
    <Card className="bg-slate-800/50 border-slate-700/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm text-slate-200 flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-cyan-400" aria-hidden="true" />
          Comprehensive Report
        </CardTitle>
        <p className="text-xs text-slate-400">Choose the sections to include, then generate. The report can be printed or downloaded as a branded PDF.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3 text-xs">
          <span className="text-slate-400">{selected.length} of {available.length} sections selected</span>
          <button type="button" onClick={onAll} className="text-cyan-400 hover:underline disabled:opacity-50" disabled={allSelected}>Select all</button>
          <button type="button" onClick={onNone} className="text-cyan-400 hover:underline disabled:opacity-50" disabled={selected.length === 0}>Clear</button>
        </div>
        <fieldset>
          <legend className="sr-only">Report sections</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {available.map((s) => {
              const id = `${baseId}-${s.key}`;
              const checked = selected.includes(s.key);
              return (
                <div key={s.key} className={`flex items-start gap-2.5 rounded-md border p-2.5 ${checked ? 'border-cyan-500/30 bg-cyan-900/20' : 'border-slate-700/50 bg-slate-900/30'}`}>
                  <Checkbox
                    id={id}
                    checked={checked}
                    onCheckedChange={() => onToggle(s.key)}
                    aria-labelledby={`${id}-label`}
                    aria-describedby={`${id}-desc`}
                    className="mt-0.5 border-slate-500"
                  />
                  <div className="min-w-0">
                    <label id={`${id}-label`} htmlFor={id} className="block text-xs font-medium text-slate-200 cursor-pointer">{s.label}</label>
                    <p id={`${id}-desc`} className="text-[11px] text-slate-400">{s.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </fieldset>
        <Button
          type="button"
          onClick={onGenerate}
          disabled={selected.length === 0}
          className="bg-gradient-to-r from-cyan-700 to-blue-600 hover:from-cyan-800 hover:to-blue-700 text-white text-sm"
        >
          <FileText className="w-4 h-4 mr-2" aria-hidden="true" />
          {allSelected ? 'Generate Full Report' : `Generate Report (${selected.length} section${selected.length === 1 ? '' : 's'})`}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function ComprehensiveReport({ npi, providerId, facilityName }) {
  return <ReportContent key={JSON.stringify([npi, providerId])} npi={npi} providerId={providerId} facilityName={facilityName} />;
}

function ReportContent({ npi, providerId, facilityName }) {
  const available = useMemo(() => availableSections({ npi, providerId }), [npi, providerId]);
  // Kept as the sections switched off, so a section that becomes available
  // later (a facility's linked NPI) starts selected like the rest.
  const [deselected, setDeselected] = useState(() => new Set());
  const selected = useMemo(() => available.map((s) => s.key).filter((k) => !deselected.has(k)), [available, deselected]);
  const [requested, setRequested] = useState(null);
  const [printing, setPrinting] = useState(false);
  const [busy, setBusy] = useState(null);

  const { data: report, isLoading, error } = useQuery({
    queryKey: ['comprehensiveReport', npi, providerId, requested],
    queryFn: () => base44.functions.invoke('getComprehensiveReport', {
      npi: npi || undefined,
      provider_id: providerId || undefined,
      sections: requested,
    }),
    enabled: !!requested && !!(npi || providerId),
    staleTime: 60000,
    select: (res) => res?.data || res,
  });

  const model = useMemo(
    () => (report && requested ? buildReportModel(report, requested, { npi, providerId, facilityName }) : null),
    [report, requested, npi, providerId, facilityName],
  );

  useEffect(() => {
    if (!printing) return undefined;
    const done = () => setPrinting(false);
    document.body.classList.add('cm-printing-report');
    window.addEventListener('afterprint', done);
    // The print document is in the DOM by now (effects run after commit).
    window.print();
    return () => {
      document.body.classList.remove('cm-printing-report');
      window.removeEventListener('afterprint', done);
    };
  }, [printing]);

  const toggle = (key) => setDeselected((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  // Printing and the PDF export the report, so both count against the
  // organization's daily export allowance like every other export.
  const handlePrint = async () => {
    setBusy('print');
    try {
      const quota = await countExport();
      if (!quota.ok) { toast.error(quota.message); return; }
      setPrinting(true);
    } catch {
      toast.error('Unable to prepare the report for printing. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const handlePdf = async () => {
    setBusy('pdf');
    try {
      const quota = await countExport();
      if (!quota.ok) { toast.error(quota.message); return; }
      const { downloadReportPdf } = await import('./reportPdf');
      await downloadReportPdf(model);
    } catch {
      toast.error('Unable to generate the PDF. Please try again, or use Print to save a PDF.');
    } finally {
      setBusy(null);
    }
  };

  if (!npi && !providerId) return null;

  if (!requested) {
    return (
      <SectionPicker
        available={available}
        selected={selected}
        onToggle={toggle}
        onAll={() => setDeselected(new Set())}
        onNone={() => setDeselected(new Set(available.map((s) => s.key)))}
        onGenerate={() => setRequested(orderedSelection(selected, available))}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-8 w-64 bg-slate-800" />
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32 bg-slate-800" />)}
      </div>
    );
  }

  if (error || !model) {
    return (
      <Card className="bg-slate-800/50 border-slate-700/50">
        <CardContent className="py-6 text-center">
          <p className="text-sm text-slate-400">Unable to generate the report.</p>
          <p className="mt-1 text-xs text-slate-400">Please return to the section selection and try again.</p>
          <Button variant="ghost" size="sm" onClick={() => setRequested(null)} className="mt-2 text-xs text-cyan-400">
            Change sections
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4" id="comprehensive-report">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
          <FileText className="w-5 h-5 text-cyan-400" aria-hidden="true" />
          Comprehensive Report
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="text-xs bg-transparent border-slate-700 text-slate-300 hover:bg-slate-800"
            onClick={() => setRequested(null)}
          >
            <SlidersHorizontal className="w-3.5 h-3.5 mr-1" aria-hidden="true" /> Change sections
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-xs bg-transparent border-slate-700 text-slate-300 hover:bg-slate-800"
            onClick={handlePrint}
            disabled={!!busy}
          >
            {busy === 'print' ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" aria-hidden="true" /> : <Printer className="w-3.5 h-3.5 mr-1" aria-hidden="true" />} Print
          </Button>
          <Button
            size="sm"
            className="text-xs bg-cyan-700 hover:bg-cyan-800 text-white"
            onClick={handlePdf}
            disabled={!!busy}
          >
            {busy === 'pdf' ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" aria-hidden="true" /> : <Download className="w-3.5 h-3.5 mr-1" aria-hidden="true" />} Download PDF
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setRequested(null)} className="text-xs text-slate-400">
            Close
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-slate-700/50 overflow-hidden">
        <div className="flex items-center justify-between gap-3 bg-slate-900 px-4 py-3 border-b-2 border-cyan-500/60">
          <div className="flex items-center gap-2.5">
            <img src={CAREMETRIC_LOGO_URL} alt="CareMetric Healthcare Advisors" className="w-32 h-10 object-contain bg-white rounded-md" />
            <div>
              <p className="text-sm font-bold text-white leading-tight">CareMetric <span className="text-cyan-400">Intel</span></p>
              <p className="text-[10px] text-slate-400">CareMetric Healthcare Advisors</p>
              <a href="https://caremetricintel.com/" className="text-[10px] text-cyan-400 hover:underline">caremetricintel.com</a>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs font-medium text-slate-200">{model.subtitle}</p>
            <p className="text-[10px] text-slate-400">Generated {model.generatedLabel}</p>
          </div>
        </div>
        <div className="bg-slate-800/50 px-4 py-4 space-y-4">
          <h2 className="text-xl font-bold text-slate-100">{model.title}</h2>
          {model.profile && model.profile.identifiers.length > 0 && <KeyValues items={model.profile.identifiers} />}
          {model.profile && model.profile.metrics.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {model.profile.metrics.map((m) => (
                <div key={m.label} className="rounded-md border border-slate-700/50 bg-slate-900/40 py-3 px-4">
                  <div className="text-[10px] text-slate-400 mb-1">{m.label}</div>
                  <div className={`text-lg font-bold ${TONE[m.tone] || 'text-slate-100'}`}>{m.value}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {model.sections.flatMap((section) => section.blocks).map((block) => (
        <SectionCard key={block.key} title={block.title} count={block.kind === 'table' ? block.count : null}>
          <BlockBody block={block} />
        </SectionCard>
      ))}

      <div className="flex items-start gap-1.5 text-[11px] leading-relaxed text-slate-400 border-t border-slate-700/50 pt-3">
        <Database className="w-3 h-3 mt-0.5 shrink-0" aria-hidden="true" />
        <div>
          {model.sources.length > 0 && <p>Data sources: {model.sources.join('; ')}.</p>}
          <p>{model.attribution}</p>
        </div>
      </div>

      {printing && createPortal(
        <div className="cm-print-root"><ReportDocument model={model} /></div>,
        document.body,
      )}
    </div>
  );
}
