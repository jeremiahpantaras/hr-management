import { QueryClient } from '@tanstack/react-query';

/**
 * The single server-state cache (D-09). Defaults follow Architecture §6: no refetch-on-focus
 * (no surprise reads), one retry, and a 60 s freshness window that individual queries override
 * (employees / leave types 5 min, ledger 30 s). Phase 2 adds the global `permission-denied`
 * handler on the query and mutation caches.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 60_000, refetchOnWindowFocus: false, retry: 1 },
      mutations: { retry: 0 },
    },
  });
}
