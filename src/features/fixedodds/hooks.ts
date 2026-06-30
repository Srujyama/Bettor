/**
 * Fixed-odds peer-betting hooks: read hooks for the offer book + matched pairs,
 * and mutation hooks wrapping the callables (`fns.createOffer/takeOffer/
 * cancelOffer`) in React Query `useMutation` with toast feedback.
 *
 * The client NEVER computes money: mutations only send a validated payload and
 * read back server-written state via the live read hooks below. Reads are
 * onSnapshot-backed (via the low-level `useCollectionQuery`) so an open offer
 * book updates the instant a maker posts or a taker fills.
 *
 * NOTE: CARDS_SPEC says `useOffers/useMatches` may also live in the Card track's
 * `src/hooks/data.ts`. We keep our own copies here so this track compiles +
 * functions standalone; both read the same Firestore paths, so they agree.
 */
import { orderBy } from 'firebase/firestore';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { fns } from '@/lib/firebase';
import { paths } from '@/lib/firebase/paths';
import { useCollectionQuery } from '@/hooks/useFirestoreQuery';
import type {
  CreateOfferPayload,
  TakeOfferPayload,
  FixedOddsOffer,
  FixedOddsMatch,
} from '@/shared/schemas-cards';

// ─── Reads ──────────────────────────────────────────────────────────────────

/** Live offer book for a bet, newest first. Includes open/partial/filled/cancelled. */
export function useOffers(betId: string | null) {
  return useCollectionQuery<FixedOddsOffer>(
    ['bet', betId, 'offers'],
    betId ? paths.offers(betId) : null,
    [orderBy('createdAt', 'desc')],
    !!betId,
  );
}

/** Live matched pairs for a bet, newest first. */
export function useMatches(betId: string | null) {
  return useCollectionQuery<FixedOddsMatch>(
    ['bet', betId, 'matches'],
    betId ? paths.matches(betId) : null,
    [orderBy('createdAt', 'desc')],
    !!betId,
  );
}

// ─── Mutations ────────────────────────────────────────────────────────────────

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

/** Maker posts a fixed-odds offer (escrows their backer stake). */
export function useCreateOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateOfferPayload) => fns.createOffer(payload),
    onSuccess: (_res, payload) => {
      void qc.invalidateQueries({ queryKey: ['bet', payload.betId, 'offers'] });
      void qc.invalidateQueries({ queryKey: ['wallet'] });
      void qc.invalidateQueries({ queryKey: ['ledger'] });
      toastDone('Offer posted', 'Your odds are live. Chips have no cash value.');
    },
    onError: (e) => toastError("Couldn't post offer", e),
  });
}

/** Taker lays the other side of an offer (escrows their risk; partial fills OK). */
export function useTakeOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: TakeOfferPayload) => fns.takeOffer(payload),
    onSuccess: (_res, payload) => {
      void qc.invalidateQueries({ queryKey: ['bet', payload.betId, 'offers'] });
      void qc.invalidateQueries({ queryKey: ['bet', payload.betId, 'matches'] });
      void qc.invalidateQueries({ queryKey: ['wallet'] });
      void qc.invalidateQueries({ queryKey: ['ledger'] });
      toastDone('Bet matched', 'You laid the other side. Good luck.');
    },
    onError: (e) => toastError("Couldn't take offer", e),
  });
}

/** Maker cancels their offer (refunds the still-unmatched stake). */
export function useCancelOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { betId: string; offerId: string }) => fns.cancelOffer(input),
    onSuccess: (_res, input) => {
      void qc.invalidateQueries({ queryKey: ['bet', input.betId, 'offers'] });
      void qc.invalidateQueries({ queryKey: ['wallet'] });
      void qc.invalidateQueries({ queryKey: ['ledger'] });
      toastDone('Offer cancelled', 'Your unmatched stake was refunded.');
    },
    onError: (e) => toastError("Couldn't cancel offer", e),
  });
}
