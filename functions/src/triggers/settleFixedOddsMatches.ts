/**
 * settleFixedOddsMatches — settles every matched fixed-odds pair on a bet when
 * that bet reaches a terminal money state.
 *
 * The base pari-mutuel settlement engine (settlement/settle.ts) is NOT touched:
 * it only handles bets/{betId}/entries. Fixed-odds matched offers live in a
 * separate sub-collection (bets/{betId}/matches) and settle here independently.
 *
 * Trigger: the bet document UPDATE edge into 'settled' (a winner is known) or
 * 'voided' (refund both sides). For each match with status='matched' on that bet:
 *   - SETTLED  → settleMatch(backerStake, odds, backedOutcomeId === winningOutcomeId):
 *                pay the winner (maker if their backed side hit, else the taker)
 *                the WHOLE pot via the ledger (OFFER_PAYOUT) — release the winner's
 *                own escrow + credit the loser's forfeited escrow — then mark the
 *                match settled + winner.
 *   - VOIDED   → refund both sides their escrow (OFFER_REFUND) and mark the match
 *                'void'.
 *
 * Idempotent per match: each match carries its own ledger idempotency key and we
 * only act on status='matched', so a trigger retry (or a second terminal edge)
 * is a no-op. Chips are conserved exactly (pot == backerStake + layerRisk).
 */
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { db } from '../lib/admin';
import { paths } from '../lib/paths';
import { now } from '../lib/time';
import { settlementOpts } from '../lib/guards';
import { postLedgerTxn, LedgerLeg } from '../lib/ledger';
import { settleMatch, refundMatch } from '../shared/fixedodds';
import { BET_STATUS, LEDGER_DIRECTION, LEDGER_REASON } from '../shared/constants';

export const settleFixedOddsMatches = onDocumentUpdated(
  { ...settlementOpts, document: 'bets/{betId}' },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;

    const wasTerminal =
      before.status === BET_STATUS.SETTLED || before.status === BET_STATUS.VOIDED;
    const isSettled = after.status === BET_STATUS.SETTLED;
    const isVoided = after.status === BET_STATUS.VOIDED;
    // Only act on the FIRST edge into a terminal money state.
    if (wasTerminal || (!isSettled && !isVoided)) return;

    const betId = event.params.betId;
    const winningOutcomeId = (after.winningOutcomeId as string | null) ?? null;

    // Load every matched pair on this bet. (Already-settled/void matches are skipped.)
    const matchesSnap = await db.collection(paths.matches(betId)).get();
    const matches = matchesSnap.docs
      .map((d) => ({ id: d.id, data: d.data() }))
      .filter((m) => (m.data.status as string) === 'matched');
    if (matches.length === 0) return;

    // Settle each match in its OWN transaction so one failure can't block the rest,
    // and so each carries an independent idempotency key.
    for (const m of matches) {
      const data = m.data;
      const makerUid = data.makerUid as string;
      const takerUid = data.takerUid as string;
      const backerStake = (data.backerStake as number) ?? 0;
      const odds = data.odds as number;
      const backedOutcomeId = data.backedOutcomeId as string;
      const pot = (data.pot as number) ?? 0;
      const layerRisk = (data.layerRisk as number) ?? 0;

      await db.runTransaction(async (tx) => {
        const matchRef = db.doc(paths.match(betId, m.id));
        const fresh = await tx.get(matchRef);
        if (!fresh.exists) return;
        // Re-check inside the txn: only a still-'matched' pair settles.
        if ((fresh.data()!.status as string) !== 'matched') return;

        const ts = now();

        if (isVoided || !winningOutcomeId) {
          // VOID: each side gets exactly their escrow back (held → balance).
          const refund = refundMatch(backerStake, odds);
          const voidLegs: LedgerLeg[] = [
            {
              uid: makerUid,
              direction: LEDGER_DIRECTION.CREDIT,
              amount: refund.backerRefund,
              reason: LEDGER_REASON.OFFER_REFUND,
              bucket: 'release' as const,
              memo: `Refund (void) backer on match ${m.id}`,
            },
            {
              uid: takerUid,
              direction: LEDGER_DIRECTION.CREDIT,
              amount: refund.layerRefund,
              reason: LEDGER_REASON.OFFER_REFUND,
              bucket: 'release' as const,
              memo: `Refund (void) layer on match ${m.id}`,
            },
          ];
          const legs: LedgerLeg[] = voidLegs.filter((l) => l.amount > 0);

          if (legs.length > 0) {
            await postLedgerTxn(tx, {
              idempotencyKey: `offer:void:${betId}:${m.id}`,
              txnGroupId: `offer:void:${betId}:${m.id}`,
              betId,
              legs,
            });
          }

          tx.set(matchRef, { status: 'void', winner: null, settledAt: ts }, { merge: true });
          return;
        }

        // SETTLED: the backer wins iff their backed outcome is the winning one.
        const backerWon = backedOutcomeId === winningOutcomeId;
        const result = settleMatch(backerStake, odds, backerWon);
        const winnerUid = result.winner === 'backer' ? makerUid : takerUid;
        const loserUid = result.winner === 'backer' ? takerUid : makerUid;
        // The winner staked their own escrow; the loser forfeits theirs.
        const winnerOwnEscrow = result.winner === 'backer' ? backerStake : layerRisk;
        const loserForfeit = pot - winnerOwnEscrow; // == the loser's escrow
        const winnerProfit = result.payout - winnerOwnEscrow; // == loserForfeit

        // Pay the winner the whole pot: release their own escrow back to balance,
        // credit the profit (sourced from the loser's forfeited escrow), and
        // forfeit the loser's held escrow. Conserves Chips exactly.
        const legs: LedgerLeg[] = [
          {
            uid: winnerUid,
            direction: LEDGER_DIRECTION.CREDIT,
            amount: winnerOwnEscrow,
            reason: LEDGER_REASON.OFFER_PAYOUT,
            bucket: 'release',
            memo: `Stake released on match ${m.id}`,
          },
        ];
        if (winnerProfit > 0) {
          legs.push({
            uid: winnerUid,
            direction: LEDGER_DIRECTION.CREDIT,
            amount: winnerProfit,
            reason: LEDGER_REASON.OFFER_PAYOUT,
            bucket: 'balance',
            memo: `Winnings on match ${m.id}`,
          });
        }
        if (loserForfeit > 0) {
          legs.push({
            uid: loserUid,
            direction: LEDGER_DIRECTION.DEBIT,
            amount: loserForfeit,
            reason: LEDGER_REASON.OFFER_PAYOUT,
            bucket: 'forfeit',
            memo: `Escrow forfeited on match ${m.id}`,
          });
        }

        await postLedgerTxn(tx, {
          idempotencyKey: `offer:settle:${betId}:${m.id}`,
          txnGroupId: `offer:settle:${betId}:${m.id}`,
          betId,
          legs,
        });

        tx.set(
          matchRef,
          { status: 'settled', winner: result.winner, winnerUid, settledAt: ts },
          { merge: true },
        );
      });
    }
  },
);
