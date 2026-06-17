/**
 * Social / wallet / responsible-gaming feature hooks. Every mutation wraps a
 * `fns.*` callable in a React Query `useMutation` and surfaces a `burnt` toast on
 * success/error. The client NEVER computes money — these only invoke callables;
 * server-written state flows back through the live read hooks in `@/hooks/data`.
 */
import { useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { fns, getDocOnce, updateDocData, serverTimestamp } from '@/lib/firebase';
import { paths } from '@/lib/firebase/paths';
import { useSession } from '@/stores/session';
import { useUi } from '@/stores/ui';
import { useCurrentUser } from '@/hooks/data';
import { formatChips } from '@/shared/money';
import type { User } from '@/shared/schemas';

/** Shared error-toast helper — pulls a readable message off whatever the callable threw. */
function toastError(fallback: string, err: unknown) {
  const message =
    err instanceof Error && err.message
      ? err.message
      : typeof err === 'string'
        ? err
        : fallback;
  toast({ title: fallback, message, preset: 'error', haptic: 'error' });
}

function toastSuccess(title: string, message?: string) {
  toast({ title, message, preset: 'done', haptic: 'success' });
}

// ─── Wallet: daily check-in ─────────────────────────────────────────────────

export interface GrantDailyResult {
  ok: boolean;
  granted: number;
  streak: number;
  nextClaimAt: number;
}

/** Claim the daily Chip check-in. Server clamps to once per Macau day. */
export function useGrantDaily() {
  return useMutation<GrantDailyResult, unknown, void>({
    mutationFn: () => fns.grantDailyChips() as Promise<GrantDailyResult>,
    onSuccess: (res) => {
      toastSuccess(
        `+${formatChips(res.granted)} Chips`,
        res.streak > 1 ? `Day ${res.streak} streak` : 'Daily check-in',
      );
    },
    onError: (err) => toastError("Couldn't claim daily Chips", err),
  });
}

// ─── Wallet: zero refill ────────────────────────────────────────────────────

/** Claim the free refill available after the user hits a zero balance. */
export function useClaimZeroRefill() {
  return useMutation<{ ok: boolean; granted: number }, unknown, void>({
    mutationFn: () => fns.claimZeroRefill() as Promise<{ ok: boolean; granted: number }>,
    onSuccess: (res) => toastSuccess(`+${formatChips(res.granted)} Chips`, 'Refill added'),
    onError: (err) => toastError("Couldn't claim refill", err),
  });
}

// ─── Responsible gaming ─────────────────────────────────────────────────────

export interface SetRgLimitsInput {
  dailyStakeLimit?: number | null;
  weeklyStakeLimit?: number | null;
  dailyBetCountLimit?: number | null;
  sessionReminderMins?: number;
  selfExcludeForMs?: number | null;
}

/** Persist responsible-gaming limits via the server (validated by the shared schema). */
export function useSetRgLimits() {
  return useMutation<{ ok: boolean }, unknown, SetRgLimitsInput>({
    mutationFn: (input) => fns.setRgLimits(input) as Promise<{ ok: boolean }>,
    onSuccess: () => toastSuccess('Limits saved', 'Your play settings are updated'),
    onError: (err) => toastError("Couldn't save limits", err),
  });
}

// ─── Friends ────────────────────────────────────────────────────────────────

export interface FriendRequestInput {
  targetUid?: string;
  handle?: string;
}

/** Send a friend request by uid or @handle. */
export function useSendFriendRequest() {
  return useMutation<{ ok: boolean }, unknown, FriendRequestInput>({
    mutationFn: (input) => fns.sendFriendRequest(input) as Promise<{ ok: boolean }>,
    onSuccess: () => toastSuccess('Request sent'),
    onError: (err) => toastError("Couldn't send request", err),
  });
}

/** Accept or decline an incoming friend request. */
export function useRespondFriendRequest() {
  return useMutation<{ ok: boolean }, unknown, { fromUid: string; accept: boolean }>({
    mutationFn: ({ fromUid, accept }) =>
      fns.respondFriendRequest(fromUid, accept) as Promise<{ ok: boolean }>,
    onSuccess: (_res, vars) =>
      toastSuccess(vars.accept ? 'Friend added' : 'Request declined'),
    onError: (err) => toastError("Couldn't respond to request", err),
  });
}

// ─── Crews (groups) ─────────────────────────────────────────────────────────

export interface CreateGroupInput {
  name: string;
  emoji?: string;
  description?: string;
}

/** Create a crew. Returns the new groupId + inviteCode from the server. */
export function useCreateGroup() {
  return useMutation<
    { ok: boolean; groupId: string; inviteCode: string },
    unknown,
    CreateGroupInput
  >({
    mutationFn: (input) =>
      fns.createGroup(input) as Promise<{ ok: boolean; groupId: string; inviteCode: string }>,
    onSuccess: () => toastSuccess('Crew created'),
    onError: (err) => toastError("Couldn't create crew", err),
  });
}

/** Join a crew by its invite code. */
export function useJoinGroup() {
  return useMutation<{ ok: boolean; groupId: string }, unknown, string>({
    mutationFn: (inviteCode) =>
      fns.joinGroup(inviteCode) as Promise<{ ok: boolean; groupId: string }>,
    onSuccess: () => toastSuccess('Joined crew'),
    onError: (err) => toastError("Couldn't join crew", err),
  });
}

// ─── Profile ──────────────────────────────────────────────────────────────--

/** Editable subset of the user doc the owner may write directly (non-money fields). */
export type ProfileUpdate = Partial<
  Pick<User, 'displayName' | 'photoURL' | 'locale'> & { settings: Partial<User['settings']> }
>;

/**
 * Write editable user fields straight to the user doc. Money, stats, handle and
 * compliance fields are CF/rules-protected, so we only ever touch the safe set.
 * Optimistically patches the cached user + session profile.
 */
export function useUpdateProfile() {
  const uid = useSession((s) => s.uid);
  const setProfile = useSession((s) => s.setProfile);
  const qc = useQueryClient();

  return useMutation<void, unknown, ProfileUpdate>({
    mutationFn: async (update) => {
      if (!uid) throw new Error('Not signed in');
      const patch: Record<string, unknown> = { updatedAt: serverTimestamp() };
      if (update.displayName !== undefined) patch.displayName = update.displayName;
      if (update.photoURL !== undefined) patch.photoURL = update.photoURL;
      if (update.locale !== undefined) patch.locale = update.locale;
      if (update.settings) {
        for (const [k, v] of Object.entries(update.settings)) {
          patch[`settings.${k}`] = v;
        }
      }
      await updateDocData(paths.user(uid), patch);
    },
    onMutate: async (update) => {
      if (!uid) return;
      const key = ['user', uid] as const;
      const prev = qc.getQueryData<User>(key) ?? null;
      if (prev) {
        const next: User = {
          ...prev,
          ...(update.displayName !== undefined ? { displayName: update.displayName } : {}),
          ...(update.photoURL !== undefined ? { photoURL: update.photoURL } : {}),
          ...(update.locale !== undefined ? { locale: update.locale } : {}),
          settings: update.settings ? { ...prev.settings, ...update.settings } : prev.settings,
        };
        qc.setQueryData(key, next);
        setProfile(next);
      }
      return { prev };
    },
    onError: (err, _vars, ctx) => {
      const prev = (ctx as { prev?: User | null } | undefined)?.prev;
      if (uid && prev !== undefined) qc.setQueryData(['user', uid], prev);
      toastError("Couldn't save profile", err);
    },
    onSuccess: () => toastSuccess('Profile saved'),
  });
}

// ─── Reality check (responsible gaming) ───────────────────────────────────--

export interface RealityCheckState {
  /** Whether the reality-check modal should be shown now. */
  shouldShow: boolean;
  /** Whole minutes the current session has been active. */
  sessionMinutes: number;
  /** The cadence (minutes) the reminder fires at, from the user's RG limits. */
  reminderMins: number;
  /** Whether the account is currently inside a self-exclusion window. */
  selfExcluded: boolean;
}

/**
 * Computes whether to surface the reality check from `useUi` session timing and
 * the user's `rgLimits.sessionReminderMins`. Reactive to the clock via the `now`
 * argument so the host screen controls the tick cadence.
 */
export function useRealityCheck(now: number = Date.now()): RealityCheckState {
  const sessionStartedAt = useUi((s) => s.sessionStartedAt);
  const lastRealityCheckAt = useUi((s) => s.lastRealityCheckAt);
  const { data: user } = useCurrentUser();

  return useMemo(() => {
    const reminderMins = user?.rgLimits?.sessionReminderMins ?? 45;
    const sessionMinutes = Math.floor((now - sessionStartedAt) / 60_000);
    const sinceLastMs = now - lastRealityCheckAt;
    const selfExclusionUntil = user?.rgLimits?.selfExclusionUntil ?? null;
    const selfExcluded = selfExclusionUntil != null && selfExclusionUntil > now;
    const shouldShow = reminderMins > 0 && sinceLastMs >= reminderMins * 60_000;
    return { shouldShow, sessionMinutes, reminderMins, selfExcluded };
  }, [now, sessionStartedAt, lastRealityCheckAt, user]);
}

// ─── Lookup helper ──────────────────────────────────────────────────────────

/** One-shot lookup of a user doc by id (for friend-request previews etc.). */
export async function fetchUser(uid: string): Promise<User | null> {
  return getDocOnce<User>(paths.user(uid));
}
