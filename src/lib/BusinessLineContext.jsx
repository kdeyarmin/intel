import React, { createContext, useContext, useMemo, useState } from 'react';
import { BUSINESS_LINES, lineProfile } from '@/lib/businessLine';

const KEY = 'caremetric_business_line';
const BusinessLineContext = createContext(null);

function storedLine() {
  try {
    const saved = localStorage.getItem(KEY);
    return BUSINESS_LINES.some((l) => l.id === saved) ? saved : 'all';
  } catch {
    return 'all';
  }
}

export function BusinessLineProvider({ children }) {
  const [line, setLineState] = useState(storedLine);
  const setLine = (id) => {
    const next = BUSINESS_LINES.some((l) => l.id === id) ? id : 'all';
    try { localStorage.setItem(KEY, next); } catch { /* private mode */ }
    setLineState(next);
  };
  const value = useMemo(() => ({ line, setLine, profile: lineProfile(line) }), [line]);
  return <BusinessLineContext.Provider value={value}>{children}</BusinessLineContext.Provider>;
}

/** Outside the provider, nothing is filtered. */
export function useBusinessLine() {
  return useContext(BusinessLineContext) || { line: 'all', setLine() {}, profile: null };
}
