import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';

/**
 * A backend function that answered `{ success: false, ... }`. `notConfigured`
 * marks features with no server implementation (or missing credentials), which
 * the UI should present as "not available yet" rather than as an error.
 */
export class FunctionError extends Error {
  constructor(functionName, data) {
    super(data?.error || data?.message || 'The request could not be completed.');
    this.name = 'FunctionError';
    this.functionName = functionName;
    this.notConfigured = !!data?.notConfigured;
    this.data = data;
  }
}

/** Invoke a backend function and throw a FunctionError when it reports failure. */
export async function invokeOrThrow(functionName, payload = {}) {
  const { data } = await base44.functions.invoke(functionName, payload);
  if (data && data.success === false) throw new FunctionError(functionName, data);
  return data;
}

/** Toast an error from invokeOrThrow: info for not-configured features, error otherwise. */
export function toastFunctionError(err, fallback = 'Unable to complete the request. Please try again.') {
  if (err?.notConfigured) toast.info(err.message);
  else toast.error(err?.message || fallback);
}
