/**
 * Market lifecycle sweeps.
 *
 *  - closeMarketsSweep: every 5 minutes, flip open markets whose closesAt has
 *    passed to status=closed (no more trading; awaiting oracle resolution).
 *  - autoVoidMarketsSweep: every 15 minutes, void markets that blew past their
 *    resolvesBy deadline without an oracle resolution and refund every trader's
 *    cost basis via MARKET_REFUND (routes through runMarketSettlement in 'void'
 *    mode, so the house releases the float it was holding and Chips are conserved).
 */
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db } from '../lib/admin';
import { paths } from '../lib/paths';
import { now } from '../lib/time';
import { REGION } from '../lib/guards';
import { runMarketSettlement } from '../callables/resolveMarket';

export const closeMarketsSweep = onSchedule(
  { region: REGION, schedule: 'every 5 minutes', timeZone: 'Asia/Macau' },
  async () => {
    const ts = now();
    const due = await db
      .collection(paths.markets())
      .where('status', '==', 'open')
      .where('closesAt', '<=', ts)
      .limit(200)
      .get();

    for (const doc of due.docs) {
      try {
        await db.doc(paths.market(doc.id)).set({ status: 'closed', closedAt: ts }, { merge: true });
      } catch (e) {
        console.error(`[closeMarketsSweep] failed to close ${doc.id}`, e);
      }
    }
  },
);

export const autoVoidMarketsSweep = onSchedule(
  { region: REGION, schedule: 'every 15 minutes', timeZone: 'Asia/Macau' },
  async () => {
    const ts = now();
    // Unresolved markets (open or closed) past their resolvesBy deadline.
    const due = await db
      .collection(paths.markets())
      .where('status', 'in', ['open', 'closed'])
      .where('resolvesBy', '<=', ts)
      .limit(50)
      .get();

    for (const doc of due.docs) {
      try {
        // Flip to voided first (idempotent), then refund every position's basis.
        await db.doc(paths.market(doc.id)).set(
          { status: 'voided', resolution: null, resolvedAt: ts },
          { merge: true },
        );
        await runMarketSettlement(doc.id, null, 'void');
      } catch (e) {
        console.error(`[autoVoidMarketsSweep] failed to void ${doc.id}`, e);
      }
    }
  },
);
