/**
 * settleParlaysSweep — every minute, walk the live parlay slips and attempt to
 * resolve/settle each via settleParlaySlip (which is idempotent + atomic). This
 * picks up legs that resolved through normal bet settlement or fixture finals
 * without needing a fan-in trigger per source. Cheap: each slip is its own small
 * transaction and a no-op until all its legs resolve (or one busts).
 */
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db } from '../lib/admin';
import { formatPaths } from '../lib/formatPaths';
import { REGION } from '../lib/guards';
import { settleParlaySlip } from '../settlement/settleParlay';

export const settleParlaysSweep = onSchedule(
  { region: REGION, schedule: 'every 1 minutes', timeZone: 'Asia/Macau' },
  async () => {
    const live = await db
      .collection(formatPaths.parlays())
      .where('status', '==', 'live')
      .limit(200)
      .get();

    for (const doc of live.docs) {
      await settleParlaySlip(doc.id).catch((e) => {
        console.error(`[settleParlaysSweep] failed for ${doc.id}`, e);
      });
    }
  },
);
