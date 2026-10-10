import { describe, it, expect, vi, beforeEach } from 'vitest';

const { invoke, toastMock } = vi.hoisted(() => ({
  invoke: vi.fn(),
  toastMock: { info: vi.fn(), error: vi.fn() },
}));

vi.mock('@/api/base44Client', () => ({ base44: { functions: { invoke: (...a) => invoke(...a) } } }));
vi.mock('sonner', () => ({ toast: toastMock }));

import { FunctionError, invokeOrThrow, toastFunctionError } from '../src/api/functionResult';

beforeEach(() => vi.clearAllMocks());

describe('invokeOrThrow', () => {
  it('returns the data of a successful call', async () => {
    invoke.mockResolvedValue({ data: { success: true, sent: 3 } });
    await expect(invokeOrThrow('sendCampaignMessages', { campaign_id: 1 })).resolves.toEqual({ success: true, sent: 3 });
    expect(invoke).toHaveBeenCalledWith('sendCampaignMessages', { campaign_id: 1 });
  });

  it('passes through responses without a success flag', async () => {
    invoke.mockResolvedValue({ data: { providers: [] } });
    await expect(invokeOrThrow('searchProviders')).resolves.toEqual({ providers: [] });
  });

  it('throws a not-configured FunctionError for stubbed features', async () => {
    invoke.mockResolvedValue({ data: { success: false, notConfigured: true, error: "Network analysis isn't available yet." } });
    const err = await invokeOrThrow('analyzeProviderNetwork').catch((e) => e);
    expect(err).toBeInstanceOf(FunctionError);
    expect(err.notConfigured).toBe(true);
    expect(err.message).toBe("Network analysis isn't available yet.");
    expect(err.functionName).toBe('analyzeProviderNetwork');
  });

  it('throws an ordinary FunctionError for other failures', async () => {
    invoke.mockResolvedValue({ data: { success: false, error: 'Scan failed' } });
    const err = await invokeOrThrow('runDataQualityScan').catch((e) => e);
    expect(err.notConfigured).toBe(false);
    expect(err.message).toBe('Scan failed');
  });
});

describe('toastFunctionError', () => {
  it('uses an info toast for not-configured features', () => {
    toastFunctionError(new FunctionError('x', { notConfigured: true, error: 'Not yet.' }));
    expect(toastMock.info).toHaveBeenCalledWith('Not yet.');
    expect(toastMock.error).not.toHaveBeenCalled();
  });

  it('uses an error toast otherwise, with a fallback message', () => {
    toastFunctionError(new Error(''), 'Fallback');
    expect(toastMock.error).toHaveBeenCalledWith('Fallback');
  });
});
