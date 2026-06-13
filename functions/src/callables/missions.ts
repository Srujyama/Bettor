/**
 * Mission callables.
 *  - ensureMissions: client calls this on app open. Seeds the current daily +
 *    weekly missions into users/{uid}/missions/{missionId} if they are absent
 *    for the active period. No money moves; pure seeding, idempotent per period.
 *  - claimMission: validates ClaimMissionPayloadSchema; if the mission is
 *    completed && !claimed, grants reward Chips (ledger MISSION_REWARD) + XP and
 *    marks it claimed. Idempotent via the mission's `claimed` flag and a
 *    period-scoped ledger key.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../lib/admin';
import { paths } from '../lib/paths';
import { now } from '../lib/time';
import { callableOpts, requireAuth, assertUserAllowed, toHttpsError } from '../lib/guards';
import { grantChips } from '../lib/ledger';
import { missionsForPeriod, seedMissionDoc } from '../lib/gamify';
import { ClaimMissionPayloadSchema } from '../shared/schemas-ext';
import { LEDGER_REASON } from '../shared/constants';

export const ensureMissions = onCall(callableOpts, async (req) => {
  try {
    const uid = requireAuth(req);
    const ts = now();

    const userSnap = await db.doc(paths.user(uid)).get();
    assertUserAllowed(userSnap.data(), { requireAge: false });

    const defs = [...missionsForPeriod('daily'), ...missionsForPeriod('weekly')];
    const seeds = defs.map((d) => seedMissionDoc(d, ts));

    // Read existing docs once; only create the ones missing for this period.
    const missionsCol = db.collection(paths.missions(uid));
    const existing = await Promise.all(seeds.map((s) => missionsCol.doc(s.missionId).get()));

    const batch = db.batch();
    let seeded = 0;
    seeds.forEach((seed, i) => {
      if (!existing[i].exists) {
        batch.set(missionsCol.doc(seed.missionId), seed);
        seeded += 1;
      }
    });
    if (seeded > 0) await batch.commit();

    return { ok: true, created: seeded, seeded, total: seeds.length };
  } catch (e) {
    throw toHttpsError(e, 'Failed to load missions.');
  }
});

export const claimMission = onCall(callableOpts, async (req) => {
  try {
    const uid = requireAuth(req);
    const payload = ClaimMissionPayloadSchema.parse(req.data);

    return await db.runTransaction(async (tx) => {
      const userRef = db.doc(paths.user(uid));
      const missionRef = db.doc(paths.mission(uid, payload.missionId));

      const [userSnap, missionSnap] = await Promise.all([tx.get(userRef), tx.get(missionRef)]);
      assertUserAllowed(userSnap.data(), { requireAge: false });

      if (!missionSnap.exists) throw new HttpsError('not-found', 'Mission not found.');
      const mission = missionSnap.data()!;
      const ts = now();

      if (mission.claimed === true) {
        return { ok: true, granted: 0, reward: 0, xp: 0, alreadyClaimed: true };
      }
      const progress = (mission.progress as number) ?? 0;
      const target = (mission.target as number) ?? 0;
      const completed = mission.completed === true || progress >= target;
      if (!completed) {
        throw new HttpsError('failed-precondition', 'This mission is not complete yet.');
      }

      const reward = (mission.reward as number) ?? 0;
      const xp = (mission.xp as number) ?? 0;

      if (reward > 0) {
        await grantChips(tx, {
          uid,
          amount: reward,
          reason: LEDGER_REASON.MISSION_REWARD,
          idempotencyKey: `mission:${uid}:${payload.missionId}`,
          memo: `Mission reward: ${mission.key ?? payload.missionId}`,
        });
      }

      tx.set(missionRef, { claimed: true, completed: true, claimedAt: ts }, { merge: true });
      if (xp > 0) tx.set(userRef, { xp: FieldValue.increment(xp) }, { merge: true });

      return { ok: true, granted: reward, reward, xp };
    });
  } catch (e) {
    throw toHttpsError(e, 'Failed to claim mission.');
  }
});
