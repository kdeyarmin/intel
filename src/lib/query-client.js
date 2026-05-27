import { QueryClient, QueryCache, MutationCache } from '@tanstack/react-query';
import { toast } from 'sonner';

// Surface failures to the user instead of swallowing them. Historically only a
// couple of pages handled query/mutation errors, so most failures were silent
// (and sonner's Toaster wasn't even mounted). These global cache handlers show a
// toast for any failed query/mutation, with light de-duplication so a polling
// query that keeps failing doesn't spam the screen.
const lastShown = new Map();
function notifyError(error, { kind }) {
        // Auth failures are handled by the auth layer (redirect to login); don't toast.
        if (error?.status === 401) return;
        const message = error?.message || 'Something went wrong. Please try again.';
        // Queries refetch/poll, so suppress repeats of the same message for a
        // while; mutations are explicit user actions, so only guard against the
        // double-fire of a single click.
        const windowMs = kind === 'query' ? 60_000 : 3_000;
        const now = Date.now();
        const key = `${kind}:${message}`;
        if (now - (lastShown.get(key) || 0) < windowMs) return;
        lastShown.set(key, now);
        toast.error(message);
}

export const queryClientInstance = new QueryClient({
        queryCache: new QueryCache({
                onError: (error) => {
                        console.error('[Query Error]', error?.message || error);
                        notifyError(error, { kind: 'query' });
                },
        }),
        mutationCache: new MutationCache({
                onError: (error) => {
                        console.error('[Mutation Error]', error?.message || error);
                        notifyError(error, { kind: 'mutation' });
                },
        }),
        defaultOptions: {
                queries: {
                        refetchOnWindowFocus: false,
                        retry: 1,
                        // Treat data as fresh for 30s so navigating between pages doesn't
                        // refetch every large list on each mount. Pages that need tighter
                        // freshness still override staleTime / refetchInterval locally.
                        staleTime: 30_000,
                },
        },
});
