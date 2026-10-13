import React, { useEffect, useId, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { base44 } from '@/api/base44Client';
import { countExport } from '@/components/exports/exportUtils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { downloadReportPdf } from './reportPdf';
import ReportDocument from './ReportDocument';
import { availableSections, buildReportModel, orderedSelection } from './reportSections';

function ReportBlock({ block }) {
  const empty = block.kind === 'table' ? block.rows.length === 0 : block.items.length === 0;
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="font-medium text-slate-200">{block.title}</h4>
        {block.kind === 'table' && <span className="text-xs text-slate-400">{block.count} record{block.count === 1 ? '' : 's'}</span>}
      </div>
      {empty ? (
        <p className="text-sm text-slate-400">{block.emptyText || 'No data on file.'}</p>
      ) : block.kind === 'table' ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-xs text-slate-400">
                {block.columns.map((column) => (
                  <th key={column.key} scope="col" className={`px-3 py-2 font-medium ${column.align === 'right' ? 'text-right' : ''}`}>
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, index) => (
                <tr key={`${block.key}-${index}`} className="border-b border-slate-800 last:border-0">
                  {block.columns.map((column) => {
                    const value = row[column.key] || {};
                    return (
                      <td key={column.key} className={`px-3 py-2 text-slate-300 ${column.align === 'right' ? 'text-right tabular-nums' : ''}`}>
                        {value.to ? <a className="text-cyan-400 hover:underline" href={value.to}>{value.text}</a> : value.text}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <dl className="grid gap-3 sm:grid-cols-2">
          {block.items.map((item) => (
            <div key={item.label} className="flex justify-between gap-4 rounded-md bg-slate-800/50 px-3 py-2">
              <dt className="text-sm text-slate-400">{item.label}</dt>
              <dd className={`text-sm text-slate-200 ${item.emphasis ? 'font-semibold' : ''}`}>{item.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {block.note && <p className="text-xs text-slate-400">{block.note}</p>}
    </section>
  );
}

function ReportResults({ model, onPrint, onDownload, exporting, collapsed, onToggleSection, id }) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-xl font-semibold text-white">{model.title}</h3>
          <p className="mt-1 text-sm text-slate-400">{model.subtitle} · Generated {model.generatedLabel}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={exporting} onClick={onPrint}>
            Print
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={exporting} onClick={onDownload}>
            Download PDF
          </Button>
        </div>
      </div>

      {model.profile && (
        <section className="space-y-3 rounded-lg border border-slate-700 bg-slate-900/40 p-4">
          <h4 className="font-medium text-white">Profile &amp; Overview</h4>
          {model.profile.identifiers.length > 0 && (
            <dl className="grid gap-2 sm:grid-cols-2">
              {model.profile.identifiers.map((item) => (
                <div key={item.label} className="flex gap-3 text-sm">
                  <dt className="min-w-24 text-slate-400">{item.label}</dt>
                  <dd className="text-slate-200">{item.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {model.profile.metrics.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {model.profile.metrics.map((metric) => (
                <div key={metric.label} className="rounded-md border border-slate-700 bg-slate-800/50 p-3">
                  <div className="text-xs text-slate-400">{metric.label}</div>
                  <div className="mt-1 font-semibold tabular-nums text-white">{metric.value}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {model.sections.map((section) => (
        <section key={section.key} className="rounded-lg border border-slate-700 bg-slate-900/40 p-4">
          <button
            id={`${id}-toggle-${section.key}`}
            type="button"
            aria-expanded={!collapsed.has(section.key)}
            aria-controls={`${id}-panel-${section.key}`}
            onClick={() => onToggleSection(section.key)}
            className="w-full text-left font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
          >
            {section.blocks[0]?.title || section.label}
          </button>
          <div
            id={`${id}-panel-${section.key}`}
            role="region"
            aria-labelledby={`${id}-toggle-${section.key}`}
            className="mt-4 space-y-4"
          >
            {!collapsed.has(section.key) && section.blocks.map((block) => <ReportBlock key={block.key} block={block} />)}
          </div>
        </section>
      ))}
      <p className="text-xs text-slate-400">{model.attribution}</p>
    </div>
  );
}

export default function ComprehensiveReport({ npi, providerId, facilityName }) {
  const id = useId();
  const available = useMemo(() => availableSections({ npi, providerId }), [npi, providerId]);
  const availableKey = available.map((section) => section.key).join('|');
  const [selected, setSelected] = useState(() => available.map((section) => section.key));
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [model, setModel] = useState(null);
  const [printModel, setPrintModel] = useState(null);
  const [collapsedSections, setCollapsedSections] = useState(() => new Set());

  useEffect(() => {
    setSelected(available.map((section) => section.key));
    setModel(null);
  }, [availableKey]);

  useEffect(() => {
    if (!printModel) return undefined;
    const finishPrint = () => {
      document.body.classList.remove('cm-printing-report');
      setPrintModel(null);
    };
    document.body.classList.add('cm-printing-report');
    window.addEventListener('afterprint', finishPrint, { once: true });
    window.print();
    return () => {
      window.removeEventListener('afterprint', finishPrint);
      document.body.classList.remove('cm-printing-report');
    };
  }, [printModel]);

  const selectedKeys = orderedSelection(selected, available);
  const allSelected = selectedKeys.length === available.length && available.length > 0;

  const generateReport = async () => {
    if (!selectedKeys.length) return;
    setLoading(true);
    try {
      const result = await base44.functions.invoke('getComprehensiveReport', {
        npi,
        provider_id: providerId,
        sections: selectedKeys,
      });
      const report = result?.data ?? result;
      setModel(buildReportModel(report, selectedKeys, { npi, providerId, facilityName }));
      setCollapsedSections(new Set());
    } catch (error) {
      toast.error(error?.message || 'Unable to generate this report.');
    } finally {
      setLoading(false);
    }
  };

  const toggleSection = (key) => {
    setSelected((current) => current.includes(key)
      ? current.filter((item) => item !== key)
      : orderedSelection([...current, key], available));
  };

  const exportReport = async (kind) => {
    if (!model) return;
    setExporting(true);
    try {
      const quota = await countExport();
      if (!quota?.ok) {
        toast.error(quota?.message || 'Unable to export this report.');
        return;
      }
      if (kind === 'print') {
        setPrintModel(model);
      } else {
        await downloadReportPdf(model);
        toast.success('Report downloaded.');
      }
    } catch {
      toast.error(kind === 'print' ? 'Unable to print this report.' : 'Unable to download this report.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Comprehensive Intelligence Report</CardTitle>
          <p className="text-sm text-slate-400">Choose the sections to include in this report.</p>
        </CardHeader>
        <CardContent className="space-y-5">
          {available.length === 0 ? (
            <p className="text-sm text-slate-400">Select a provider or facility to generate a report.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-slate-300">{selectedKeys.length} of {available.length} sections selected</p>
                <div className="flex gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setSelected(available.map((section) => section.key))}>Select all</Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setSelected([])}>Clear</Button>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {available.map((section, index) => {
                  const checked = selectedKeys.includes(section.key);
                  const labelId = `${id}-section-${index}`;
                  return (
                    <button
                      key={section.key}
                      id={`${id}-checkbox-${index}`}
                      type="button"
                      role="checkbox"
                      aria-checked={checked}
                      aria-labelledby={labelId}
                      onClick={() => toggleSection(section.key)}
                      className="flex min-h-11 items-start gap-3 rounded-md border border-slate-700 bg-slate-900/40 p-3 text-left hover:border-cyan-500/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
                    >
                      <span aria-hidden="true" className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-xs ${checked ? 'border-cyan-600 bg-cyan-700 text-white' : 'border-slate-500'}`}>
                        {checked ? '✓' : ''}
                      </span>
                      <span>
                        <span id={labelId} className="block text-sm font-medium text-slate-200">{section.label}</span>
                        <span className="mt-1 block text-xs text-slate-400">{section.description}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <Button type="button" onClick={generateReport} disabled={!selectedKeys.length || loading}>
                {loading ? 'Generating…' : allSelected ? 'Generate Full Report' : `Generate Report (${selectedKeys.length} sections)`}
              </Button>
            </>
          )}
          {model && (
            <div className="border-t border-slate-700 pt-5">
              <ReportResults
                model={model}
                onPrint={() => exportReport('print')}
                onDownload={() => exportReport('pdf')}
                exporting={exporting}
                collapsed={collapsedSections}
                id={id}
                onToggleSection={(key) => setCollapsedSections((current) => {
                  const next = new Set(current);
                  if (next.has(key)) next.delete(key);
                  else next.add(key);
                  return next;
                })}
              />
            </div>
          )}
        </CardContent>
      </Card>
      {printModel && createPortal(
        <div className="cm-print-root"><ReportDocument model={printModel} /></div>,
        document.body,
      )}
      {exporting && <span className="sr-only" role="status">Preparing report export</span>}
    </>
  );
}
