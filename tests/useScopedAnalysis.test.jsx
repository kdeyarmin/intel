// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useScopedAnalysis } from '../src/components/referralNetwork/useScopedAnalysis';

const deferred = () => {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
};

describe('useScopedAnalysis', () => {
  it("drops a response that arrives after the State filter changed", async () => {
    const { result, rerender } = renderHook(({ scope }) => useScopedAnalysis(scope), { initialProps: { scope: 'PA' } });
    const pa = deferred();
    let pending;
    act(() => { pending = result.current.run(() => pa.promise, vi.fn()); });
    expect(result.current.loading).toBe(true);

    rerender({ scope: 'OH' });
    expect(result.current.loading).toBe(false);
    await act(async () => { pa.resolve({ state: 'PA' }); await pending; });
    expect(result.current.data).toBeNull();
  });

  it('keeps only the newest of overlapping requests', async () => {
    const onError = vi.fn();
    const { result } = renderHook(() => useScopedAnalysis('PA'));
    const first = deferred();
    const second = deferred();
    let a; let b;
    act(() => { a = result.current.run(() => first.promise, onError); });
    act(() => { b = result.current.run(() => second.promise, onError); });
    await act(async () => { second.resolve('new'); await b; });
    await act(async () => { first.resolve('old'); await a; });
    expect(result.current.data).toBe('new');
    expect(result.current.loading).toBe(false);
  });
});
