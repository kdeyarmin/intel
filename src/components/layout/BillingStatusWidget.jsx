import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Play, Pause, CreditCard, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export default function BillingStatusWidget({ sidebarOpen }) {
  const [isActive, setIsActive] = useState(false);
  const [loading, setLoading] = useState(true);

  // Mock credits data representing nearing limit
  const credits = {
    used: 4950,
    total: 5000,
  };
  const percentage = (credits.used / credits.total) * 100;
  const isLow = percentage >= 90;

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const configs = await base44.entities.ImportScheduleConfig.filter({});
        const active = configs.some(c => c.is_active);
        setIsActive(active);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchStatus();
  }, []);

  const toggleImports = async () => {
    setLoading(true);
    try {
      const configs = await base44.entities.ImportScheduleConfig.filter({});
      const newState = !isActive;
      
      await Promise.all(configs.map(c => 
        base44.entities.ImportScheduleConfig.update(c.id, { is_active: newState })
      ));
      
      setIsActive(newState);
      toast.success(newState ? 'Scheduled imports resumed' : 'Scheduled imports paused');
    } catch (_err) {
      toast.error('Failed to toggle imports');
    } finally {
      setLoading(false);
    }
  };

  if (!sidebarOpen) {
    return (
      <div className="flex justify-center p-3 border-t border-slate-800/60">
        <CreditCard className={`w-5 h-5 ${isLow ? 'text-red-400' : 'text-slate-400'}`} />
      </div>
    );
  }

  return (
    <div className="mx-2 mb-3 mt-2 p-3 rounded-xl bg-slate-800/30 border border-slate-700/50 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
          <CreditCard className="w-3.5 h-3.5" />
          API Credits
        </span>
        {isLow && <AlertCircle className="w-3.5 h-3.5 text-red-400" />}
      </div>
      
      <div className="mb-4">
        <div className="flex justify-between text-xs mb-1.5">
          <span className={`font-semibold ${isLow ? 'text-red-400' : 'text-slate-200'}`}>
            {credits.total - credits.used} left
          </span>
          <span className="text-slate-500 font-medium">{credits.total} total</span>
        </div>
        <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden">
          <div 
            className={`h-full rounded-full ${isLow ? 'bg-red-500' : 'bg-cyan-500'}`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>

      <div className="pt-3 border-t border-slate-700/50">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-[11px] text-slate-400 font-medium">Auto-Imports</span>
          <span className={`text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wider font-bold ${isActive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
            {isActive ? 'Running' : 'Paused'}
          </span>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          className={`w-full h-8 text-[11px] font-medium border-slate-700 hover:bg-slate-700/50 ${isActive ? 'text-amber-400 hover:text-amber-300' : 'text-emerald-400 hover:text-emerald-300'}`}
          onClick={toggleImports}
          disabled={loading}
        >
          {isActive ? (
            <><Pause className="w-3.5 h-3.5 mr-1.5" /> Pause All</>
          ) : (
            <><Play className="w-3.5 h-3.5 mr-1.5" /> Resume All</>
          )}
        </Button>
      </div>
    </div>
  );
}