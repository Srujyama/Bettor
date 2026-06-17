/**
 * Game-formats feature hooks. Reads re-export the live (onSnapshot-backed)
 * hooks owned by `@/hooks/data` so screens have a single import surface; the
 * mutations wrap the format callables (`fns.*`, owned by the Economy track) in
 * React Query `useMutation` with `burnt` toasts, exactly like
 * `@/features/bets/mutations`. The client NEVER computes money: it only sends a
 * validated payload and reads back server-written state via the live reads.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { fns } from '@/lib/firebase';
import {
  CreateParlayPayloadSchema,
  CreateSquaresPayloadSchema,
  ChallengeFriendPayloadSchema,
} from '@/shared/schemas-ext';
import type { z } from 'zod';

// Re-export the live reads so screens can `import { useParlay } from '@/features/formats/hooks'`.
export {
  useParlay,
  useParlaySlips,
  useSquares,
  useBracket,
  useFixtures,
  useFixture,
} from '@/hooks/data';

// ─── Toast helpers (mirror @/features/bets/mutations) ───────────────────────────

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

// ─── Parlays ─────────────────────────────────────────────────────────────────

type CreateParlayInput = z.infer<typeof CreateParlayPayloadSchema>;

/** Build + submit a parlay slip (escrows the stake server-side). */
export function useCreateParlay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateParlayInput) => fns.createParlay(payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['parlays'] });
      void qc.invalidateQueries({ queryKey: ['wallet'] });
      void qc.invalidateQueries({ queryKey: ['ledger'] });
      toastDone('Parlay placed', 'Good luck. Chips have no cash value.');
    },
    onError: (e) => toastError("Couldn't place parlay", e),
  });
}

// ─── Squares ─────────────────────────────────────────────────────────────────

type CreateSquaresInput = z.infer<typeof CreateSquaresPayloadSchema>;

/** Open a new squares board (no money moves until cells are claimed). */
export function useCreateSquaresGame() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateSquaresInput) => fns.createSquaresGame(payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['squares'] });
      toastDone('Board created', 'Share it and start claiming squares.');
    },
    onError: (e) => toastError("Couldn't create board", e),
  });
}

/** Claim a free cell on a board (escrows the price per square). */
export function useClaimSquare() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { gameId: string; cellIndex: number }) => fns.claimSquare(input),
    onSuccess: (_res, input) => {
      void qc.invalidateQueries({ queryKey: ['squares', input.gameId] });
      void qc.invalidateQueries({ queryKey: ['wallet'] });
      void qc.invalidateQueries({ queryKey: ['ledger'] });
      toastDone('Square claimed', 'Locked in.');
    },
    onError: (e) => toastError("Couldn't claim square", e),
  });
}

// ─── Brackets ──────────────────────────────────────────────────────────────────

/** Create a single-elimination bracket (escrows the entry fee as the prize pool). */
export function useCreateBracket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { title: string; competitors: string[]; entryFee: number; groupId?: string | null }) =>
      fns.createBracket(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['bracket'] });
      void qc.invalidateQueries({ queryKey: ['wallet'] });
      toastDone('Bracket created', 'Tap winners to advance each round.');
    },
    onError: (e) => toastError("Couldn't create bracket", e),
  });
}

/** Set a match winner; the final match auto-settles the prize pool server-side. */
export function useAdvanceBracket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { bracketId: string; matchId: string; winnerName: string }) =>
      fns.advanceBracket(input),
    onSuccess: (_res, input) => {
      void qc.invalidateQueries({ queryKey: ['bracket', input.bracketId] });
      void qc.invalidateQueries({ queryKey: ['wallet'] });
    },
    onError: (e) => toastError("Couldn't advance bracket", e),
  });
}

// ─── Challenge a friend ──────────────────────────────────────────────────────

type ChallengeFriendInput = z.infer<typeof ChallengeFriendPayloadSchema>;

/** 1-tap head-to-head: creates a WINNER_TAKE_ALL bet + escrows your stake. */
export function useChallengeFriend() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ChallengeFriendInput) => fns.challengeFriend(payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['bets'] });
      void qc.invalidateQueries({ queryKey: ['wallet'] });
      void qc.invalidateQueries({ queryKey: ['ledger'] });
      toastDone('Challenge sent', 'Your friend has been notified.');
    },
    onError: (e) => toastError("Couldn't send challenge", e),
  });
}
