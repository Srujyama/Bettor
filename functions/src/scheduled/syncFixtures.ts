/**
 * syncFixtures — every 15 minutes, pull the upcoming + live fixtures from the
 * sports provider PORT and upsert them into fixtures/{id}. This is the ONLY
 * writer of the scheduled/upcoming portion of a fixture (clients read fixtures,
 * never write them). Moves NO money.
 *
 * The provider is the mock in the pilot (deterministic, no key); swapping in a
 * real vendor is a one-line change in getSportsProvider(). We merge so a live
 * score written by updateLiveScores between syncs is not clobbered for a fixture
 * that is already in progress.
 */
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db } from '../lib/admin';
import { paths } from '../lib/paths';
import { now } from '../lib/time';
import { REGION } from '../lib/guards';
import { getSportsProvider } from '../sports/provider';
import type { Fixture } from '../shared/schemas-ext';

export const syncFixtures = onSchedule(
  { region: REGION, schedule: 'every 15 minutes', timeZone: 'Asia/Macau' },
  async () => {
    const provider = getSportsProvider();
    const ts = now();

    const [upcoming, live] = await Promise.all([
      provider.listUpcoming({ limit: 100 }),
      provider.listLive({ limit: 100 }),
    ]);

    // De-dupe by id (a fixture should appear in only one list, but be safe).
    const byId = new Map<string, Fixture>();
    for (const f of upcoming) byId.set(f.fixtureId, f);
    for (const f of live) byId.set(f.fixtureId, f);

    let written = 0;
    // Firestore batches cap at 500 writes; chunk defensively.
    const fixtures = Array.from(byId.values());
    for (let i = 0; i < fixtures.length; i += 400) {
      const batch = db.batch();
      for (const f of fixtures.slice(i, i + 400)) {
        batch.set(
          db.doc(paths.fixture(f.fixtureId)),
          { ...f, syncedAt: ts },
          { merge: true },
        );
        written++;
      }
      await batch.commit();
    }

    console.log(`[syncFixtures] upserted ${written} fixtures (${upcoming.length} upcoming, ${live.length} live)`);
  },
);
