/**
 * Prediction-market mutations. Each wraps a callable Cloud Function (`fns.*`) in
 * a React Query `useMutation`. The client NEVER computes or writes money: these
 * only send a validated payload; the server-written market/position/balance state
 * flows back through the live read hooks in `@/hooks/data` (useMarket /
 * useMarketPosition / useWallet). On success/error we fire a toast and invalidate
 * the affected query keys so cold reads refetch.
 *
 * Reads (useMarkets / useMarket / useMarketPosition / useMyPositions) live in the
 * Discovery track's `@/hooks/data` — assume they exist.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { fns } from '@/lib/firebase';
import type {
  CreateMarketPayload,
  TradeMarketPayload,
} from '@/shared/schemas-markets';

function errorMessage(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === 'string') return e;
  return 'Something went wrong. Try again.';
}

function toastError(title: string, e: unknown) {
  toast({ title, message: errorMessage(e), preset: 'error', haptic: 'error' });
}

function toastDone(title: string, message?: string) {
  toast({ title, message, preset: 'done', haptic: 'success' });
}

/** Create a new YES/NO prediction market. Build the payload with makeIdempotencyKey(). */
export function useCreateMarket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateMarketPayload) => fns.createMarket(payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['markets'] });
      void qc.invalidateQueries({ queryKey: ['wallet'] });
      toastDone('Market created', 'Trading is open. Chips have no cash value.');
    },
    onError: (e) => toastError("Couldn't create market", e),
  });
}

/** Buy or sell YES/NO shares against the AMM. */
export function useTradeMarket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: TradeMarketPayload) => fns.tradeMarket(payload),
    onSuccess: (_res, payload) => {
      void qc.invalidateQueries({ queryKey: ['market', payload.marketId] });
      void qc.invalidateQueries({ queryKey: ['marketPosition', payload.marketId] });
      void qc.invalidateQueries({ queryKey: ['myPositions'] });
      void qc.invalidateQueries({ queryKey: ['wallet'] });
      void qc.invalidateQueries({ queryKey: ['ledger'] });
      toastDone(
        payload.action === 'buy' ? 'Shares bought' : 'Shares sold',
        'Good luck. Chips have no cash value.',
      );
    },
    onError: (e) => toastError("Couldn't complete trade", e),
  });
}

/** Admin/oracle resolution of a market (pays winning shares 100 Chips each). */
export function useResolveMarket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { marketId: string; resolution: 'yes' | 'no' }) =>
      fns.resolveMarket(input),
    onSuccess: (_res, input) => {
      void qc.invalidateQueries({ queryKey: ['market', input.marketId] });
      void qc.invalidateQueries({ queryKey: ['marketPosition', input.marketId] });
      void qc.invalidateQueries({ queryKey: ['markets'] });
      toastDone('Market resolved', 'Winning shares have been paid out.');
    },
    onError: (e) => toastError("Couldn't resolve market", e),
  });
}
