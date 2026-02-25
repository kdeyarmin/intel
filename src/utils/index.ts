export function createPageUrl(pageName: string) {
    return '/' + pageName.replace(/ /g, '-');
}

export async function invokeWithRetry(
    base44: any,
    funcName: string,
    params: Record<string, any>,
    options?: { maxRetries?: number; onRetry?: (msg: string) => void }
) {
    const maxRetries = options?.maxRetries ?? 4;
    let lastErr: any = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await base44.functions.invoke(funcName, params);
        } catch (err: any) {
            lastErr = err;
            const errMsg = err.response?.data?.error || err.message || '';
            const isRateLimit = errMsg.toLowerCase().includes('rate limit') || err.response?.status === 429;
            if (!isRateLimit || attempt >= maxRetries - 1) break;
            const waitMs = Math.min(2000 * Math.pow(2, attempt) + Math.random() * 1000, 15000);
            options?.onRetry?.(`Rate limited — retrying in ${Math.round(waitMs / 1000)}s (attempt ${attempt + 2}/${maxRetries})...`);
            await new Promise(r => setTimeout(r, waitMs));
        }
    }
    throw lastErr;
}