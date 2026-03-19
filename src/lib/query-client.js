import { QueryClient } from '@tanstack/react-query';


export const queryClientInstance = new QueryClient({
        defaultOptions: {
                queries: {
                        refetchOnWindowFocus: false,
                        retry: 1,
                },
                mutations: {
                        onError: (error) => {
                                console.error('[Mutation Error]', error?.message || error);
                        },
                },
        },
});