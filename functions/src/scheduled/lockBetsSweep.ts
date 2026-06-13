/**
 * lockBetsSweep — every minute, transition open bets whose lockAt has passed to
 * 'locked' so no further entries are accepted. Each flip is its own small
 * transaction (re-checks status to avoid racing placeBet). Moves NO money.
 */
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db } from '../lib/admin';
import { paths } from '../lib/paths';
import { now } from '../lib/time';
import { REGION } from '../lib/guards';
import { BET_STATUS } from '../shared/constants';
import { canTransition } from '../shared/betStateMachine';

export const lockBetsSweep = onSchedule(
  { region: REGION, schedule: 'every 1 minutes', timeZone: 'Asia/Macau' },
  async () => {
    const ts = now();
    const due = await db
      .collection(paths.bets())
      .where('status', '==', BET_STATUS.OPEN)
      .where('lockAt', '<=', ts)
      .limit(200)
      .get();

    for (const doc of due.docs) {
      const betRef = db.doc(paths.bet(doc.id));
      await db
        .runTransaction(async (tx) => {
          const snap = await tx.get(betRef);
          if (!snap.exists) return;
          const bet = snap.data()!;
          if (bet.status !== BET_STATUS.OPEN) return;
          if ((bet.lockAt as number) > now()) return;
          if (!canTransition(bet.status as never, BET_STATUS.LOCKED)) return;
          tx.set(betRef, { status: BET_STATUS.LOCKED, lockedAt: now() }, { merge: true });
        })
        .catch((e) => {
          console.error(`[lockBetsSweep] failed to lock ${doc.id}`, e);
        });
    }
  },
);
