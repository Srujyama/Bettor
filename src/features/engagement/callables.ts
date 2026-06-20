/**
 * Engagement-track callable wrappers.
 *
 * The shared `fns.*` wrappers (claimHourlyDrop / openChest / dailySpin) live in
 * the Casino-track-owned `@/lib/firebase/functions.ts`; this file ONLY adds the
 * `recordActivity` wrapper, which is unique to this track and not in that shared
 * list. We build it the same way `functions.ts` does — a typed `httpsCallable`
 * bound to the shared `functions` instance from the firebase swap-boundary — so
 * the engagement hooks have a single, typed entry point. No money is computed
 * client-side; this only invokes the server callable.
 */
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';

export interface RecordActivityResult {
  ok: boolean;
  dayStreak: number;
  lastActiveDay: string;
  changed: boolean;
}

const _recordActivity = httpsCallable<Record<string, never>, RecordActivityResult>(
  functions,
  'recordActivity',
);

/** Ping the server once on app open to advance the day-streak meter. */
export async function recordActivity(): Promise<RecordActivityResult> {
  const res = await _recordActivity({});
  return res.data;
}
