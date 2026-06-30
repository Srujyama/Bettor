/**
 * Card-game home-session mutations. Each wraps a callable Cloud Function
 * (`fns.*`) in a React Query `useMutation`. The client NEVER computes or writes
 * money: these only send a validated payload; the server-written session / player
 * / pot / balance state flows back through the live read hooks in `@/hooks/data`
 * (useCardSession / useSessionPlayers / useSessionTxns / useWallet). On
 * success/error we fire a toast and invalidate the affected query keys so cold
 * reads refetch.
 *
 * Reads (useCardSessions / useCardSession / useSessionPlayers / useSessionTxns)
 * live in `@/hooks/data` (owned by the Card track).
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { fns } from '@/lib/firebase';
import { makeIdempotencyKey } from '@/shared/ids';
import type {
  CreateSessionPayload,
  JoinSessionPayloadSchema,
  SessionBuyInPayloadSchema,
  SessionCashoutPayloadSchema,
} from '@/shared/schemas-cards';
import type { z } from 'zod';

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

type JoinSessionInput = z.infer<typeof JoinSessionPayloadSchema>;
type SessionBuyInInput = z.infer<typeof SessionBuyInPayloadSchema>;
type SessionCashoutInput = z.infer<typeof SessionCashoutPayloadSchema>;

/**
 * Create a home game. Pass everything except the idempotencyKey, which is
 * auto-filled so an accidental double-tap never makes two sessions. Resolves with
 * `{ sessionId }` so the screen can route straight into the new game.
 */
export function useCreateSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<CreateSessionPayload, 'idempotencyKey'>) =>
      fns.createSession({ ...input, idempotencyKey: makeIdempotencyKey() }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['cardSessions'] });
      toastDone('Game created', 'Invite your crew. Chips have no cash value.');
    },
    onError: (e) => toastError("Couldn't create the game", e),
  });
}

/** Add a player — yourself (no guestName) or a guest in tracking mode. */
export function useJoinSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: JoinSessionInput) => fns.joinSession(input),
    onSuccess: (_res, input) => {
      void qc.invalidateQueries({ queryKey: ['cardSession', input.sessionId] });
      void qc.invalidateQueries({ queryKey: ['cardSessions'] });
      toastDone('Player added');
    },
    onError: (e) => toastError("Couldn't add the player", e),
  });
}

/** Record a buy-in / rebuy. In Chips mode this escrows your own Chips into the pot. */
export function useSessionBuyIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SessionBuyInInput) => fns.sessionBuyIn(input),
    onSuccess: (_res, input) => {
      void qc.invalidateQueries({ queryKey: ['cardSession', input.sessionId] });
      void qc.invalidateQueries({ queryKey: ['wallet'] });
      void qc.invalidateQueries({ queryKey: ['ledger'] });
      toastDone(input.kind === 'rebuy' ? 'Rebuy recorded' : 'Buy-in recorded');
    },
    onError: (e) => toastError("Couldn't record the buy-in", e),
  });
}

/** Record a player's final stack (+ finishing place for tournaments). No money moves yet. */
export function useSessionCashout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SessionCashoutInput) => fns.sessionCashout(input),
    onSuccess: (_res, input) => {
      void qc.invalidateQueries({ queryKey: ['cardSession', input.sessionId] });
      toastDone('Cash-out recorded');
    },
    onError: (e) => toastError("Couldn't record the cash-out", e),
  });
}

/** Host settles the session: pays out the pot (Chips mode) and stores the transfers. */
export function useSettleSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { sessionId: string }) => fns.settleSession(input),
    onSuccess: (_res, input) => {
      void qc.invalidateQueries({ queryKey: ['cardSession', input.sessionId] });
      void qc.invalidateQueries({ queryKey: ['cardSessions'] });
      void qc.invalidateQueries({ queryKey: ['wallet'] });
      void qc.invalidateQueries({ queryKey: ['ledger'] });
      toastDone('Settled up', 'Everyone is squared away.');
    },
    onError: (e) => toastError("Couldn't settle the game", e),
  });
}
