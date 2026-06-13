/**
 * Gamification feature hooks: live reads + mutations for achievements, missions,
 * the season hub, season standings, and Wrapped. Reads are defined inline with
 * `useCollectionQuery`/`useDocQuery` + the shared `paths` (we do NOT edit the
 * Social-owned `@/hooks/data.ts`). Mutations wrap the `fns.*` callables in
 * `useMutation` and surface `burnt` toasts — the client never computes money.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { limit, orderBy, where } from 'firebase/firestore';
import { toast } from 'burnt';
import { fns } from '@/lib/firebase';
import { paths } from '@/lib/firebase/paths';
import { useCollectionQuery, useDocQuery } from '@/hooks/useFirestoreQuery';
import { useSession } from '@/stores/session';
import { formatChips } from '@/shared/money';
import type {
  Season,
  SeasonStanding,
  UserAchievement,
  UserMission,
  Wrapped,
} from '@/shared/schemas-ext';

/** A persisted achievement doc, with the denormalized display metadata. */
export type StoredAchievement = UserAchievement & {
  title?: string;
  description?: string;
  icon?: string;
};

function toastError(fallback: string, err: unknown) {
  const message = err instanceof Error && err.message ? err.message : fallback;
  toast({ title: fallback, message, preset: 'error', haptic: 'error' });
}

function toastSuccess(title: string, message?: string) {
  toast({ title, message, preset: 'done', haptic: 'success' });
}

// ─── Reads ───────────────────────────────────────────────────────────────────

/** The current user's unlocked achievements (newest first). */
export function useAchievements() {
  const uid = useSession((s) => s.uid);
  return useCollectionQuery<StoredAchievement>(
    ['achievements', uid],
    uid ? paths.achievements(uid) : null,
    [orderBy('unlockedAt', 'desc')],
    !!uid,
  );
}

/** The current user's active daily + weekly missions (newest period first). */
export function useMissions() {
  const uid = useSession((s) => s.uid);
  return useCollectionQuery<UserMission>(
    ['missions', uid],
    uid ? paths.missions(uid) : null,
    [orderBy('expiresAt', 'asc')],
    !!uid,
  );
}

/** The single active season (or null while none is open). */
export function useSeason() {
  return useCollectionQuery<Season>(
    ['season', 'active'],
    paths.seasons(),
    [where('active', '==', true), limit(1)],
    true,
  );
}

/** Ranked standings for a season (top N). */
export function useSeasonStandings(seasonId: string | null, max = 100) {
  return useCollectionQuery<SeasonStanding>(
    ['seasonStandings', seasonId, max],
    seasonId ? paths.seasonStandings(seasonId) : null,
    [orderBy('rank', 'asc'), limit(max)],
    !!seasonId,
  );
}

/** The current user's own standing row in a season. */
export function useMySeasonStanding(seasonId: string | null) {
  const uid = useSession((s) => s.uid);
  return useDocQuery<SeasonStanding>(
    ['seasonStanding', seasonId, uid],
    seasonId && uid ? paths.seasonStanding(seasonId, uid) : null,
    !!(seasonId && uid),
  );
}

/** A Wrapped recap doc for the current user + period. */
export function useWrapped(periodId: string | null) {
  const uid = useSession((s) => s.uid);
  return useDocQuery<Wrapped>(
    ['wrapped', uid, periodId],
    uid && periodId ? paths.wrappedDoc(uid, periodId) : null,
    !!(uid && periodId),
  );
}

// ─── Mutations ─────────────────────────────────────────────────────────────--

/** Seed the current period's missions on app open (no-op if already present). */
export function useEnsureMissions() {
  return useMutation<{ ok: boolean; created: number }, unknown, void>({
    mutationFn: () => fns.ensureMissions() as Promise<{ ok: boolean; created: number }>,
    // Silent — this runs on app open. Errors are non-fatal for browsing.
    onError: () => undefined,
  });
}

/** Claim a completed mission's reward. Server grants Chips + XP via the ledger. */
export function useClaimMission() {
  return useMutation<{ ok: boolean; reward: number; xp: number }, unknown, string>({
    mutationFn: (missionId) =>
      fns.claimMission({ missionId }) as Promise<{ ok: boolean; reward: number; xp: number }>,
    onSuccess: (res) => {
      if (res.reward > 0) toastSuccess(`+${formatChips(res.reward)} Chips`, `+${res.xp} XP`);
    },
    onError: (err) => toastError("Couldn't claim mission", err),
  });
}

export interface GenerateWrappedResult {
  ok: boolean;
  periodId: string;
  wrapped: Wrapped;
}

/** Compute (or refresh) the caller's Wrapped recap for a period. */
export function useGenerateWrapped() {
  const qc = useQueryClient();
  const uid = useSession((s) => s.uid);
  return useMutation<GenerateWrappedResult, unknown, string | undefined>({
    mutationFn: (periodId) =>
      fns.generateWrapped(periodId ? { periodId } : {}) as unknown as Promise<GenerateWrappedResult>,
    onSuccess: (res) => {
      if (uid) qc.setQueryData(['wrapped', uid, res.periodId], res.wrapped);
    },
    onError: (err) => toastError("Couldn't build your Wrapped", err),
  });
}
