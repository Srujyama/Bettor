/**
 * autoVoidSweep — every 5 minutes, find bets that blew past their resolveBy
 * deadline without being settled and VOID them, refunding every participant
 * their exact stake. Voiding routes through the atomic settlement engine in
 * refund mode (refundAll), so escrow is released and conservation is proven.
 *
 * Eligible statuses: open / locked (genuinely unresolved). pending_resolution
 * bets belong to the dispute-window settlement sweep, and disputed bets belong
 * to trust & safety — neither is auto-voided here. Terminal bets are skipped.
 */
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db } from '../lib/admin';
import { paths } from '../lib/paths';
import { now } from '../lib/time';
import { REGION } from '../lib/guards';
import { runSettlement } from '../settlement/settle';
import { BET_STATUS, TIMING } from '../shared/constants';

const VOIDABLE = [BET_STATUS.OPEN, BET_STATUS.LOCKED];

export const autoVoidSweep = onSchedule(
  { region: REGION, schedule: 'every 5 minutes', timeZone: 'Asia/Macau' },
  async () => {
    const cutoff = now() - TIMING.AUTO_VOID_GRACE_MS;
    const due = await db
      .collection(paths.bets())
      .where('status', 'in', VOIDABLE)
      .where('resolveBy', '<=', cutoff)
      .limit(100)
      .get();

    for (const doc of due.docs) {
      try {
        await runSettlement(doc.id, {
          settledBy: 'system',
          refund: true,
          terminalStatus: BET_STATUS.VOIDED,
        });
      } catch (e) {
        console.error(`[autoVoidSweep] failed to void ${doc.id}`, e);
      }
    }
  },
);
