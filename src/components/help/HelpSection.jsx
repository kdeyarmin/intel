import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowRight, ChevronDown, ChevronRight } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { createPageUrl } from '@/utils';
import { useOptionalAuth } from '@/lib/AuthContext';
import { canAccessPage, getPageLabel } from '@/components/layout/navConfig';

// Guide text writes list items as "• item" lines (they also read well in the
// PDF); turn them into Markdown list items so they render as a list.
function toMarkdown(text) {
  return text.replace(/^• /gm, '- ');
}

function highlightText(text, term) {
  if (!term) return text;
  const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return text.replace(regex, '**$1**');
}

/**
 * One collapsible guide section. `topics` defaults to all of the section's
 * topics; while searching, Help passes only the ones that match. A topic with
 * a `page` links to it when the signed-in person may open that page.
 */
/** `locked`: search keeps the section open, so the header doesn't toggle. */
export default function HelpSection({ section, topics = section.content, expanded, onToggle, searchTerm, locked = false }) {
  const Icon = section.icon;
  const user = useOptionalAuth()?.user;

  return (
    <Card id={section.id} className="bg-[#141d30] border-slate-700/50 overflow-hidden">
      <h2>
        <button
          type="button"
          onClick={onToggle}
          disabled={locked}
          aria-expanded={expanded}
          aria-controls={expanded ? `${section.id}-content` : undefined}
          className="w-full flex items-center gap-3 p-4 sm:p-5 text-left hover:bg-slate-800/30 transition-colors disabled:cursor-default disabled:hover:bg-transparent"
        >
          <Icon className={`w-5 h-5 ${section.color} shrink-0`} aria-hidden="true" />
          <span className="flex-1 text-sm sm:text-base font-semibold text-slate-200">{section.title}</span>
          <span className="text-[10px] text-slate-400 mr-2">
            {topics.length === section.content.length ? `${topics.length} topics` : `${topics.length} of ${section.content.length} topics`}
          </span>
          {expanded
            ? <ChevronDown className="w-4 h-4 text-slate-400" aria-hidden="true" />
            : <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          }
        </button>
      </h2>
      {expanded && (
        <CardContent id={`${section.id}-content`} className="pt-0 pb-5 px-4 sm:px-5 space-y-5 border-t border-slate-700/30">
          {topics.map((item, idx) => (
            <div key={idx} className="pl-8">
              <h3 className="text-sm font-semibold text-cyan-400 mb-2">{item.heading}</h3>
              <div className="text-sm text-slate-400 leading-relaxed prose prose-sm prose-invert max-w-none
                [&_strong]:text-slate-200 [&_strong]:font-semibold
                [&_ul]:list-disc [&_ul]:ml-4 [&_ul]:space-y-1
                [&_ol]:list-decimal [&_ol]:ml-4 [&_ol]:space-y-1
                [&_li]:text-slate-400
                [&_p]:my-1.5
              ">
                <ReactMarkdown>{toMarkdown(searchTerm ? highlightText(item.text, searchTerm) : item.text)}</ReactMarkdown>
              </div>
              {item.page && canAccessPage(item.page, user) && (
                <Link
                  to={createPageUrl(item.page)}
                  className="mt-2 inline-flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 hover:underline"
                >
                  Go to {getPageLabel(item.page)}
                  <ArrowRight className="w-3 h-3" aria-hidden="true" />
                </Link>
              )}
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  );
}