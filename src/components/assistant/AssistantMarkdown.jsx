import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Link } from 'react-router-dom';

function hostOf(href) {
  try {
    return new URL(href).host;
  } catch {
    return '';
  }
}

/**
 * App pages open in place; outside links open in a new tab and always show
 * where they go. Anything else (javascript:, data:, mailto:) renders as text.
 */
function AssistantLink({ href = '', children }) {
  if (href.startsWith('/') && !href.startsWith('//')) {
    return <Link to={href} className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2">{children}</Link>;
  }
  if (/^https?:\/\//i.test(href)) {
    const host = hostOf(href);
    return (
      <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2">
        {children}
        {host && <span className="text-slate-400 no-underline"> ({host})</span>}
      </a>
    );
  }
  return <span>{children}</span>;
}

const COMPONENTS = {
  a: AssistantLink,
  p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
  ul: ({ children }) => <ul className="list-disc pl-5 mb-2 space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 space-y-1">{children}</ol>,
  // One level down: the page's h1 is the assistant itself.
  h1: ({ children }) => <h2 className="text-base font-semibold text-white mt-3 mb-1.5">{children}</h2>,
  h2: ({ children }) => <h3 className="text-base font-semibold text-white mt-3 mb-1.5">{children}</h3>,
  h3: ({ children }) => <h4 className="text-sm font-semibold text-white mt-3 mb-1">{children}</h4>,
  strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
  code: ({ children }) => <code className="rounded bg-slate-800 px-1 py-0.5 text-[12px] text-slate-200">{children}</code>,
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto rounded-md border border-slate-700/60">
      <table className="w-full text-xs">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="bg-slate-800/80 px-2 py-1.5 text-left font-medium text-slate-300">{children}</th>,
  td: ({ children }) => <td className="border-t border-slate-700/60 px-2 py-1.5 text-slate-300">{children}</td>,
};

/**
 * The assistant's Markdown. Images are never loaded: an image URL written by
 * the model (for example one planted in imported data) could send what's on
 * screen to another site just by being fetched.
 */
export default function AssistantMarkdown({ children }) {
  return (
    <div className="text-sm text-slate-300 break-words">
      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml disallowedElements={['img']} components={COMPONENTS}>
        {children || ''}
      </ReactMarkdown>
    </div>
  );
}
