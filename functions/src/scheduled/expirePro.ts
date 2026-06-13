/**
 * expirePro — hourly sweep that flips `users/{uid}.pro.active` to false once the
 * Pro period's `expiresAt` has passed. Each flip is its own small transaction
 * that re-checks expiry to avoid racing a renewal via subscribePro. Moves NO
 * money (the subscription was charged up front).
 */
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db } from '../lib/admin';
import { paths } from '../lib/paths';
import { now } from '../lib/time';
import { REGION } from '../lib/guards';

export const expirePro = onSchedule(
  { region: REGION, schedule: 'every 60 minutes', timeZone: 'Asia/Macau' },
  async () => {
    const ts = now();
    const due = await db
      .collection(paths.users())
      .where('pro.active', '==', true)
      .where('pro.expiresAt', '<=', ts)
      .limit(300)
      .get();

    for (const doc of due.docs) {
      const userRef = db.doc(paths.user(doc.id));
      await db
        .runTransaction(async (tx) => {
          const snap = await tx.get(userRef);
          const pro = snap.data()?.pro as { active?: boolean; expiresAt?: number | null } | undefined;
          if (!pro || pro.active !== true) return;
          if ((pro.expiresAt ?? 0) > now()) return; // renewed since the query
          tx.set(userRef, { pro: { ...pro, active: false } }, { merge: true });
        })
        .catch((e) => {
          console.error(`[expirePro] failed to expire ${doc.id}`, e);
        });
    }
  },
);
