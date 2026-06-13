/**
 * Season lifecycle.
 *
 *  - rollSeason (scheduled, hourly): ensure exactly one active season exists. If
 *    none exists, open Season 1. If the active season's endsAt has passed:
 *      1) snapshot final standings into seasons/{id}/standings/{uid} (ranked by
 *         netChips, then winCount), grant SEASON_REWARD to placers +
 *         participation to everyone who played,
 *      2) flip the season to inactive,
 *      3) open the next season.
 *    Idempotent: rewards use a per-season ledger key; the flip re-checks active.
 *
 *  - refreshSeasonStandings (scheduled, every 15m): keep the live standings of the
 *    active season fresh so the hub/standings screens show current ranks. Writes
 *    standing docs only (NO money). This is the "record standings on settle"
 *    surface — cheap, periodic, derived from the denormalized user stats.
 */
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db } from '../lib/admin';
import { paths } from '../lib/paths';
import { now } from '../lib/time';
import { REGION } from '../lib/guards';
import { grantChips } from '../lib/ledger';
import { SEASON, seasonRankReward } from '../shared/gamification';
import { HOUSE_UID, LEDGER_REASON } from '../shared/constants';

const DAY_MS = 24 * 60 * 60 * 1000;

interface StandingRow {
  uid: string;
  displayName: string;
  photoURL: string | null;
  netChips: number;
  winCount: number;
  xpEarned: number;
}

/** Rank active players by netChips (then winCount, then uid for stability). */
async function computeStandings(sinceXp: Record<string, number> = {}): Promise<StandingRow[]> {
  const usersSnap = await db
    .collection(paths.users())
    .orderBy('lifetimeWon', 'desc')
    .limit(500)
    .get();

  const rows: StandingRow[] = [];
  for (const doc of usersSnap.docs) {
    if (doc.id === HOUSE_UID) continue;
    const u = doc.data();
    if (u.isSystem === true) continue;
    const wagered = (u.lifetimeWagered as number) ?? 0;
    const won = (u.lifetimeWon as number) ?? 0;
    // Only include players who have actually played this period.
    if (wagered === 0 && won === 0) continue;
    rows.push({
      uid: doc.id,
      displayName: (u.displayName as string) ?? 'Player',
      photoURL: (u.photoURL as string | null) ?? null,
      netChips: won - wagered,
      winCount: (u.winCount as number) ?? 0,
      xpEarned: sinceXp[doc.id] ?? ((u.xp as number) ?? 0),
    });
  }
  rows.sort(
    (a, b) => b.netChips - a.netChips || b.winCount - a.winCount || a.uid.localeCompare(b.uid),
  );
  return rows;
}

async function openSeason(number: number, ts: number): Promise<string> {
  const seasonId = `S${number}`;
  await db.doc(paths.season(seasonId)).set(
    {
      seasonId,
      name: `Season ${number}`,
      number,
      startsAt: ts,
      endsAt: ts + SEASON.LENGTH_DAYS * DAY_MS,
      active: true,
    },
    { merge: true },
  );
  return seasonId;
}

export const rollSeason = onSchedule(
  { region: REGION, schedule: 'every 60 minutes', timeZone: 'Asia/Macau' },
  async () => {
    const ts = now();
    const activeSnap = await db
      .collection(paths.seasons())
      .where('active', '==', true)
      .limit(1)
      .get();

    // No active season → open Season 1 (or the next number after the latest).
    if (activeSnap.empty) {
      const latest = await db
        .collection(paths.seasons())
        .orderBy('number', 'desc')
        .limit(1)
        .get();
      const nextNumber = latest.empty ? 1 : ((latest.docs[0].data().number as number) ?? 0) + 1;
      await openSeason(nextNumber, ts);
      return;
    }

    const seasonDoc = activeSnap.docs[0];
    const season = seasonDoc.data();
    const seasonId = seasonDoc.id;
    if ((season.endsAt as number) > ts) {
      // Still running — just keep standings warm.
      await writeStandings(seasonId, await computeStandings());
      return;
    }

    // ── Season has ended: snapshot, reward, close, open next. ──
    const standings = await computeStandings();
    await writeStandings(seasonId, standings);

    // Grant placement + participation rewards (idempotent per season + uid).
    for (let i = 0; i < standings.length; i++) {
      const row = standings[i];
      const rank = i + 1;
      const reward = seasonRankReward(rank);
      if (reward <= 0) continue;
      try {
        await db.runTransaction(async (tx) => {
          await grantChips(tx, {
            uid: row.uid,
            amount: reward,
            reason: LEDGER_REASON.SEASON_REWARD,
            idempotencyKey: `season:${seasonId}:${row.uid}`,
            memo: `${season.name ?? seasonId} — rank #${rank}`,
          });
        });
      } catch (e) {
        console.error(`[rollSeason] reward failed ${seasonId}/${row.uid}`, e);
      }
    }

    // Close this season and open the next.
    await db.doc(paths.season(seasonId)).set({ active: false, closedAt: ts }, { merge: true });
    await openSeason(((season.number as number) ?? 0) + 1, ts);
  },
);

/** Write/refresh the ranked standing docs for a season. NO money. */
async function writeStandings(seasonId: string, standings: StandingRow[]): Promise<void> {
  const batch = db.batch();
  standings.forEach((row, i) => {
    batch.set(
      db.doc(paths.seasonStanding(seasonId, row.uid)),
      {
        uid: row.uid,
        displayName: row.displayName,
        photoURL: row.photoURL,
        netChips: row.netChips,
        winCount: row.winCount,
        xpEarned: row.xpEarned,
        rank: i + 1,
      },
      { merge: true },
    );
  });
  if (standings.length > 0) await batch.commit();
}

export const refreshSeasonStandings = onSchedule(
  { region: REGION, schedule: 'every 15 minutes', timeZone: 'Asia/Macau' },
  async () => {
    const activeSnap = await db
      .collection(paths.seasons())
      .where('active', '==', true)
      .limit(1)
      .get();
    if (activeSnap.empty) return;
    await writeStandings(activeSnap.docs[0].id, await computeStandings());
  },
);
