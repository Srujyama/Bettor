/**
 * Economy & cosmetics feature hooks. Every mutation wraps a `fns.*` callable in
 * a React Query `useMutation` and surfaces a `burnt` toast on success/error. The
 * client NEVER computes or writes money/inventory — these only invoke callables;
 * server-written state (balance, inventory, equipped, pro, powerups) flows back
 * through the live read hooks in `@/hooks/data`. Inventory READS live in the
 * Social track's `useInventory`; here we only invalidate its query key on change.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { fns } from '@/lib/firebase';
import { formatChips } from '@/shared/money';
import { COSMETIC_BY_KEY, POWERUP_BY_KEY, PRO } from '@/shared/gamification';
import type { CosmeticType } from '@/shared/gamification';

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

// ─── Cosmetics ────────────────────────────────────────────────────────────────

/** Buy a cosmetic with Chips. Server rejects if owned / proOnly && !pro / broke. */
export function useBuyCosmetic() {
  const qc = useQueryClient();
  return useMutation<{ ok: boolean; itemId: string; cosmeticKey: string }, unknown, string>({
    mutationFn: (cosmeticKey) =>
      fns.buyCosmetic({ cosmeticKey }) as Promise<{ ok: boolean; itemId: string; cosmeticKey: string }>,
    onSuccess: (_res, cosmeticKey) => {
      void qc.invalidateQueries({ queryKey: ['inventory'] });
      void qc.invalidateQueries({ queryKey: ['wallet'] });
      void qc.invalidateQueries({ queryKey: ['user'] });
      void qc.invalidateQueries({ queryKey: ['ledger'] });
      const name = COSMETIC_BY_KEY[cosmeticKey]?.name ?? 'Cosmetic';
      toastDone('Purchased', `${name} added to your inventory.`);
    },
    onError: (e) => toastError("Couldn't buy cosmetic", e),
  });
}

/** Equip (cosmeticKey) or unequip (null) a cosmetic for a given slot type. */
export function useEquipCosmetic() {
  const qc = useQueryClient();
  return useMutation<
    { ok: boolean; type: string; cosmeticKey: string | null },
    unknown,
    { type: CosmeticType; cosmeticKey: string | null }
  >({
    mutationFn: (input) =>
      fns.equipCosmetic(input) as Promise<{ ok: boolean; type: string; cosmeticKey: string | null }>,
    onSuccess: (_res, input) => {
      void qc.invalidateQueries({ queryKey: ['inventory'] });
      void qc.invalidateQueries({ queryKey: ['user'] });
      toastDone(input.cosmeticKey ? 'Equipped' : 'Unequipped');
    },
    onError: (e) => toastError("Couldn't update loadout", e),
  });
}

// ─── Power-ups ──────────────────────────────────────────────────────────────--

/** Buy `count` of a power-up. Debits price*count to the house. */
export function useBuyPowerUp() {
  const qc = useQueryClient();
  return useMutation<
    { ok: boolean; key: string; count: number },
    unknown,
    { key: string; count?: number }
  >({
    mutationFn: (input) =>
      fns.buyPowerUp(input) as Promise<{ ok: boolean; key: string; count: number }>,
    onSuccess: (_res, input) => {
      void qc.invalidateQueries({ queryKey: ['wallet'] });
      void qc.invalidateQueries({ queryKey: ['user'] });
      void qc.invalidateQueries({ queryKey: ['ledger'] });
      const name = POWERUP_BY_KEY[input.key]?.name ?? 'Power-up';
      toastDone('Stocked up', `${name} added to your stash.`);
    },
    onError: (e) => toastError("Couldn't buy power-up", e),
  });
}

// ─── Pro tier ─────────────────────────────────────────────────────────────────

/** Subscribe to / renew Pro with Chips for one PERIOD. */
export function useSubscribePro() {
  const qc = useQueryClient();
  return useMutation<
    { ok: boolean; active: boolean; since: number; expiresAt: number },
    unknown,
    void
  >({
    mutationFn: () =>
      fns.subscribePro() as Promise<{ ok: boolean; active: boolean; since: number; expiresAt: number }>,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['wallet'] });
      void qc.invalidateQueries({ queryKey: ['user'] });
      void qc.invalidateQueries({ queryKey: ['ledger'] });
      toastDone('Welcome to Pro', `${formatChips(PRO.PRICE_CHIPS)} Chips · ${PRO.PERIOD_DAYS} days.`);
    },
    onError: (e) => toastError("Couldn't start Pro", e),
  });
}

// ─── In-bet gifting (co-bet) ─────────────────────────────────────────────────-

/**
 * Back a friend on a bet they're already in — Chips move strictly INTO the bet
 * pool (no peer-to-peer cash-out), so it stays inside the bet mechanic.
 */
export function useGiftIntoBet() {
  const qc = useQueryClient();
  return useMutation<
    { ok: boolean; betId: string; recipientUid: string; amount: number },
    unknown,
    { betId: string; recipientUid: string; amount: number }
  >({
    mutationFn: (input) =>
      fns.giftIntoBet(input) as Promise<{ ok: boolean; betId: string; recipientUid: string; amount: number }>,
    onSuccess: (_res, input) => {
      void qc.invalidateQueries({ queryKey: ['bet', input.betId] });
      void qc.invalidateQueries({ queryKey: ['wallet'] });
      void qc.invalidateQueries({ queryKey: ['ledger'] });
      toastDone('Backed your friend', `${formatChips(input.amount)} Chips into the pool.`);
    },
    onError: (e) => toastError("Couldn't send co-bet", e),
  });
}
