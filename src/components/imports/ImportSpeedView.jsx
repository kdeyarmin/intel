import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { format } from 'date-fns';
import { AlertCircle, Zap } from 'lucide-react';
import EnhancedErrorReport from './EnhancedErrorReport';

export default function ImportSpeedView({ batches, onRefresh }) {
  const [errorReportBatch, setErrorReportBatch] = useState(null);

  // Calculate speed data
  const speedData = useMemo(() => {
    // filter batches that have some rows and created/updated dates
    const validBatches = batches.filter(b => (b.imported_rows || 0) > 0 && b.created_date && (b.completed_at || b.updated_date));
    
    // sort chronological
    validBatches.sort((a, b) => new Date(a.created_date) - new Date(b.created_date));

    return validBatches.map(b => {
      const start = new Date(b.created_date);
      const end = new Date(b.completed_at || b.updated_date);
      const diffMinutes = Math.max(0.1, (end - start) / 60000); // prevent div by zero
      const speed = Math.round(b.imported_rows / diffMinutes);
      
      return {
        name: format(start, 'MMM d, HH:mm'),
        speed: speed,
        importType: b.import_type,
        rows: b.imported_rows,
        minutes: diffMinutes.toFixed(1)
      };
    }).slice(-50); // Last 50 runs
  }, [batches]);

  // Last 10 failed batches
  const failedBatches = useMemo(() => {
    return batches
      .filter(b => b.status === 'failed')
      .sort((a, b) => new Date(b.created_date) - new Date(a.created_date))
      .slice(0, 10);
  }, [batches]);

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-slate-800 border border-slate-700 p-3 rounded shadow-xl text-xs">
          <p className="font-semibold text-slate-200 mb-1">{data.name}</p>
          <p className="text-cyan-400">Speed: {data.speed.toLocaleString()} rows/min</p>
          <p className="text-slate-400">Type: {data.importType}</p>
          <p className="text-slate-400">Rows: {data.rows.toLocaleString()}</p>
          <p className="text-slate-400">Time: {data.minutes} min</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      <Card className="bg-[#141d30] border-slate-700/50">
        <CardHeader>
          <CardTitle className="text-slate-200 flex items-center gap-2">
            <Zap className="w-5 h-5 text-yellow-400" />
            Processing Speed (Rows / Minute)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {speedData.length === 0 ? (
            <div className="text-center py-8 text-slate-500">No speed data available yet.</div>
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={speedData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tick={{fill: '#94a3b8'}} tickMargin={10} />
                  <YAxis stroke="#94a3b8" fontSize={10} tick={{fill: '#94a3b8'}} tickFormatter={(val) => val.toLocaleString()} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line 
                    type="monotone" 
                    dataKey="speed" 
                    stroke="#22d3ee" 
                    strokeWidth={2}
                    dot={{ fill: '#0891b2', strokeWidth: 2, r: 4 }}
                    activeDot={{ r: 6, fill: '#22d3ee' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-[#141d30] border-slate-700/50">
        <CardHeader>
          <CardTitle className="text-slate-200 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-400" />
            Last 10 Failed Batches
          </CardTitle>
        </CardHeader>
        <CardContent>
          {failedBatches.length === 0 ? (
            <div className="text-center py-8 text-slate-500">No failed batches found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-slate-400 uppercase bg-slate-800/50">
                  <tr>
                    <th className="px-4 py-3 font-medium">Batch File</th>
                    <th className="px-4 py-3 font-medium">Import Type</th>
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {failedBatches.map(batch => (
                    <tr key={batch.id} className="hover:bg-slate-800/30">
                      <td className="px-4 py-3 font-medium text-slate-200">{batch.file_name}</td>
                      <td className="px-4 py-3 text-slate-400">{batch.import_type}</td>
                      <td className="px-4 py-3 text-slate-400">
                        {format(new Date(batch.created_date), 'MMM d, yyyy HH:mm')}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20"
                          onClick={() => setErrorReportBatch(batch)}
                        >
                          View Logs
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <EnhancedErrorReport
        batch={errorReportBatch}
        open={!!errorReportBatch}
        onOpenChange={(open) => { if (!open) setErrorReportBatch(null); }}
        onRefresh={onRefresh}
      />
    </div>
  );
}