import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { ShieldCheck } from 'lucide-react';

export default function ActiveRulesBadge({ importType }) {
  const { data: rules = [] } = useQuery({
    queryKey: ['validationRules'],
    queryFn: () => base44.entities.ImportValidationRule.list('-created_date', 200),
    staleTime: 60000,
  });

  const activeCount = rules.filter(r =>
    r.enabled !== false && (r.import_type === importType || r.import_type === '_global')
  ).length;

  if (activeCount === 0) return null;

  return (
    <Badge className="bg-violet-500/15 text-violet-400 text-[10px] gap-1">
      <ShieldCheck className="w-2.5 h-2.5" />
      {activeCount} validation rule{activeCount !== 1 ? 's' : ''}
    </Badge>
  );
}