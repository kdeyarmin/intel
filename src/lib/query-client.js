import { QueryClient } from '@tanstack/react-query';


export const queryClientInstance = new QueryClient({
        defaultOptions: {
                queries: {
                        refetchOnWindowFocus: false,
                        retry: 1,
                        // Treat data as fresh for 30s so navigating between pages doesn't
                        // refetch every large list on each mount. Pages that need tighter
                        // freshness still override staleTime / refetchInterval locally.
                        staleTime: 30_000,
                },
                mutations: {
                        onError: (error) => {
                                console.error('[Mutation Error]', error?.message || error);
                        },
                },
        },
});