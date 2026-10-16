import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CRM_IMPORT_FIELDS, importTemplateCsv, parseCsv, planImport, suggestMapping } from '@/lib/crmQuality';

function downloadTemplate() {
  const blob = new Blob([importTemplateCsv()], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'marketing-book-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export default function CrmImportDialog({ open, onOpenChange, accounts, contacts, onImport, busy }) {
  const [text, setText] = useState('');
  const [headers, setHeaders] = useState([]);
  const [mapping, setMapping] = useState({});

  const plan = useMemo(
    () => (text.trim() ? planImport(text, mapping, { accounts, contacts }) : null),
    [text, mapping, accounts, contacts],
  );

  const loadText = (value) => {
    setText(value);
    const table = parseCsv(value);
    const nextHeaders = (table[0] || []).map((h) => h.trim());
    setHeaders(nextHeaders);
    setMapping(suggestMapping(nextHeaders));
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    loadText(await file.text());
  };

  const close = (next) => {
    if (!next) {
      setText('');
      setHeaders([]);
      setMapping({});
    }
    onOpenChange(next);
  };

  const ready = plan && plan.errors < plan.preview.length && (plan.creates > 0 || plan.updates > 0);

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import accounts</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-slate-400">Upload a CSV or paste one. Map the columns, then review the preview. Rows that match an account already on the book update the blanks instead of creating a second account. Nothing is saved until you import.</p>
          <div className="flex flex-wrap gap-2">
            <label className="text-xs text-slate-300">
              CSV file
              <input type="file" accept=".csv,text/csv" aria-label="CSV file" onChange={onFile} className="mt-1 block text-xs text-slate-300" />
            </label>
            <Button type="button" variant="outline" size="sm" className="border-slate-700" onClick={downloadTemplate}>Download template</Button>
          </div>
          <label className="block text-xs text-slate-400" htmlFor="crm-import-paste">Or paste CSV
            <textarea id="crm-import-paste" aria-label="Paste CSV" value={text} onChange={(e) => loadText(e.target.value)} rows={4} className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" />
          </label>
          {headers.length > 0 && (
            <fieldset className="grid gap-2 sm:grid-cols-2">
              <legend className="text-xs text-slate-300 mb-1">Column mapping</legend>
              {CRM_IMPORT_FIELDS.map((field) => (
                <label key={field.id} className="block text-xs text-slate-400">
                  {field.label}{field.required ? ' *' : ''}
                  <select
                    aria-label={`Map ${field.label}`}
                    value={mapping[field.id] == null ? '' : String(mapping[field.id])}
                    onChange={(e) => setMapping((m) => ({ ...m, [field.id]: e.target.value === '' ? undefined : Number(e.target.value) }))}
                    className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100"
                  >
                    <option value="">Don&apos;t import</option>
                    {headers.map((header, i) => <option key={`${header}-${i}`} value={i}>{header || `Column ${i + 1}`}</option>)}
                  </select>
                </label>
              ))}
            </fieldset>
          )}
          {plan && (
            <div>
              <p className="text-xs text-slate-300 mb-2">{plan.creates} new, {plan.updates} already on the book, {plan.contacts} contacts, {plan.errors} need a fix.</p>
              <ul className="space-y-1 max-h-48 overflow-y-auto">
                {plan.preview.map((row) => (
                  <li key={row.line} className={`rounded border px-2 py-1 text-xs ${row.status === 'error' ? 'border-rose-500/40 text-rose-300' : 'border-slate-800 text-slate-300'}`}>
                    <span className="text-slate-500">Row {row.line}.</span> {row.record.name || '(no name)'}
                    {row.status === 'create' ? ' — new account' : ''}
                    {row.messages.length > 0 ? ` — ${row.messages.join(' ')}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => close(false)}>Cancel</Button>
          <Button type="button" className="bg-cyan-700 hover:bg-cyan-800 text-white" disabled={!ready || busy} onClick={() => onImport(plan)}>
            {busy ? 'Importing…' : 'Import ready rows'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
