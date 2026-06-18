import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Clock } from 'lucide-react';
import { formatShortDateTimeET } from '../utils/dateUtils';

export default function RecentActivityCard({ events = [], loading = false }) {
  return (
    <Card className="bg-[#141d30] border-slate-700/50 shadow-lg shadow-black/10">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold text-white flex items-center gap-2">
          <Clock className="w-4 h-4 text-violet-400" />
          Recent Activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3 py-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-start gap-3 p-2.5">
                <div className="w-2 h-2 rounded-full bg-slate-700 mt-1.5 animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-slate-700/50 rounded animate-pulse w-3/4" />
                  <div className="h-3 bg-slate-700/30 rounded animate-pulse w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : events.length === 0 ? (
          <p className="text-slate-400 text-center py-8 text-sm">No recent activity</p>
        ) : (
          <div className="space-y-1">
            {events.slice(0, 5).map((event, idx) => (
              <div key={event.id} className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-slate-700/30 transition-colors">
                 <div className="relative mt-1.5">
                   <div className="w-2 h-2 rounded-full bg-cyan-400" />
                   {idx < Math.min(events.length, 5) - 1 && (
                     <div className="absolute top-2.5 left-[3px] w-px h-8 bg-slate-700" />
                   )}
                 </div>
                 <div className="flex-1 min-w-0">
                   <p className="text-base font-medium text-white capitalize truncate">
                     {event.event_type?.replace(/_/g, ' ')}
                   </p>
                   <p className="text-sm text-slate-400 mt-0.5">
                     {event.user_email?.split('@')[0]} • {event.created_date ? formatShortDateTimeET(event.created_date) : ''}
                   </p>
                 </div>
               </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}