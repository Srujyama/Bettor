/**
 * Casino mini-game feature hooks. The client NEVER computes money or outcomes —
 * `usePlayGame` only invokes the `playGame` callable; the server is authoritative
 * on both the result (provably-fair) and the Chip movement (double-entry ledger).
 * Server-written state (balance, the new gameRound doc) flows back through the
 * live read hooks.
 *
 * Game-round READS live in the Discovery track's `@/hooks/data` as `useGameRounds`
 * — import it from there in screens (e.g. a "provably fair / history" surface):
 *
 *   import { useGameRounds } from '@/hooks/data';
 *   const { data: rounds } = useGameRounds(20);
 *
 * We do not re-define it here to avoid colliding with that track's owned file.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { fns } from '@/lib/firebase';
import type { PlayGameResult } from '@/lib/firebase/functions';
import { makeIdempotencyKey } from '@/shared/ids';
import type { PlayGamePayload } from '@/shared/schemas-markets';

function errorMessage(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === 'string') return e;
  return 'Something went wrong. Try again.';
}

/** Input a screen passes to `usePlayGame.mutate` — the idempotencyKey is auto-filled. */
export interface PlayGameInput {
  game: PlayGamePayload['game'];
  stake: number;
  clientSeed: string;
  params?: Record<string, unknown>;
  /** Override the auto-generated idempotency key (e.g. to retry the exact round). */
  idempotencyKey?: string;
}

/**
 * Play one round of any casino mini-game. Resolves with the server's authoritative
 * result (multiplier / payout / revealed seed) which the screen animates TO. On
 * error we surface a toast; on success we let the screen drive its own juice
 * (reels settle, big-win overlay) — so this hook stays UI-agnostic.
 */
export function usePlayGame() {
  const qc = useQueryClient();
  return useMutation<PlayGameResult, unknown, PlayGameInput>({
    mutationFn: (input) =>
      fns.playGame({
        game: input.game,
        stake: input.stake,
        clientSeed: input.clientSeed,
        params: input.params,
        idempotencyKey: input.idempotencyKey ?? makeIdempotencyKey(),
      }),
    onSuccess: () => {
      // The server moved Chips + wrote a round; refresh the dependent reads.
      void qc.invalidateQueries({ queryKey: ['wallet'] });
      void qc.invalidateQueries({ queryKey: ['user'] });
      void qc.invalidateQueries({ queryKey: ['ledger'] });
      void qc.invalidateQueries({ queryKey: ['gameRounds'] });
    },
    onError: (e) => {
      toast({ title: "Couldn't play", message: errorMessage(e), preset: 'error', haptic: 'error' });
    },
  });
}
