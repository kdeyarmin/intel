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
          <Brain className="w-4 h-4 text-purple-600" />
          <span className="text-sm font-semibold text-slate-200">AI Learning Feedback</span>
          <Badge className="bg-purple-100 text-purple-400 text-xs">{decided.length} decisions</Badge>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-slate-400">Approval Rate</p>
            <p className={`text-lg font-bold ${approvalRate >= 70 ? 'text-green-600' : approvalRate >= 40 ? 'text-yellow-600' : 'text-red-600'}`}>
              {approvalRate}%
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Avg Approved Conf.</p>
            <p className="text-lg font-bold text-green-600">{avgApprovedConf}%</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Avg Rejected Conf.</p>
            <p className="text-lg font-bold text-red-600">{avgRejectedConf}%</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Manual Overrides</p>
            <div className="flex items-center gap-1">
              <p className="text-lg font-bold text-blue-600">{overrides.length}</p>
              {overrides.length > 0 && <TrendingUp className="w-3 h-3 text-blue-500" />}
            </div>
          </div>
        </div>
        <p className="text-xs text-slate-500 mt-3">
          Next AI run will use these {decided.length} decisions to improve match quality.
        </p>
      </CardContent>
    </Card>
  );
}