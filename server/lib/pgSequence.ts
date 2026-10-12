// pg 9 rejects (and pg 8 deprecates) two queries in flight on one client.
// These steps share a client, so they have to run one after another.

export async function inSequence<T extends Array<() => unknown>>(
  steps: [...T],
): Promise<{ [K in keyof T]: T[K] extends () => infer R ? Awaited<R> : never }> {
  const out: unknown[] = [];
  for (const step of steps) out.push(await step());
  return out as { [K in keyof T]: T[K] extends () => infer R ? Awaited<R> : never };
}
