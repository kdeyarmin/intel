import { useEffect, useRef, useState } from 'react';

/**
 * Result state for an analysis that belongs to one scope (the State filter).
 * Changing the scope clears the result, and a response to a request started
 * under an earlier scope, or superseded by a newer request, is dropped.
 */
export function useScopedAnalysis(scope) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const latest = useRef(0);

  useEffect(() => {
    latest.current += 1;
    setData(null);
    setLoading(false);
  }, [scope]);

  const run = async (request, onError) => {
    const id = ++latest.current;
    setLoading(true);
    try {
      const result = await request();
      if (id === latest.current) setData(result);
    } catch (error) {
      if (id === latest.current) onError(error);
    } finally {
      if (id === latest.current) setLoading(false);
    }
  };

  return { data, loading, run };
}
