import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

/**
 * Map positions for map items that don't carry their own `coords`: the
 * server places each provider at its ZIP area's centre (or the ZIP3 area,
 * or the state) with a small, stable offset, so markers don't move between
 * loads. Returns Map<npi, { lat, lng, precision }>.
 */
export function useProviderCoords(items) {
  const points = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const item of items || []) {
      const npi = item?.provider?.npi;
      if (!npi || item.coords || seen.has(npi)) continue;
      seen.add(npi);
      out.push({ key: npi, zip: item.location?.zip || null, state: item.location?.state || null });
    }
    return out;
  }, [items]);

  const key = useMemo(() => points.map((p) => `${p.key}:${p.zip || ''}:${p.state || ''}`).join('|'), [points]);
  const { data } = useQuery({
    queryKey: ['providerCoords', key],
    queryFn: async () => (await base44.functions.invoke('getZipCoordinates', { points: points.slice(0, 2000) })).data,
    enabled: points.length > 0,
    staleTime: 60 * 60 * 1000,
  });

  return useMemo(() => {
    const m = new Map();
    for (const [npi, c] of Object.entries(data?.coords || {})) m.set(npi, c);
    return m;
  }, [data]);
}
