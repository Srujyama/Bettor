/**
 * onBetSettledPowerUps — post-settlement compensation for placement power-ups,
 * implemented WITHOUT editing the base settlement engine (settle.ts is owned).
 *
 * When a bet reaches 'settled', the base engine has already paid winners and
 * forfeited losers. This trigger then reads entries flagged with a `powerUp`
 * (stamped earlier by `applyPowerUp`) and posts a compensating ledger txn from
 * the HOUSE via POWERUP_PAYOUT:
 *   - 'insurance'  → if the entry LOST, refund half the original stake.
 *   - 'double'     → if the entry WON, pay a bonus equal to its profit again.
 * Each compensation is idempotent (keyed by bet+uid+powerup) and marks the
 * entry's powerUp.resolved so a re-fire is a no-op. Conserved: the house mints
 * the bonus/refund exactly like a grant. Never edits balances directly.
 */
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { db } from '../lib/admin';
import { paths } from '../lib/paths';
import { now } from '../lib/time';
import { REGION } from '../lib/guards';
import { grantChips } from '../lib/ledger';
import { insurancePayout, DOUBLE_OR_NOTHING_MULTIPLIER } from '../shared/formats';
import { BET_STATUS, LEDGER_REASON } from '../shared/constants';

export const onBetSettledPowerUps = onDocumentUpdated(
  { region: REGION, document: 'bets/{betId}' },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;
    // Only the open → settled edge (never on void/refund — power-ups lapse there).
    if (before.status === BET_STATUS.SETTLED || after.status !== BET_STATUS.SETTLED) return;

    const betId = event.params.betId;

    // Find entries that carry an unresolved power-up.
    const flagged = await db
      .collection(paths.entries(betId))
      .where('powerUp.resolved', '==', false)
      .get();
    if (flagged.empty) return;

    for (const doc of flagged.docs) {
      const entry = doc.data();
      const powerUp = entry.powerUp as { key: string; resolved: boolean } | undefined;
      if (!powerUp || powerUp.resolved) continue;

      const uid = entry.uid as string;
      const stake = (entry.stake as number) ?? 0;
      const status = entry.status as string; // 'won' | 'lost' | 'refunded'
      const payoutAmount = (entry.payoutAmount as number) ?? 0;

      let bonus = 0;
      let memo = '';
      if (powerUp.key === 'insurance') {
        // Refund half the stake only when the entry lost.
        bonus = insurancePayout(stake, status === 'won');
        memo = `Insurance refund on bet ${betId}`;
      } else if (powerUp.key === 'double') {
        // Pay the profit again when the entry won.
        if (status === 'won') {
          const profit = Math.max(0, payoutAmount - stake);
          bonus = profit * (DOUBLE_OR_NOTHING_MULTIPLIER - 1);
        }
        memo = `Double-or-nothing bonus on bet ${betId}`;
      }

      const ts = now();
      await db
        .runTransaction(async (tx) => {
          // Re-read the entry inside the txn to avoid double-paying on a re-fire.
          const entryRef = db.doc(paths.entry(betId, uid));
          const fresh = await tx.get(entryRef);
          const freshPowerUp = fresh.data()?.powerUp as { resolved: boolean } | undefined;
          if (!freshPowerUp || freshPowerUp.resolved) return;

          if (bonus > 0) {
            await grantChips(tx, {
              uid,
              amount: bonus,
              reason: LEDGER_REASON.POWERUP_PAYOUT,
              idempotencyKey: `powerup_payout:${betId}:${uid}:${powerUp.key}`,
              betId,
              memo,
            });
          }
          tx.set(
            entryRef,
            { powerUp: { ...freshPowerUp, resolved: true, payout: bonus, resolvedAt: ts } },
            { merge: true },
          );
        })
        .catch((e) => {
          console.error(`[onBetSettledPowerUps] failed for ${betId}/${uid}`, e);
        });
    }
  },
);
