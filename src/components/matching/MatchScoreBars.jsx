import React from 'react';

const BAR_COLORS = {
  specialization: 'bg-purple-500',
  proximity: 'bg-blue-500',
  referral: 'bg-teal-500',
};

export default function MatchScoreBars({ specialization, proximity, referral }) {
  const bars = [
    { label: 'Specialization', value: specialization || 0, color: BAR_COLORS.specialization },
    { label: 'Proximity', value: proximity || 0, color: BAR_COLORS.proximity },
    { label: 'Referral Pattern', value: referral || 0, color: BAR_COLORS.referral },
  ];

  return (
    <div className="space-y-2">
      {bars.map(bar => (
        <div key={bar.label} className="flex items-center gap-2">
          <span className="text-xs text-gray-500 w-24 shrink-0">{bar.label}</span>
          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${bar.color}`} style={{ width: `${bar.value}%` }} />
          </div>
          <span className="text-xs font-medium w-8 text-right">{bar.value}</span>
        </div>
      ))}
    </div>
  );
}