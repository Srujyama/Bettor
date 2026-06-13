/**
 * Mission rotation sweeps. These proactively seed the current period's missions
 * for recently-active users so the daily/weekly cards are populated even before
 * the client calls ensureMissions. Seeding is idempotent per period (same doc id
 * → merge no-op). NO money moves; claiming a completed mission is a separate
 * callable.
 *
 *  - rotateDailyMissions: runs just after Macau midnight.
 *  - rotateWeeklyMissions: runs just after Macau Monday midnight.
 *
 * "Active" = has logged in or played within the look-back window. We cap the
 * batch so a single invocation stays bounded; the lazy ensureMissions callable
 * covers anyone the sweep misses.
 */
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db } from '../lib/admin';
import { paths } from '../lib/paths';
import { now } from '../lib/time';
import { REGION } from '../lib/guards';
import { missionsForPeriod, seedMissionDoc } from '../lib/gamify';
import type { MissionPeriod } from '../shared/gamification';
import { HOUSE_UID } from '../shared/constants';

const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVE_WINDOW_DAYS = 14;
const MAX_USERS = 1000;

async function seedActiveUsers(period: MissionPeriod, ts: number): Promise<number> {
  const since = ts - ACTIVE_WINDOW_DAYS * DAY_MS;
  const usersSnap = await db
    .collection(paths.users())
    .where('lastDailyGrantAt', '>=', since)
    .limit(MAX_USERS)
    .get();

  const defs = missionsForPeriod(period);
  let seededDocs = 0;
  // Chunk into batched writes (<=500 ops each).
  let batch = db.batch();
  let ops = 0;
  for (const userDoc of usersSnap.docs) {
    if (userDoc.id === HOUSE_UID) continue;
    for (const def of defs) {
      const seed = seedMissionDoc(def, ts);
      batch.set(db.doc(paths.mission(userDoc.id, seed.missionId)), seed, { merge: true });
      seededDocs += 1;
      ops += 1;
      if (ops >= 450) {
        await batch.commit();
        batch = db.batch();
        ops = 0;
      }
    }
  }
  if (ops > 0) await batch.commit();
  return seededDocs;
}

export const rotateDailyMissions = onSchedule(
  { region: REGION, schedule: '5 0 * * *', timeZone: 'Asia/Macau' },
  async () => {
    const seeded = await seedActiveUsers('daily', now());
    console.log(`[rotateDailyMissions] seeded ${seeded} mission docs`);
  },
);

export const rotateWeeklyMissions = onSchedule(
  { region: REGION, schedule: '10 0 * * 1', timeZone: 'Asia/Macau' },
  async () => {
    const seeded = await seedActiveUsers('weekly', now());
    console.log(`[rotateWeeklyMissions] seeded ${seeded} mission docs`);
  },
);
