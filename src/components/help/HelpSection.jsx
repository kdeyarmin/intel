import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { ChevronDown, ChevronRight } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

function highlightText(text, term) {
  if (!term) return text;
  const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return text.replace(regex, '**$1**');
}

export default function HelpSection({ section, expanded, onToggle, searchTerm }) {
  const Icon = section.icon;

  return (
    <Card id={section.id} className="bg-[#141d30] border-slate-700/50 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-4 sm:p-5 text-left hover:bg-slate-800/30 transition-colors"
      >
        <Icon className={`w-5 h-5 ${section.color} shrink-0`} />
        <span className="flex-1 text-sm sm:text-base font-semibold text-slate-200">{section.title}</span>
        <span className="text-[10px] text-slate-500 mr-2">{section.content.length} topics</span>
        {expanded
          ? <ChevronDown className="w-4 h-4 text-slate-500" />
          : <ChevronRight className="w-4 h-4 text-slate-500" />
        }
      </button>
      {expanded && (
        <CardContent className="pt-0 pb-5 px-4 sm:px-5 space-y-5 border-t border-slate-700/30">
          {section.content.map((item, idx) => (
            <div key={idx} className="pl-8">
              <h4 className="text-sm font-semibold text-cyan-400 mb-2">{item.heading}</h4>
              <div className="text-sm text-slate-400 leading-relaxed prose prose-sm prose-invert max-w-none
                [&_strong]:text-slate-200 [&_strong]:font-semibold
                [&_ul]:list-disc [&_ul]:ml-4 [&_ul]:space-y-1
                [&_ol]:list-decimal [&_ol]:ml-4 [&_ol]:space-y-1
                [&_li]:text-slate-400
                [&_p]:my-1.5
              ">
                <ReactMarkdown>{searchTerm ? highlightText(item.text, searchTerm) : item.text}</ReactMarkdown>
              </div>
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  );
}