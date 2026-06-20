/**
 * Hyper-engagement feature hooks — hourly drops, chests, the daily spin, and the
 * day-streak activity ping. Every mutation wraps a callable in React Query and
 * surfaces a `burnt`-style toast; the client NEVER computes money — these only
 * invoke callables and the server-written balance + engagement state flow back
 * through the live read hooks in `@/hooks/data` (read engagement off
 * `useCurrentUser().data.engagement`).
 *
 * `useHourlyDropStatus(now)` is a pure read helper that turns the user's
 * engagement state into a render-ready { ready, readyIn, nextAmount, streak }
 * using the shared engagement helpers — no network, recompute it on a ticking
 * `now` to drive the FOMO countdown.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { fns } from '@/lib/firebase';
import { useUi } from '@/stores/ui';
import { formatChips } from '@/shared/money';
import {
  HOURLY_DROP,
  hourlyDropAmount,
  hourlyDropReadyIn,
  DAILY_SPIN,
} from '@/shared/engagement';
import type { ChestTier, EngagementState } from '@/shared';
import { makeIdempotencyKey } from '@/shared/ids';
import { recordActivity } from './callables';

// ─── Callable result shapes (mirror the CF returns) ─────────────────────────────

interface ClaimHourlyDropResult {
  ok: boolean;
  granted: number;
  streak: number;
  nextClaimAt: number;
  alreadyClaimed?: boolean;
}
interface OpenChestResult {
  ok: boolean;
  tier: ChestTier;
  chips: number;
  /** Present on the engagement CF return (the shared wrapper types omit it). */
  free?: boolean;
  cost?: number;
  nextFreeAt?: number;
}
interface DailySpinResult {
  ok: boolean;
  /** CF returns `granted`; the shared wrapper may surface it as `prize`. */
  granted?: number;
  prize?: number;
  prizeIndex?: number;
  segmentIndex?: number;
  totalSpins?: number;
  nextSpinAt: number;
  alreadySpun?: boolean;
}

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

function invalidateMoney(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ['wallet'] });
  void qc.invalidateQueries({ queryKey: ['user'] });
  void qc.invalidateQueries({ queryKey: ['ledger'] });
}

// ─── Hourly drop ────────────────────────────────────────────────────────────--

/** Claim the hourly chip drop. The server clamps to once per cooldown. */
export function useClaimHourlyDrop() {
  const qc = useQueryClient();
  const triggerCelebrate = useUi((s) => s.triggerCelebrate);
  return useMutation<ClaimHourlyDropResult, unknown, void>({
    mutationFn: () => fns.claimHourlyDrop() as unknown as Promise<ClaimHourlyDropResult>,
    onSuccess: (res) => {
      invalidateMoney(qc);
      if (res.alreadyClaimed || res.granted <= 0) {
        toast({ title: 'Not ready yet', message: 'Your next drop is still warming up.', preset: 'none' });
        return;
      }
      triggerCelebrate('hourly_drop', res.granted);
      toastDone('Hourly drop claimed', `+${formatChips(res.granted)} Chips · ${res.streak}🔥 streak`);
    },
    onError: (e) => toastError("Couldn't claim drop", e),
  });
}

// ─── Chest ──────────────────────────────────────────────────────────────────--

/** Open a chest (free once per cooldown, else a small Chip cost). */
export function useOpenChest() {
  const qc = useQueryClient();
  const triggerCelebrate = useUi((s) => s.triggerCelebrate);
  return useMutation<OpenChestResult, unknown, void>({
    mutationFn: () =>
      fns.openChest({ idempotencyKey: makeIdempotencyKey() }) as unknown as Promise<OpenChestResult>,
    onSuccess: (res) => {
      invalidateMoney(qc);
      if (res.chips > 0) triggerCelebrate('chest', res.chips);
      const costNote = res.free === false && res.cost ? ` · -${res.cost} to open` : ' · free';
      toastDone(`${res.tier.toUpperCase()} chest!`, `+${formatChips(res.chips)} Chips${costNote}`);
    },
    onError: (e) => toastError("Couldn't open chest", e),
  });
}

// ─── Daily spin ───────────────────────────────────────────────────────────────

/** Spin the daily wheel once per 24h. Returns the prize index for the animation. */
export function useDailySpin() {
  const qc = useQueryClient();
  const triggerCelebrate = useUi((s) => s.triggerCelebrate);
  return useMutation<DailySpinResult, unknown, void>({
    mutationFn: () =>
      fns.dailySpin({ clientSeed: makeIdempotencyKey() }) as unknown as Promise<DailySpinResult>,
    onSuccess: (res) => {
      invalidateMoney(qc);
      if (res.alreadySpun) {
        toast({ title: 'Already spun', message: 'Come back tomorrow for another spin.', preset: 'none' });
        return;
      }
      const won = res.granted ?? res.prize ?? 0;
      if (won > 0) {
        triggerCelebrate('daily_spin', won);
        toastDone('Nice spin!', `+${formatChips(won)} Chips`);
      } else {
        toast({ title: 'So close!', message: 'No prize this time — spin again tomorrow.', preset: 'none' });
      }
    },
    onError: (e) => toastError("Couldn't spin", e),
  });
}

// ─── Activity ping (day-streak meter) ──────────────────────────────────────────

/** Ping the server on app open to advance the consecutive-day streak. */
export function useRecordActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => recordActivity(),
    onSuccess: (res) => {
      if (res.changed) void qc.invalidateQueries({ queryKey: ['user'] });
    },
    // Silent: this is a background ping, not a user-facing action.
    onError: () => undefined,
  });
}

// ─── Pure status helper (drives the FOMO countdown UI) ──────────────────────────

export interface HourlyDropStatus {
  /** True when the drop can be claimed right now. */
  ready: boolean;
  /** ms until the next claim (0 when ready). */
  readyIn: number;
  /** The current consecutive-claim streak. */
  streak: number;
  /** Chips the NEXT claim would grant at the current streak. */
  nextAmount: number;
  /** Epoch ms the drop becomes claimable (== now + readyIn). */
  nextClaimAt: number;
}

/**
 * Compute the hourly-drop status from the user's engagement state at a given
 * `now`. Pure — re-call it on a ticking clock to animate the countdown. The
 * streak shown is the streak the NEXT claim would produce (continues if still
 * inside the grace window, else resets to 1).
 */
export function useHourlyDropStatus(
  engagement: Partial<EngagementState> | null | undefined,
  now: number,
): HourlyDropStatus {
  const lastClaimAt = engagement?.lastHourlyClaimAt ?? null;
  const prevStreak = engagement?.hourlyStreak ?? 0;
  const readyIn = hourlyDropReadyIn(lastClaimAt ?? null, now);
  const ready = readyIn <= 0;

  // If they let the grace window lapse the streak will reset on claim.
  const sinceLast = lastClaimAt == null ? Infinity : now - lastClaimAt;
  const continued = lastClaimAt != null && sinceLast <= HOURLY_DROP.RESET_AFTER_MS;
  const nextStreak = ready ? (continued ? prevStreak + 1 : 1) : prevStreak;

  return {
    ready,
    readyIn,
    streak: prevStreak,
    nextAmount: hourlyDropAmount(Math.max(1, nextStreak)),
    nextClaimAt: now + readyIn,
  };
}

/** Whether the daily spin is available again at `now`. */
export function dailySpinReadyIn(lastSpinAt: number | null | undefined, now: number): number {
  if (!lastSpinAt) return 0;
  return Math.max(0, lastSpinAt + DAILY_SPIN.COOLDOWN_MS - now);
}
