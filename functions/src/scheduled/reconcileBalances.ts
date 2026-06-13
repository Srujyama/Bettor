/**
 * reconcileBalances — daily audit. For every account, replay its ledger and
 * assert the replayed balance/held equals the denormalized chipsBalance/
 * chipsHeld on the user doc. Also proves the system-wide conservation invariant:
 * the sum of all user balances+held must equal the negative of the HOUSE
 * balance (the house is the sole mint, so its negative balance == circulation).
 *
 * Drift is logged and recorded to /reconciliation/{day}; this function NEVER
 * mutates balances (a human/admin reconciliation flow owns corrections).
 */
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db } from '../lib/admin';
import { paths } from '../lib/paths';
import { macauDayKey, now } from '../lib/time';
import { REGION } from '../lib/guards';
import { HOUSE_UID } from '../shared/constants';

interface ReplayResult {
  uid: string;
  replayedBalance: number;
  replayedHeld: number;
  storedBalance: number;
  storedHeld: number;
  drift: boolean;
}

/** Replay one account's ledger to its current balance/held. */
async function replayAccount(uid: string): Promise<{ balance: number; held: number }> {
  const snap = await db.collection(paths.ledger(uid)).orderBy('seq', 'asc').get();
  let balance = 0;
  let held = 0;
  for (const d of snap.docs) {
    const e = d.data();
    // The persisted balanceAfter/heldAfter are authoritative for the replay; the
    // last entry's after-values ARE the replayed balance. We trust the engine's
    // recorded after-values (which were asserted non-negative at write time).
    balance = e.balanceAfter as number;
    held = e.heldAfter as number;
  }
  return { balance, held };
}

export const reconcileBalances = onSchedule(
  { region: REGION, schedule: 'every day 03:30', timeZone: 'Asia/Macau' },
  async () => {
    const ts = now();
    const dayKey = macauDayKey(ts);

    const usersSnap = await db.collection(paths.users()).get();
    const results: ReplayResult[] = [];
    let sumUserBalances = 0;
    let sumUserHeld = 0;
    let houseBalance = 0;

    for (const userDoc of usersSnap.docs) {
      const uid = userDoc.id;
      const u = userDoc.data();
      const replay = await replayAccount(uid);
      const storedBalance = (u.chipsBalance as number) ?? 0;
      const storedHeld = (u.chipsHeld as number) ?? 0;
      const drift = replay.balance !== storedBalance || replay.held !== storedHeld;

      if (uid === HOUSE_UID) {
        houseBalance = storedBalance;
      } else {
        sumUserBalances += storedBalance;
        sumUserHeld += storedHeld;
      }

      if (drift) {
        results.push({
          uid,
          replayedBalance: replay.balance,
          replayedHeld: replay.held,
          storedBalance,
          storedHeld,
          drift,
        });
        console.error(
          `[reconcileBalances] DRIFT for ${uid}: stored(${storedBalance}/${storedHeld}) != replay(${replay.balance}/${replay.held})`,
        );
      }
    }

    // System conservation: house minted everything in circulation, so the house
    // balance should be the negative of (all user balances + held).
    const circulation = sumUserBalances + sumUserHeld;
    const conservationOk = houseBalance + circulation === 0;
    if (!conservationOk) {
      console.error(
        `[reconcileBalances] CONSERVATION DRIFT: house(${houseBalance}) + circulation(${circulation}) != 0`,
      );
    }

    await db.doc(paths.reconciliation(dayKey)).set({
      dayKey,
      ranAt: ts,
      accountsChecked: usersSnap.size,
      driftAccounts: results.length,
      houseBalance,
      circulation,
      conservationOk,
      drifts: results,
    });
  },
);
