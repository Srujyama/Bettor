/**
 * Social-depth & virality mutations. Each wraps a callable Cloud Function
 * (`fns.*`) in a React Query `useMutation` and surfaces a `burnt` toast. The
 * client NEVER computes money — these only invoke callables; server-written
 * state (chat messages, the challenge bet, rivalry aggregates) flows back
 * through the live read hooks in `@/hooks/data`.
 *
 * The `sendChat` and `challengeFriend` callables are owned by the Economy track
 * in `@/lib/firebase/functions` (`fns.sendChat`, `fns.challengeFriend`) per the
 * expansion coordination rules; this file assumes those wrappers exist.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'burnt';
import { fns } from '@/lib/firebase';

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

// ─── Crew chat ─────────────────────────────────────────────────────────────────

export interface SendChatInput {
  groupId: string;
  text?: string;
  gifUrl?: string | null;
  stickerKey?: string | null;
  betRef?: string | null;
}

/** Post a message into a crew's chat (rate-limited + member-only server-side). */
export function useSendChat() {
  return useMutation<{ ok: boolean; messageId: string }, unknown, SendChatInput>({
    mutationFn: (input) =>
      fns.sendChat(input) as Promise<{ ok: boolean; messageId: string }>,
    onError: (e) => toastError("Couldn't send message", e),
  });
}

// ─── Challenge a friend (rivalry rematch / head-to-head bet) ─────────────────────

export interface ChallengeFriendInput {
  friendUid: string;
  title: string;
  stake: number;
  myOutcomeLabel: string;
  theirOutcomeLabel: string;
  lockAt: number;
  resolveBy: number;
  idempotencyKey: string;
}

/** Open a 1-v-1 head-to-head bet against a friend. Server creates the bet. */
export function useChallengeFriend() {
  const qc = useQueryClient();
  return useMutation<{ ok: boolean; betId: string }, unknown, ChallengeFriendInput>({
    mutationFn: (input) =>
      fns.challengeFriend(input) as Promise<{ ok: boolean; betId: string }>,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['bets'] });
      void qc.invalidateQueries({ queryKey: ['feed'] });
      toastDone('Challenge sent', 'The bet is live — may the best take the pot.');
    },
    onError: (e) => toastError("Couldn't send challenge", e),
  });
}
