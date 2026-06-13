/**
 * Bridges a Firestore realtime listener into the React Query cache. The query is
 * driven by onSnapshot (live), while React Query gives us suspense-free loading
 * flags, dedupe across components, and cache persistence.
 */
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { QueryConstraint } from 'firebase/firestore';
import { subscribeCollection, subscribeDoc } from '@/lib/firebase/firestore';

export function useDocQuery<T = any>(
  key: readonly unknown[],
  path: string | null,
  enabled = true,
) {
  const qc = useQueryClient();
  const active = enabled && !!path;

  useEffect(() => {
    if (!active || !path) return;
    const unsub = subscribeDoc<T>(
      path,
      (data) => qc.setQueryData(key, data),
      (e) => console.warn('[useDocQuery]', path, e.message),
    );
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, active]);

  return useQuery<T | null>({
    queryKey: key,
    queryFn: async () => null, // data arrives via the listener above
    enabled: active,
    staleTime: Infinity,
  });
}

export function useCollectionQuery<T = any>(
  key: readonly unknown[],
  path: string | null,
  constraints: QueryConstraint[],
  enabled = true,
) {
  const qc = useQueryClient();
  const active = enabled && !!path;
  const depKey = JSON.stringify(key);

  useEffect(() => {
    if (!active || !path) return;
    const unsub = subscribeCollection<T>(
      path,
      constraints,
      (data) => qc.setQueryData(key, data),
      (e) => console.warn('[useCollectionQuery]', path, e.message),
    );
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, active, depKey]);

  return useQuery<T[]>({
    queryKey: key,
    queryFn: async () => [],
    enabled: active,
    staleTime: Infinity,
    initialData: [] as T[],
  });
}
