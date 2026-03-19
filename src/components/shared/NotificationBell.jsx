import React, { useState, useRef, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Bell, AlertTriangle, CheckCircle2, XCircle, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try { return JSON.parse(localStorage.getItem('dismissedNotifs') || '[]'); } catch { return []; }
  });
  const panelRef = useRef(null);

  const { data: alerts = [] } = useQuery({
    queryKey: ['notifAlerts'],
    queryFn: () => base44.entities.DataQualityAlert.filter({ status: 'new' }, '-created_date', 10),
    staleTime: 60000,
  });

  const { data: recentBatches = [] } = useQuery({
    queryKey: ['notifBatches'],
    queryFn: () => base44.entities.ImportBatch.list('-created_date', 10),
    staleTime: 30000,
  });

  useEffect(() => {
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const batchNotifs = recentBatches
    .filter(b => (b.status === 'completed' || b.status === 'failed') && !dismissed.includes(b.id))
    .slice(0, 5)
    .map(b => ({
      id: b.id,
      type: b.status === 'completed' ? 'success' : 'error',
      icon: b.status === 'completed' ? CheckCircle2 : XCircle,
      title: `Import ${b.status}`,
      desc: b.file_name || b.import_type,
      time: b.completed_at || b.updated_date,
      page: 'ImportMonitoring',
    }));

  const alertNotifs = alerts
    .filter(a => !dismissed.includes(a.id))
    .slice(0, 5)
    .map(a => ({
      id: a.id,
      type: 'warning',
      icon: AlertTriangle,
      title: a.title,
      desc: a.description?.substring(0, 80),
      time: a.created_date,
      page: 'DataQuality',
    }));

  const allNotifs = [...alertNotifs, ...batchNotifs]
    .sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0))
    .slice(0, 8);

  const unreadCount = allNotifs.length;

  const dismiss = (id) => {
    const next = [...dismissed, id];
    setDismissed(next);
    localStorage.setItem('dismissedNotifs', JSON.stringify(next));
  };

  const iconColors = {
    success: 'text-emerald-400',
    error: 'text-red-400',
    warning: 'text-amber-400',
  };

  const timeAgo = (ts) => {
    if (!ts) return '';
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(!open)}
        className="relative p-1.5 rounded-lg text-slate-500 hover:text-cyan-400 hover:bg-slate-800/60 transition-colors"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] flex items-center justify-center font-bold">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-[#0b1120] border border-slate-700/60 rounded-xl shadow-2xl z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-700/50 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-200">Notifications</span>
            {allNotifs.length > 0 && (
              <button
                onClick={() => {
                  const ids = allNotifs.map(n => n.id);
                  const next = [...dismissed, ...ids];
                  setDismissed(next);
                  localStorage.setItem('dismissedNotifs', JSON.stringify(next));
                }}
                className="text-[10px] text-slate-500 hover:text-cyan-400"
              >
                Clear all
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {allNotifs.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-600">No new notifications</div>
            ) : (
              allNotifs.map(n => {
                const Icon = n.icon;
                return (
                  <div key={n.id} className="flex items-start gap-2.5 px-4 py-3 hover:bg-slate-800/40 border-b border-slate-800/30 group">
                    <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${iconColors[n.type]}`} />
                    <Link to={createPageUrl(n.page)} onClick={() => setOpen(false)} className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-200">{n.title}</p>
                      {n.desc && <p className="text-[10px] text-slate-500 truncate">{n.desc}</p>}
                      <p className="text-[9px] text-slate-600 mt-0.5">{timeAgo(n.time)}</p>
                    </Link>
                    <button onClick={() => dismiss(n.id)} className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-slate-400">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}