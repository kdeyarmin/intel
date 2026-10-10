import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Brain, TrendingUp } from 'lucide-react';

export default function FeedbackStatsCard({ matches }) {
  const decided = matches.filter(m => m.status !== 'suggested');
  const approved = matches.filter(m => m.status === 'approved');
  const rejected = matches.filter(m => m.status === 'rejected');
  const overrides = matches.filter(m => m.status === 'override');

  if (decided.length === 0) return null;

  const approvalRate = decided.length ? Math.round((approved.length / decided.length) * 100) : 0;

  const avgApprovedConf = approved.length
    ? Math.round(approved.reduce((s, m) => s + (m.confidence_score || 0), 0) / approved.length)
    : 0;
  const avgRejectedConf = rejected.length
    ? Math.round(rejected.reduce((s, m) => s + (m.confidence_score || 0), 0) / rejected.length)
    : 0;

  return (
    <Card className="mb-6 bg-slate-700/40 border-slate-700/50">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Brain className="w-4 h-4 text-purple-400" />
          <span className="text-sm font-semibold text-slate-200">Review decisions</span>
          <Badge className="bg-purple-900/30 text-purple-400 text-xs">{decided.length} decisions</Badge>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-slate-400">Approval Rate</p>
            <p className={`text-lg font-bold ${approvalRate >= 70 ? 'text-green-400' : approvalRate >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>
              {approvalRate}%
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Avg Approved Conf.</p>
            <p className="text-lg font-bold text-green-400">{avgApprovedConf}%</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Avg Rejected Conf.</p>
            <p className="text-lg font-bold text-red-400">{avgRejectedConf}%</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Manual Overrides</p>
            <div className="flex items-center gap-1">
              <p className="text-lg font-bold text-blue-400">{overrides.length}</p>
              {overrides.length > 0 && <TrendingUp className="w-3 h-3 text-blue-500" />}
            </div>
          </div>
        </div>
        <p className="text-xs text-slate-400 mt-3">
          These {decided.length} decisions are kept: rejected matches won't be suggested again on the next run.
        </p>
      </CardContent>
    </Card>
  );
}