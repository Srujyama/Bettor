/**
 * settleAfterDisputeWindow — every 5 minutes, finalize bets whose dispute window
 * has elapsed without an open dispute. Two atomic steps per bet:
 *   1. Transition pending_resolution → resolved (re-checking there is no open
 *      dispute, the window has truly passed, and a winner is set).
 *   2. Run the settlement engine (atomic, idempotent) to pay out and flip to
 *      settled.
 * A bet that became 'disputed' is skipped entirely (trust & safety owns it).
 */
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { HttpsError } from 'firebase-functions/v2/https';
import { db } from '../lib/admin';
import { paths } from '../lib/paths';
import { now } from '../lib/time';
import { REGION } from '../lib/guards';
import { runSettlement } from '../settlement/settle';
import { BET_STATUS } from '../shared/constants';

export const settleAfterDisputeWindow = onSchedule(
  { region: REGION, schedule: 'every 5 minutes', timeZone: 'Asia/Macau' },
  async () => {
    const ts = now();
    const due = await db
      .collection(paths.bets())
      .where('status', '==', BET_STATUS.PENDING_RESOLUTION)
      .where('disputeWindowEndsAt', '<=', ts)
      .limit(100)
      .get();

    for (const doc of due.docs) {
      const betId = doc.id;
      try {
        // Step 1: advance to RESOLVED iff still clean.
        const ready = await db.runTransaction(async (tx) => {
          const betRef = db.doc(paths.bet(betId));
          const betSnap = await tx.get(betRef);
          if (!betSnap.exists) return false;
          const bet = betSnap.data()!;
          if (bet.status !== BET_STATUS.PENDING_RESOLUTION) return false;
          if (((bet.disputeWindowEndsAt as number | null) ?? 0) > now()) return false;
          if (!bet.winningOutcomeId) return false;

          // Any open dispute freezes settlement.
          const openDisputes = await tx.get(
            db.collection(paths.disputes(betId)).where('status', '==', 'open').limit(1),
          );
          if (!openDisputes.empty) return false;

          tx.set(betRef, { status: BET_STATUS.RESOLVED }, { merge: true });
          return true;
        });

        if (!ready) continue;

        // Step 2: settle (idempotent).
        await runSettlement(betId, { settledBy: 'system', terminalStatus: BET_STATUS.SETTLED });
      } catch (e) {
        if (e instanceof HttpsError && e.code === 'failed-precondition') continue;
        console.error(`[settleAfterDisputeWindow] failed to settle ${betId}`, e);
      }
    }
  },
);
