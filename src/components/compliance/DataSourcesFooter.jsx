import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Database } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { freshnessSentence, summarizeFreshness } from '@/lib/dataFreshnessSummary';

/**
 * One line under a page's data: which public sources it draws on and how
 * current they are (from getDataFreshness), and what the numbers are not.
 */
export default function DataSourcesFooter() {
  const { data } = useQuery({
    queryKey: ['dataFreshness'],
    queryFn: async () => (await base44.functions.invoke('getDataFreshness', {})).data,
    staleTime: 5 * 60 * 1000,
  });
  const sentence = freshnessSentence(data ? summarizeFreshness(data) : null);
  return (
    <p className="mt-6 flex items-start gap-1.5 text-[11px] leading-relaxed text-slate-400">
      <Database className="w-3 h-3 mt-0.5 shrink-0" aria-hidden="true" />
      <span>
        {sentence} Figures are CareMetric Intel analytics derived from public data, not CMS publications; CMS suppresses counts under 11, and shared-patient patterns are not confirmed referrals.{' '}
        <Link to="/Help" className="text-cyan-400 hover:underline">What data is this and how fresh is it?</Link>
      </span>
    </p>
  );
}
