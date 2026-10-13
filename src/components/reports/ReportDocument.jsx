import React from 'react';
import { CAREMETRIC_LOGO_URL, CAREMETRIC_INTEL_NAME, CAREMETRIC_INTEL_WEBSITE } from '@/lib/branding';
import { blockHasData } from './reportSections';


function Block({ block }) {
  const empty = block.kind === 'table' ? block.rows.length === 0 : block.items.length === 0;
  return (
    <section className="cm-doc-block">
      <h3 className="cm-doc-h3">
        <span>{block.title}</span>
        {block.kind === 'table' && <span className="cm-doc-count">{block.count} record{block.count === 1 ? '' : 's'}</span>}
      </h3>
      {empty ? (
        <p className="cm-doc-note">{block.emptyText || 'No data on file.'}</p>
      ) : block.kind === 'table' ? (
        <table className="cm-doc-table">
          <thead>
            <tr>
              {block.columns.map((c) => (
                <th key={c.key} scope="col" className={c.align === 'right' ? 'cm-right' : undefined}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, i) => (
              <tr key={i}>
                {block.columns.map((c) => (
                  <td key={c.key} className={c.align === 'right' ? 'cm-right' : undefined}>{row[c.key]?.text ?? ''}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <dl className="cm-doc-kv">
          {block.items.map((it) => (
            <div key={it.label}>
              <dt>{it.label}</dt>
              <dd className={it.emphasis ? 'cm-doc-emph' : undefined}>{it.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {block.note && <p className="cm-doc-note">{block.note}</p>}
    </section>
  );
}

/**
 * The printed report: a light, high-contrast document with a branded header,
 * the chosen sections and a footer naming the data sources and when it was
 * generated. Rendered only while printing (see ComprehensiveReport).
 */
export default function ReportDocument({ model }) {
  return (
    <article className="cm-report-doc" aria-label={`${model.subtitle}: ${model.title}`}>
      <header className="cm-doc-brand">
        <div className="cm-doc-brand-left">
          <img src={CAREMETRIC_LOGO_URL} alt={CAREMETRIC_INTEL_NAME} className="cm-doc-logo" />
          <div>
            <div className="cm-doc-brand-name">{CAREMETRIC_INTEL_NAME}</div>
            <div className="cm-doc-brand-tag">Healthcare Provider Intelligence</div>
          </div>
        </div>
        <div className="cm-doc-brand-right">
          <div>{model.subtitle}</div>
          <div>{CAREMETRIC_INTEL_WEBSITE}</div>
        </div>
      </header>

      <div className="cm-doc-titleblock">
        <h1 className="cm-doc-title">{model.title}</h1>
        <p className="cm-doc-meta">{model.subtitle} · Generated {model.generatedLabel}</p>
      </div>

      {model.profile && (
        <section className="cm-doc-block">
          <h2 className="cm-doc-h2">Executive Overview</h2>
          {model.profile.identifiers.length > 0 && (
            <dl className="cm-doc-kv">
              {model.profile.identifiers.map((it) => (
                <div key={it.label}>
                  <dt>{it.label}</dt>
                  <dd>{it.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {model.profile.metrics.length > 0 && (
            <div className="cm-doc-metrics">
              {model.profile.metrics.map((m) => (
                <div key={m.label} className="cm-doc-metric">
                  <div className="cm-doc-metric-label">{m.label}</div>
                  <div className="cm-doc-metric-value">{m.value}</div>
                </div>
              ))}
            </div>
          )}
          {model.profile.highlights?.length > 0 && (
            <ul className="cm-doc-highlights">
              {model.profile.highlights.map((fact) => <li key={fact}>{fact}</li>)}
            </ul>
          )}
        </section>
      )}

      {model.sections.map((section) => (
        <div key={section.key} className="cm-doc-section">
          {section.blocks.filter(blockHasData).map((block) => <Block key={block.key} block={block} />)}
        </div>
      ))}
      {model.availability?.length > 0 && (
        <section className="cm-doc-block">
          <h2 className="cm-doc-h2">Data Availability</h2>
          <p className="cm-doc-note">Not available means not linked, not loaded, or not publicly reported. It does not mean zero activity or poor performance.</p>
          <dl className="cm-doc-availability">
            {model.availability.map((item) => (
              <div key={item.label}><dt>{item.label}</dt><dd>{item.message}</dd></div>
            ))}
          </dl>
        </section>
      )}

      <footer className="cm-doc-footer">
        {model.sources.length > 0 && (
          <>
            <h2 className="cm-doc-h2">Data Sources</h2>
            <ul className="cm-doc-sources">
              {model.sources.map((s) => <li key={s}>{s}</li>)}
            </ul>
          </>
        )}
        <p className="cm-doc-attrib">{model.attribution}</p>
        <p className="cm-doc-attrib">Generated {model.generatedLabel} · {CAREMETRIC_INTEL_NAME} · {CAREMETRIC_INTEL_WEBSITE} · Confidential</p>
      </footer>
    </article>
  );
}
