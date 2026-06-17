/**
 * Bet lifecycle mutations. Every one wraps a callable Cloud Function (`fns.*`)
 * in a React Query `useMutation`. The client NEVER computes or writes money:
 * these only send a validated payload and read back server-written state via the
 * live read hooks in `@/hooks/data`. On success/error we fire a `burnt` toast and
 * invalidate the query keys that the server mutation may have changed so the next
 * (cold) read refetches; live onSnapshot listeners already keep open screens fresh.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { fns } from '@/lib/firebase';
import type { CreateBetPayload, PlaceBetPayload } from '@/shared/schemas';

/** Pull a human-readable message off whatever a callable rejected with. */
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

/** Create a bet. Pass the full validated payload (build it with makeIdempotencyKey()). */
export function useCreateBet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateBetPayload) => fns.createBet(payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['bets'] });
      void qc.invalidateQueries({ queryKey: ['feed'] });
      toastDone('Bet created', 'Your bet is live.');
    },
    onError: (e) => toastError("Couldn't create bet", e),
  });
}

/** Place (or top up) a stake on an outcome. */
export function usePlaceBet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: PlaceBetPayload) => fns.placeBet(payload),
    onSuccess: (_res, payload) => {
      void qc.invalidateQueries({ queryKey: ['bet', payload.betId] });
      void qc.invalidateQueries({ queryKey: ['wallet'] });
      void qc.invalidateQueries({ queryKey: ['ledger'] });
      toastDone('Stake placed', 'Good luck. Chips have no cash value.');
    },
    onError: (e) => toastError("Couldn't place stake", e),
  });
}

/** Cancel your entry on an open bet (refunds your escrowed stake). */
export function useCancelEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (betId: string) => fns.cancelEntry(betId),
    onSuccess: (_res, betId) => {
      void qc.invalidateQueries({ queryKey: ['bet', betId] });
      void qc.invalidateQueries({ queryKey: ['wallet'] });
      void qc.invalidateQueries({ queryKey: ['ledger'] });
      toastDone('Entry cancelled', 'Your stake was refunded.');
    },
    onError: (e) => toastError("Couldn't cancel entry", e),
  });
}

/** Creator (or appointed judge) proposes the winning outcome. */
export function useResolveBet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { betId: string; winningOutcomeId: string; evidencePath?: string | null }) =>
      fns.resolveBet(input),
    onSuccess: (_res, input) => {
      void qc.invalidateQueries({ queryKey: ['bet', input.betId] });
      void qc.invalidateQueries({ queryKey: ['settlement', input.betId] });
      toastDone('Outcome submitted', 'Participants now have the dispute window.');
    },
    onError: (e) => toastError("Couldn't resolve bet", e),
  });
}

/** Cast a consensus vote for the winning outcome. */
export function useVoteOutcome() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { betId: string; outcomeId: string }) =>
      fns.voteOutcome(input.betId, input.outcomeId),
    onSuccess: (_res, input) => {
      void qc.invalidateQueries({ queryKey: ['bet', input.betId, 'votes'] });
      void qc.invalidateQueries({ queryKey: ['bet', input.betId] });
      toastDone('Vote cast', 'Thanks — your vote counts toward consensus.');
    },
    onError: (e) => toastError("Couldn't cast vote", e),
  });
}

/** Raise a dispute against a proposed resolution. */
export function useRaiseDispute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { betId: string; reason: string; evidencePath?: string | null }) =>
      fns.raiseDispute(input.betId, input.reason, input.evidencePath ?? null),
    onSuccess: (_res, input) => {
      void qc.invalidateQueries({ queryKey: ['bet', input.betId] });
      toastDone('Dispute raised', 'A reviewer will take a look.');
    },
    onError: (e) => toastError("Couldn't raise dispute", e),
  });
}

/** Post a comment on a bet thread. */
export function usePostComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { betId: string; text: string; gifUrl?: string | null }) =>
      fns.postComment(input.betId, input.text, input.gifUrl ?? null),
    onSuccess: (_res, input) => {
      void qc.invalidateQueries({ queryKey: ['bet', input.betId, 'comments'] });
    },
    onError: (e) => toastError("Couldn't post comment", e),
  });
}
