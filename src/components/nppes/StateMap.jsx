import React, { useMemo } from 'react';

// Simplified US state positions for a grid-based map layout
const STATE_POSITIONS = {
  AK: [0, 0], HI: [0, 6],
  WA: [1, 0], MT: [1, 1], ND: [1, 2], MN: [1, 3], WI: [1, 4], MI: [1, 6],
  OR: [2, 0], ID: [2, 1], SD: [2, 2], IA: [2, 3], IL: [2, 4], IN: [2, 5], OH: [2, 6], PA: [2, 7], NY: [2, 8], VT: [2, 9], NH: [2, 10], ME: [2, 11],
  CA: [3, 0], NV: [3, 1], WY: [3, 2], NE: [3, 3], MO: [3, 4], KY: [3, 5], WV: [3, 6], VA: [3, 7], MD: [3, 8], NJ: [3, 9], CT: [3, 10], MA: [3, 11],
  UT: [4, 1], CO: [4, 2], KS: [4, 3], AR: [4, 4], TN: [4, 5], NC: [4, 6], SC: [4, 7], DE: [4, 8], RI: [4, 10],
  AZ: [5, 1], NM: [5, 2], OK: [5, 3], LA: [5, 4], MS: [5, 5], AL: [5, 6], GA: [5, 7], DC: [5, 8],
  TX: [6, 2], FL: [6, 7],
};

const STATUS_COLORS = {
  active:     { bg: '#0d9488', text: '#fff', border: '#0f766e' },
  completed:  { bg: '#22c55e', text: '#fff', border: '#16a34a' },
  failed:     { bg: '#ef4444', text: '#fff', border: '#dc2626' },
  processing: { bg: '#f59e0b', text: '#fff', border: '#d97706' },
  pending:    { bg: '#1e293b', text: '#64748b', border: '#334155' },
};

export default function StateMap({ status, currentState, running, autoMode, onStateClick }) {
  const completedSet = useMemo(() => new Set(status?.completed_states || []), [status]);
  const failedSet = useMemo(() => new Set(status?.failed_states || []), [status]);
  const processingSet = useMemo(() => new Set(status?.processing_states || []), [status]);

  const getStateStatus = (st) => {
    if (st === currentState && (running || autoMode)) return 'active';
    if (processingSet.has(st)) return 'processing';
    if (completedSet.has(st)) return 'completed';
    if (failedSet.has(st)) return 'failed';
    return 'pending';
  };

  // Get provider count from status data
  const getProviderCount = (st) => {
    if (!status?.state_details) return null;
    const detail = status.state_details[st];
    return detail?.imported_rows || detail?.valid_rows || null;
  };

  const maxRow = 7;
  const maxCol = 12;

  return (
    <div className="w-full">
      <div 
        className="grid gap-1.5 w-full"
        style={{ gridTemplateColumns: `repeat(${maxCol + 1}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: (maxRow) * (maxCol + 1) }).map((_, idx) => {
          const row = Math.floor(idx / (maxCol + 1));
          const col = idx % (maxCol + 1);
          
          const stateEntry = Object.entries(STATE_POSITIONS).find(
            ([, pos]) => pos[0] === row && pos[1] === col
          );

          if (!stateEntry) return <div key={idx} />;

          const [st] = stateEntry;
          const stStatus = getStateStatus(st);
          const colors = STATUS_COLORS[stStatus];
          const count = getProviderCount(st);

          return (
            <div
              key={st}
              onClick={() => onStateClick?.(st)}
              className="aspect-square rounded-md cursor-pointer flex flex-col items-center justify-center transition-all hover:scale-110 hover:z-10 hover:shadow-lg relative group"
              style={{ 
                backgroundColor: colors.bg, 
                border: `2px solid ${colors.border}`,
                color: colors.text 
              }}
              title={`${st}: ${stStatus}${count ? ` (${count.toLocaleString()} providers)` : ''}`}
            >
              <span className="text-[10px] sm:text-xs font-bold leading-none">{st}</span>
              {count && (
                <span className="text-[7px] sm:text-[8px] opacity-75 leading-none mt-0.5">
                  {count >= 1000 ? `${Math.round(count / 1000)}k` : count}
                </span>
              )}
              {stStatus === 'active' && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-teal-400 rounded-full animate-ping" />
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 mt-4 text-xs">
        {[
          { key: 'completed', label: 'Completed', count: completedSet.size },
          { key: 'processing', label: 'Processing', count: processingSet.size },
          { key: 'failed', label: 'Failed', count: failedSet.size },
          { key: 'pending', label: 'Pending', count: 51 - completedSet.size - failedSet.size - processingSet.size },
        ].map(item => (
          <div key={item.key} className="flex items-center gap-1.5">
            <div 
              className="w-3 h-3 rounded-sm" 
              style={{ backgroundColor: STATUS_COLORS[item.key].bg, border: `1px solid ${STATUS_COLORS[item.key].border}` }} 
            />
            <span className="text-slate-400">{item.label}</span>
            <span className="text-slate-500 font-medium">({item.count})</span>
          </div>
        ))}
      </div>
    </div>
  );
}