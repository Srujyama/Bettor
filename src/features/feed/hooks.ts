/**
 * Discovery-feed mutation glue. The feed lets a user trade a market or join a
 * bet in 1–2 taps WITHOUT leaving the vertical pager, so these thin hooks wrap
 * the underlying callables the Markets/Casino tracks expose and fire `burnt`
 * toasts + celebration on success. The client NEVER computes money — these only
 * send a validated payload and read back server-written state via the live read
 * hooks in `@/hooks/data`.
 *
 * `fns.tradeMarket` (Casino track owns the wrapper) and `fns.placeBet` (base)
 * are assumed to exist by name per the mega-spec; this file references them.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { fns } from '@/lib/firebase';
import { makeIdempotencyKey } from '@/shared/ids';
import { useUi } from '@/stores/ui';
import type { MarketSide } from '@/shared/markets';
import type { PlaceBetPayload } from '@/shared/schemas';

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

export interface QuickTradeInput {
  marketId: string;
  side: MarketSide;
  /** Chip budget to spend buying `side` shares. */
  budget: number;
}

/**
 * Quick one-tap market trade from the feed. Always a BUY of the chosen side with
 * a Chip budget (selling/closing is done on the full market screen). Generates a
 * fresh idempotency key per attempt so the server can de-dupe retries safely.
 */
export function useQuickTrade() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: QuickTradeInput) =>
      fns.tradeMarket({
        marketId: input.marketId,
        side: input.side,
        action: 'buy',
        amount: input.budget,
        idempotencyKey: makeIdempotencyKey(),
      }),
    onSuccess: (_res, input) => {
      void qc.invalidateQueries({ queryKey: ['market', input.marketId] });
      void qc.invalidateQueries({ queryKey: ['marketPosition', input.marketId] });
      void qc.invalidateQueries({ queryKey: ['wallet'] });
      void qc.invalidateQueries({ queryKey: ['ledger'] });
      void qc.invalidateQueries({ queryKey: ['markets'] });
      toastDone(
        input.side === 'yes' ? 'Bought YES' : 'Bought NO',
        'Position opened. Chips have no cash value.',
      );
    },
    onError: (e) => toastError("Couldn't place trade", e),
  });
}

export interface QuickJoinInput {
  betId: string;
  outcomeId: string;
  stake: number;
}

/** Quick one-tap bet join from the feed (escrows a stake on an outcome). */
export function useQuickJoin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: QuickJoinInput) => {
      const payload: PlaceBetPayload = {
        betId: input.betId,
        outcomeId: input.outcomeId,
        stake: input.stake,
        idempotencyKey: makeIdempotencyKey(),
      };
      return fns.placeBet(payload);
    },
    onSuccess: (_res, input) => {
      void qc.invalidateQueries({ queryKey: ['bet', input.betId] });
      void qc.invalidateQueries({ queryKey: ['wallet'] });
      void qc.invalidateQueries({ queryKey: ['ledger'] });
      void qc.invalidateQueries({ queryKey: ['bets'] });
      toastDone('Stake placed', 'Good luck. Chips have no cash value.');
    },
    onError: (e) => toastError("Couldn't join bet", e),
  });
}

/** Re-share a big win from the feed (fires the celebration overlay locally). */
export function useCelebrateWin() {
  const triggerCelebrate = useUi((s) => s.triggerCelebrate);
  return (args: { betId: string; amount: number }) => {
    triggerCelebrate(args.betId, args.amount);
  };
}
