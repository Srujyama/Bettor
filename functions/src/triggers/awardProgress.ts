/**
 * awardProgress — fires on every users/{uid} update. The settlement engine and
 * other callables only bump RAW stat counters (winCount, currentStreak, xp,
 * lifetimeWon, …); this trigger turns those into gamification grants:
 *
 *   1) recompute satisfiedAchievements(stats) and unlock any NEW ones, granting
 *      ACHIEVEMENT_GRANT Chips and writing users/{uid}/achievements/{key}.
 *   2) recompute level from total xp; on a level increase, grant levelUpReward
 *      for each newly-passed level and persist the new `level`.
 *   3) increment relevant daily/weekly mission progress (win_bets) and mark
 *      missions complete when they hit target.
 *
 * Idempotent: an achievement is only granted if its doc is absent; level rewards
 * use a per-level ledger key and a stored `level` watermark; mission bumps are
 * derived from the winCount delta (before → after) so a no-op update is a no-op.
 * NEVER recurses dangerously — writes here only touch achievement/mission docs +
 * `level`/`xp` fields, and the ledger updates balances; we early-out when the
 * relevant inputs are unchanged.
 */
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { db } from '../lib/admin';
import { paths } from '../lib/paths';
import { now } from '../lib/time';
import { REGION } from '../lib/guards';
import { grantChips } from '../lib/ledger';
import { statsFromUser } from '../lib/gamify';
import {
  ACHIEVEMENT_BY_KEY,
  levelFromXp,
  levelUpReward,
  satisfiedAchievements,
} from '../shared/gamification';
import { HOUSE_UID, LEDGER_REASON } from '../shared/constants';

export const awardProgress = onDocumentUpdated(
  {
    region: REGION,
    document: 'users/{uid}',
    // Keep cold starts cheap; this runs often.
    memory: '256MiB',
    retry: false,
  },
  async (event) => {
    const uid = event.params.uid;
    if (uid === HOUSE_UID) return; // never gamify the house pseudo-account

    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;

    const ts = now();

    // ── 1) Achievements ──────────────────────────────────────────────────────
    const satisfied = satisfiedAchievements(statsFromUser(after));
    // Read which achievement docs already exist so we only grant NEW unlocks.
    const existing = await db.collection(paths.achievements(uid)).get();
    const have = new Set(existing.docs.map((d) => d.id));
    const newlyUnlocked = satisfied.filter((key) => !have.has(key));

    for (const key of newlyUnlocked) {
      const def = ACHIEVEMENT_BY_KEY[key];
      if (!def) continue;
      try {
        await db.runTransaction(async (tx) => {
          const achRef = db.doc(paths.achievement(uid, key));
          const achSnap = await tx.get(achRef);
          if (achSnap.exists) return; // raced — already granted
          if (def.reward > 0) {
            await grantChips(tx, {
              uid,
              amount: def.reward,
              reason: LEDGER_REASON.ACHIEVEMENT_GRANT,
              idempotencyKey: `achievement:${uid}:${key}`,
              memo: `Achievement: ${def.title}`,
            });
          }
          tx.set(achRef, {
            achievementId: key,
            key,
            tier: def.tier,
            unlockedAt: ts,
            rewardGranted: def.reward,
            // Denormalize a little metadata so the gallery can render fast.
            title: def.title,
            description: def.description,
            icon: def.icon,
          });
        });
      } catch (e) {
        console.error(`[awardProgress] achievement grant failed ${uid}/${key}`, e);
      }
    }

    // ── 2) Level-ups ─────────────────────────────────────────────────────────
    const totalXp = (after.xp as number) ?? 0;
    const computed = levelFromXp(totalXp);
    const storedLevel = (after.level as number) ?? 1;
    if (computed.level > storedLevel) {
      try {
        await db.runTransaction(async (tx) => {
          const userRef = db.doc(paths.user(uid));
          const snap = await tx.get(userRef);
          const cur = (snap.data()?.level as number) ?? 1;
          const target = levelFromXp((snap.data()?.xp as number) ?? totalXp).level;
          if (target <= cur) return; // already advanced by a concurrent run
          // Grant the reward for EACH newly-passed level (idempotent per level).
          for (let lvl = cur + 1; lvl <= target; lvl++) {
            const reward = levelUpReward(lvl);
            if (reward > 0) {
              await grantChips(tx, {
                uid,
                amount: reward,
                reason: LEDGER_REASON.LEVEL_UP_REWARD,
                idempotencyKey: `level:${uid}:${lvl}`,
                memo: `Reached level ${lvl}`,
              });
            }
          }
          tx.set(userRef, { level: target }, { merge: true });
        });
      } catch (e) {
        console.error(`[awardProgress] level-up failed ${uid}`, e);
      }
    }

    // ── 3) Mission progress (win-based) ───────────────────────────────────────
    // A win increments winCount; mirror that delta into any active win_bets
    // missions. Other metrics (place_bets, comment, …) are incremented at their
    // source callables; here we only react to the stat we can observe.
    const winDelta = ((after.winCount as number) ?? 0) - ((before.winCount as number) ?? 0);
    if (winDelta > 0) {
      try {
        const missionsSnap = await db
          .collection(paths.missions(uid))
          .where('metric', '==', 'win_bets')
          .where('expiresAt', '>', ts)
          .get();
        if (!missionsSnap.empty) {
          const batch = db.batch();
          for (const m of missionsSnap.docs) {
            const data = m.data();
            if (data.claimed === true) continue;
            const target = (data.target as number) ?? 0;
            const next = Math.min(target, ((data.progress as number) ?? 0) + winDelta);
            batch.set(
              m.ref,
              { progress: next, completed: next >= target },
              { merge: true },
            );
          }
          await batch.commit();
        }
      } catch (e) {
        console.error(`[awardProgress] mission bump failed ${uid}`, e);
      }
    }
  },
);
