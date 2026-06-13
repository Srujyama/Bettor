/**
 * onBetSettled — fires when a bet transitions to 'settled'. Reads the settlement
 * result and fans out NON-financial feed items + notifications: each winner gets
 * a "you won" notification, and big wins (above a threshold) post a celebratory
 * feed item to the winner and a "big win" item to their friends. NEVER touches
 * balances or the ledger.
 */
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { db } from '../lib/admin';
import { paths } from '../lib/paths';
import { REGION } from '../lib/guards';
import { pushFeedItem, pushNotification, acceptedFriendUids } from '../lib/notify';
import { BET_STATUS } from '../shared/constants';

const BIG_WIN_THRESHOLD = 1_000; // Chips of profit that count as a "big win"

export const onBetSettled = onDocumentUpdated(
  { region: REGION, document: 'bets/{betId}' },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;
    // Only act on the open → settled edge.
    if (before.status === BET_STATUS.SETTLED || after.status !== BET_STATUS.SETTLED) return;

    const betId = event.params.betId;
    const betTitle = (after.title as string) ?? 'a bet';

    const settlementSnap = await db.doc(paths.settlement(betId)).get();
    if (!settlementSnap.exists) return;
    const settlement = settlementSnap.data()!;
    const payouts = (settlement.payouts as { uid: string; amount: number; profit: number }[]) ?? [];

    const batch = db.batch();
    const bigWinners: { uid: string; profit: number; name: string }[] = [];

    for (const p of payouts) {
      if (p.profit <= 0) continue;

      pushNotification(batch, p.uid, {
        type: 'bet_settled',
        title: 'You won! 🎉',
        body: `Your bet "${betTitle}" settled — you took home ${p.amount} Chips.`,
        betId,
        deepLink: `chipd://bet/${betId}`,
      });

      // Resolve a display name for the feed cards.
      const winnerSnap = await db.doc(paths.user(p.uid)).get();
      const name = (winnerSnap.data()?.displayName as string) ?? 'A player';

      pushFeedItem(batch, p.uid, {
        type: 'bet_settled',
        actorUid: p.uid,
        actorName: name,
        actorPhotoURL: (winnerSnap.data()?.photoURL as string | null) ?? null,
        betId,
        betTitle,
        amount: p.amount,
      });

      if (p.profit >= BIG_WIN_THRESHOLD) bigWinners.push({ uid: p.uid, profit: p.profit, name });
    }

    await batch.commit();

    // Fan out big wins to friends (separate pass so the per-winner batch stays small).
    for (const w of bigWinners) {
      const friends = await acceptedFriendUids(w.uid);
      if (friends.length === 0) continue;
      const fanout = db.batch();
      const winnerSnap = await db.doc(paths.user(w.uid)).get();
      const photo = (winnerSnap.data()?.photoURL as string | null) ?? null;
      for (const fuid of friends) {
        pushFeedItem(fanout, fuid, {
          type: 'big_win',
          actorUid: w.uid,
          actorName: w.name,
          actorPhotoURL: photo,
          betId,
          betTitle,
          amount: w.profit,
        });
      }
      await fanout.commit();
    }
  },
);
