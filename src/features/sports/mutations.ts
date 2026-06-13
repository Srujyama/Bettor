/**
 * Sports mutations. Wraps the `createBetFromFixture` callable in a React Query
 * `useMutation`, mirroring the bets-feature pattern: the client NEVER computes or
 * writes money/state — it sends a validated payload and reads server-written
 * state back through the live read hooks. On success/error we fire a `burnt`
 * toast and invalidate the query keys the server mutation may have changed.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'burnt';
import { fns } from '@/lib/firebase';
import { makeIdempotencyKey } from '@/shared/ids';

/** The fields a caller supplies; the idempotency key is generated for them. */
export interface CreateBetFromFixtureInput {
  fixtureId: string;
  /** Short market label, e.g. "Match Winner". */
  market: string;
  /** Optional fixed stake (Chips); omit for an open-stake pool. */
  stake?: number;
  /** Optional explicit lock time; defaults server-side to kickoff. */
  lockAt?: number;
}

function errorMessage(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === 'string') return e;
  return 'Something went wrong. Try again.';
}

/** Open a bet pre-linked to a fixture (auto-resolves from the final score). */
export function useCreateBetFromFixture() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateBetFromFixtureInput) =>
      fns.createBetFromFixture({ ...input, idempotencyKey: makeIdempotencyKey() }),
    onSuccess: (_res, input) => {
      void qc.invalidateQueries({ queryKey: ['bets'] });
      void qc.invalidateQueries({ queryKey: ['bets', 'byFixture', input.fixtureId] });
      void qc.invalidateQueries({ queryKey: ['feed'] });
      toast({ title: 'Game bet created', message: 'It auto-resolves from the final score.', preset: 'done', haptic: 'success' });
    },
    onError: (e) => toast({ title: "Couldn't create game bet", message: errorMessage(e), preset: 'error', haptic: 'error' }),
  });
}
