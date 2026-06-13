/**
 * updateLiveScores — every 2 minutes, refresh the score/status/clock of every
 * fixture currently in progress, and flip a fixture that just finished to
 * 'final' (with its winner) so oracleResolve can pick it up. Reads the provider
 * PORT; writes only fixtures/{id}. Moves NO money.
 *
 * We re-read the provider's live list AND re-check any fixture already marked
 * 'live' in Firestore for a final result, so a game that ended between live
 * refreshes still transitions to 'final' promptly.
 */
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db } from '../lib/admin';
import { paths } from '../lib/paths';
import { now } from '../lib/time';
import { REGION } from '../lib/guards';
import { getSportsProvider } from '../sports/provider';

export const updateLiveScores = onSchedule(
  { region: REGION, schedule: 'every 2 minutes', timeZone: 'Asia/Macau' },
  async () => {
    const provider = getSportsProvider();
    const ts = now();

    // 1) Refresh in-progress fixtures from the provider's live list.
    const live = await provider.listLive({ limit: 200 });
    const liveById = new Map(live.map((f) => [f.fixtureId, f]));

    let updated = 0;
    let finalized = 0;

    if (live.length > 0) {
      const batch = db.batch();
      for (const f of live) {
        batch.set(
          db.doc(paths.fixture(f.fixtureId)),
          {
            status: 'live',
            homeScore: f.homeScore ?? null,
            awayScore: f.awayScore ?? null,
            period: f.period ?? null,
            syncedAt: ts,
          },
          { merge: true },
        );
        updated++;
      }
      await batch.commit();
    }

    // 2) Any fixture Firestore still has as 'live' that is NOT in the provider's
    //    live list may have just finished — ask the provider for a final result.
    const stale = await db
      .collection(paths.fixtures())
      .where('status', '==', 'live')
      .limit(200)
      .get();

    for (const doc of stale.docs) {
      if (liveById.has(doc.id)) continue; // still live, already handled above
      const result = await provider.getResult(doc.id);
      if (!result) continue;
      await db.doc(paths.fixture(doc.id)).set(
        {
          status: 'final',
          homeScore: result.homeScore,
          awayScore: result.awayScore,
          winner: result.winner,
          period: 'Final',
          syncedAt: now(),
        },
        { merge: true },
      );
      finalized++;
    }

    console.log(`[updateLiveScores] refreshed ${updated} live, finalized ${finalized}`);
  },
);
