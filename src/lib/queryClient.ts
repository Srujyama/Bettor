/**
 * TanStack Query is the single source of truth for server state. Firestore
 * onSnapshot listeners push into the query cache (see hooks/useFirestoreQuery)
 * so live data flows through React Query's dedupe/retry/optimistic machinery.
 *
 * Cache is persisted to AsyncStorage for an instant cold-start feed — EXCEPT
 * wallet/settlement queries, which carry a short staleTime and are excluded
 * from persistence so we never show stale money.
 */

import { QueryClient } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 1000 * 60 * 60 * 24,
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});

export const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'chipd-rq-cache',
  // Never persist money — wallet/ledger/settlement must be fresh from the server.
  serialize: (client) => JSON.stringify(client),
  deserialize: (s) => JSON.parse(s),
});

/** Query keys that must never be read from a persisted (possibly stale) cache. */
export const VOLATILE_KEYS = ['wallet', 'ledger', 'settlement'];

export const persistOptions = {
  persister: asyncStoragePersister,
  maxAge: 1000 * 60 * 60 * 24,
  dehydrateOptions: {
    shouldDehydrateQuery: (query: { queryKey: readonly unknown[] }) =>
      !VOLATILE_KEYS.includes(String(query.queryKey[0])),
  },
};
