/**
 * generateWrapped — compute a "Chipd Wrapped" recap doc for the caller from
 * their settled entries + ledger + stats, written to users/{uid}/wrapped/{periodId}.
 * Read-only over money (no grants); it just summarizes. Re-running regenerates
 * the same period doc (idempotent overwrite). The period is the active season by
 * default, or 'all-time' when there is no active season.
 */
import { onCall } from 'firebase-functions/v2/https';
import { db } from '../lib/admin';
import { paths } from '../lib/paths';
import { now } from '../lib/time';
import { settlementOpts, requireAuth, assertUserAllowed, toHttpsError } from '../lib/guards';

export const generateWrapped = onCall(settlementOpts, async (req) => {
  try {
    const uid = requireAuth(req);
    const data = (req.data ?? {}) as { periodId?: string };

    const userSnap = await db.doc(paths.user(uid)).get();
    assertUserAllowed(userSnap.data(), { requireAge: false });
    const user = userSnap.data()!;

    // Resolve the period: explicit > active season > all-time.
    let periodId = typeof data.periodId === 'string' ? data.periodId : '';
    let periodLabel = 'All Time';
    let windowStart = 0;
    if (!periodId) {
      const seasonSnap = await db
        .collection(paths.seasons())
        .where('active', '==', true)
        .limit(1)
        .get();
      if (!seasonSnap.empty) {
        const season = seasonSnap.docs[0].data();
        periodId = seasonSnap.docs[0].id;
        periodLabel = (season.name as string) ?? 'This Season';
        windowStart = (season.startsAt as number) ?? 0;
      } else {
        periodId = 'all-time';
      }
    }

    // Pull the caller's settled entries via a collection-group query.
    const entriesSnap = await db
      .collectionGroup('entries')
      .where('uid', '==', uid)
      .get();

    const categoryCount: Record<string, number> = {};
    let betsPlaced = 0;
    let betsWon = 0;
    let chipsWagered = 0;
    let biggestWin = 0;
    let netChips = 0;

    // Resolve the bet docs we touched (for category attribution) in one pass.
    const betIds = new Set<string>();
    for (const e of entriesSnap.docs) {
      const data = e.data();
      if (windowStart && (data.joinedAt as number) < windowStart) continue;
      betIds.add(data.betId as string);
    }
    const betCategory = new Map<string, string>();
    await Promise.all(
      [...betIds].map(async (betId) => {
        const b = await db.doc(paths.bet(betId)).get();
        betCategory.set(betId, (b.data()?.category as string) ?? 'custom');
      }),
    );

    for (const e of entriesSnap.docs) {
      const entry = e.data();
      if (windowStart && (entry.joinedAt as number) < windowStart) continue;
      betsPlaced += 1;
      const stake = (entry.stake as number) ?? 0;
      chipsWagered += stake;
      const cat = betCategory.get(entry.betId as string) ?? 'custom';
      categoryCount[cat] = (categoryCount[cat] ?? 0) + 1;
      if (entry.status === 'won') {
        betsWon += 1;
        const payout = (entry.payoutAmount as number) ?? 0;
        const profit = payout - stake;
        netChips += profit;
        if (profit > biggestWin) biggestWin = profit;
      } else if (entry.status === 'lost') {
        netChips -= stake;
      }
    }

    const favoriteCategory =
      Object.entries(categoryCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'custom';
    const winRate = betsPlaced > 0 ? betsWon / betsPlaced : 0;

    const wrapped = {
      uid,
      periodLabel,
      betsPlaced,
      betsWon,
      winRate: Math.round(winRate * 100) / 100,
      chipsWagered,
      netChips,
      biggestWin: Math.max(0, biggestWin),
      longestStreak: (user.bestStreak as number) ?? 0,
      favoriteCategory,
      topRival: null as string | null,
      generatedAt: now(),
    };

    await db.doc(paths.wrappedDoc(uid, periodId)).set(wrapped, { merge: true });
    return { ok: true, periodId, wrapped };
  } catch (e) {
    throw toHttpsError(e, 'Failed to generate your Wrapped.');
  }
});
