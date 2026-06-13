/**
 * onSettlementRivalry — head-to-head rivalry tracker.
 *
 * Keyed off the CREATION of the immutable settlement/result doc (the base
 * onBetSettled trigger, owned elsewhere, only fans out social artifacts). For
 * every pair of OPPOSING participants in the settled bet, we update the
 * rivalries/{pairId} aggregate: total head-to-head bets, each side's win count,
 * and A's net Chips against B.
 *
 *   pairId = [uidA, uidB].sort().join('__')  — uidA is always the lexicographically
 *   smaller uid, so aWins/bWins/aNetChips are stable across both viewers. This
 *   matches the client `rivalryPairId` helper in src/lib/firebase/paths.ts.
 *
 * Idempotent: the result doc is written once and is immutable, so onDocumentCreated
 * fires exactly once per settlement; we additionally guard with a per-pair marker
 * inside the transaction so a retry never double-counts. Refund/void settlements
 * (no winner) are skipped — they aren't a head-to-head result.
 */
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../lib/admin';
import { paths } from '../lib/paths';
import { now } from '../lib/time';
import { REGION } from '../lib/guards';

interface SettledEntry {
  uid: string;
  stake: number;
  outcomeId: string;
  payout: number;
  won: boolean;
}

export const onSettlementRivalry = onDocumentCreated(
  { region: REGION, document: 'bets/{betId}/settlement/result' },
  async (event) => {
    const betId = event.params.betId;
    const settlement = event.data?.data();
    if (!settlement) return;

    // Refund / void settlements have no winning side — not a head-to-head result.
    if (settlement.model === 'REFUND_ALL' || settlement.winningOutcomeId == null) return;
    const winningOutcomeId = settlement.winningOutcomeId as string;

    // Build per-uid outcome + payout from the settlement payouts + the entries.
    const payoutByUid = new Map<string, number>(
      ((settlement.payouts as { uid: string; amount: number }[]) ?? []).map((p) => [p.uid, p.amount]),
    );

    const entriesSnap = await db.collection(paths.entries(betId)).get();
    const entries: SettledEntry[] = entriesSnap.docs
      .map((d) => d.data())
      .filter((e) => (e.status as string) !== 'cancelled')
      .map((e) => {
        const uid = e.uid as string;
        const outcomeId = e.outcomeId as string;
        return {
          uid,
          stake: (e.stake as number) ?? 0,
          outcomeId,
          payout: payoutByUid.get(uid) ?? 0,
          won: outcomeId === winningOutcomeId,
        };
      });

    if (entries.length < 2) return;

    // Net Chips for a participant on THIS bet = payout - stake.
    const netByUid = new Map(entries.map((e) => [e.uid, e.payout - e.stake]));

    // Form every pair of OPPOSING participants (different chosen outcomes).
    const seenPairs = new Set<string>();
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const x = entries[i];
        const y = entries[j];
        if (x.uid === y.uid) continue;
        if (x.outcomeId === y.outcomeId) continue; // same side — not a head-to-head

        const [uidA, uidB] = [x.uid, y.uid].sort();
        const pairId = `${uidA}__${uidB}`;
        if (seenPairs.has(pairId)) continue;
        seenPairs.add(pairId);

        const a = x.uid === uidA ? x : y; // the lexicographically-smaller uid
        const b = x.uid === uidA ? y : x;
        const aNet = netByUid.get(uidA) ?? 0;

        await db.runTransaction(async (tx) => {
          const rivalryRef = db.doc(paths.rivalry(pairId));
          // Per-settlement marker so a trigger retry can't double-count this pair.
          const markerRef = db.doc(paths.rivalryMark(pairId, betId));

          const [rivalrySnap, markerSnap] = await Promise.all([
            tx.get(rivalryRef),
            tx.get(markerRef),
          ]);
          if (markerSnap.exists) return; // already counted this bet for this pair

          const ts = now();
          if (!rivalrySnap.exists) {
            tx.set(rivalryRef, {
              pairId,
              uidA,
              uidB,
              aWins: a.won ? 1 : 0,
              bWins: b.won ? 1 : 0,
              totalBets: 1,
              aNetChips: aNet,
              lastBetAt: ts,
            });
          } else {
            tx.set(
              rivalryRef,
              {
                aWins: FieldValue.increment(a.won ? 1 : 0),
                bWins: FieldValue.increment(b.won ? 1 : 0),
                totalBets: FieldValue.increment(1),
                aNetChips: FieldValue.increment(aNet),
                lastBetAt: ts,
              },
              { merge: true },
            );
          }

          tx.set(markerRef, { betId, pairId, countedAt: ts });
        });
      }
    }
  },
);
