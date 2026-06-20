/**
 * buildDiscovery — every 2 minutes, materialize the discovery feed: fan trending
 * open markets, hot open bets, and recent big wins (settled-bet payouts + casino
 * game wins) into `discovery/{itemId}` documents the client reads as a single
 * TikTok-style vertical feed.
 *
 * This is a denormalizer, NOT a money path: it only writes display docs. The
 * authoritative state stays on markets/bets/settlements; the client hydrates the
 * live underlying doc for markets/bets so prices/pots stay real-time, and reads
 * big-win cards straight from the (self-contained) discovery item.
 *
 * The `discovery` collection is rebuilt wholesale each run (small, capped set) so
 * stale items (resolved markets, closed bets, old wins) age out automatically.
 * Items carry a `heat` score (shared `heatScore`) for client sort/labelling.
 *
 * Path note: the client/functions `paths` module is owned by the Markets track;
 * to keep this file self-contained we reference the `discovery` collection by its
 * literal name (`discovery/{itemId}`), matching the documented schema.
 */
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db } from '../lib/admin';
import { paths } from '../lib/paths';
import { now } from '../lib/time';
import { newUlid } from '../shared/ids';
import { REGION } from '../lib/guards';
import { heatScore } from '../shared/engagement';

/** How many of each kind to surface. */
const LIMITS = { markets: 24, bets: 18, betWins: 10, gameWins: 8 } as const;
/** Only surface wins from the last day so the feed stays fresh. */
const WIN_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Minimum Chips for a payout/game win to count as "big". */
const BIG_WIN_MIN = 250;
/** Hard cap on materialized items (keeps reads cheap). */
const MAX_ITEMS = 60;

interface DiscoveryDoc {
  itemId: string;
  kind: 'market' | 'bet' | 'big_win' | 'game_win';
  refId: string;
  title: string;
  subtitle?: string;
  imageUrl?: string | null;
  priceYesCents?: number | null;
  poolTotal?: number | null;
  heat: number;
  actorName?: string;
  actorPhotoURL?: string | null;
  amount?: number | null;
  createdAt: number;
}

export const buildDiscovery = onSchedule(
  { region: REGION, schedule: 'every 2 minutes', timeZone: 'Asia/Macau', memory: '256MiB' },
  async () => {
    const ts = now();
    const items: DiscoveryDoc[] = [];

    // ── 1) Trending / open markets ──
    try {
      const marketSnap = await db
        .collection('markets')
        .where('status', '==', 'open')
        .orderBy('heat', 'desc')
        .limit(LIMITS.markets)
        .get();
      for (const doc of marketSnap.docs) {
        const m = doc.data();
        items.push({
          itemId: `mkt_${doc.id}`,
          kind: 'market',
          refId: doc.id,
          title: (m.question as string) ?? 'Market',
          subtitle: (m.creatorName as string) ?? undefined,
          imageUrl: (m.imageUrl as string | null) ?? null,
          priceYesCents: (m.priceYesCents as number) ?? 50,
          poolTotal: (m.volume as number) ?? 0,
          heat: (m.heat as number) ?? 0,
          createdAt: (m.createdAt as number) ?? ts,
        });
      }
    } catch (e) {
      console.error('[buildDiscovery] markets query failed', e);
    }

    // ── 2) Hot open bets (compute a heat score from recent activity) ──
    try {
      const betSnap = await db
        .collection(paths.bets())
        .where('status', '==', 'open')
        .orderBy('createdAt', 'desc')
        .limit(LIMITS.bets)
        .get();
      for (const doc of betSnap.docs) {
        const b = doc.data();
        const ageMins = Math.max(0, (ts - ((b.createdAt as number) ?? ts)) / 60000);
        const heat = heatScore({
          joinsLastHour: (b.entryCount as number) ?? 0,
          volumeLastHour: (b.poolTotal as number) ?? 0,
          ageMins,
        });
        items.push({
          itemId: `bet_${doc.id}`,
          kind: 'bet',
          refId: doc.id,
          title: (b.title as string) ?? 'Bet',
          subtitle: (b.creatorName as string) ?? undefined,
          imageUrl: (b.creatorPhotoURL as string | null) ?? null,
          poolTotal: (b.poolTotal as number) ?? 0,
          heat,
          actorName: (b.creatorName as string) ?? undefined,
          actorPhotoURL: (b.creatorPhotoURL as string | null) ?? null,
          createdAt: (b.createdAt as number) ?? ts,
        });
      }
    } catch (e) {
      console.error('[buildDiscovery] bets query failed', e);
    }

    // ── 3) Recent big-win settlements (top payout per settled bet) ──
    try {
      const cutoff = ts - WIN_WINDOW_MS;
      const settleSnap = await db
        .collectionGroup('settlement')
        .where('settledAt', '>=', cutoff)
        .orderBy('settledAt', 'desc')
        .limit(LIMITS.betWins * 3)
        .get();
      let added = 0;
      for (const doc of settleSnap.docs) {
        if (added >= LIMITS.betWins) break;
        const s = doc.data();
        const payouts = (s.payouts as { uid: string; amount: number; profit: number }[]) ?? [];
        if (payouts.length === 0) continue;
        const top = payouts.reduce((a, c) => (c.amount > a.amount ? c : a), payouts[0]);
        if ((top.amount ?? 0) < BIG_WIN_MIN) continue;
        const betId = (s.betId as string) ?? doc.ref.parent.parent?.id ?? '';
        let actorName: string | undefined;
        let actorPhotoURL: string | null = null;
        try {
          const winner = await db.doc(paths.user(top.uid)).get();
          const w = winner.data();
          actorName = (w?.displayName as string) ?? undefined;
          actorPhotoURL = (w?.photoURL as string | null) ?? null;
        } catch {
          // best-effort enrichment only
        }
        items.push({
          itemId: `win_${betId}`,
          kind: 'big_win',
          refId: betId,
          title: `Won big on a bet`,
          heat: Math.min(100, (top.amount ?? 0) / 50),
          actorName,
          actorPhotoURL,
          amount: top.amount ?? 0,
          createdAt: (s.settledAt as number) ?? ts,
        });
        added += 1;
      }
    } catch (e) {
      console.error('[buildDiscovery] settlement query failed', e);
    }

    // ── 4) Recent casino big wins (net win above threshold) ──
    try {
      const cutoff = ts - WIN_WINDOW_MS;
      const roundSnap = await db
        .collectionGroup('gameRounds')
        .where('createdAt', '>=', cutoff)
        .orderBy('createdAt', 'desc')
        .limit(LIMITS.gameWins * 4)
        .get();
      let added = 0;
      for (const doc of roundSnap.docs) {
        if (added >= LIMITS.gameWins) break;
        const r = doc.data();
        const net = (r.net as number) ?? 0;
        if (net < BIG_WIN_MIN) continue;
        const uid = (r.uid as string) ?? doc.ref.parent.parent?.id ?? '';
        let actorName: string | undefined;
        let actorPhotoURL: string | null = null;
        try {
          const winner = await db.doc(paths.user(uid)).get();
          const w = winner.data();
          actorName = (w?.displayName as string) ?? undefined;
          actorPhotoURL = (w?.photoURL as string | null) ?? null;
        } catch {
          // best-effort enrichment only
        }
        items.push({
          itemId: `game_${doc.id}`,
          kind: 'game_win',
          refId: (r.game as string) ?? 'casino',
          title: `Hit ${(r.multiplier as number) ?? 0}x on ${(r.game as string) ?? 'a game'}`,
          heat: Math.min(100, net / 40),
          actorName,
          actorPhotoURL,
          amount: (r.payout as number) ?? net,
          createdAt: (r.createdAt as number) ?? ts,
        });
        added += 1;
      }
    } catch (e) {
      console.error('[buildDiscovery] gameRounds query failed', e);
    }

    // ── 5) Rank (heat desc, then recency) and cap. ──
    items.sort((a, b) => (b.heat - a.heat) || (b.createdAt - a.createdAt));
    const top = items.slice(0, MAX_ITEMS);

    // ── 6) Wholesale rebuild: write fresh items, delete stale ones. ──
    const col = db.collection('discovery');
    const existing = await col.get();
    const keep = new Set(top.map((i) => i.itemId));

    // Firestore batches cap at 500 writes; our sets are far smaller.
    let batch = db.batch();
    let ops = 0;
    const flush = async () => {
      if (ops > 0) {
        await batch.commit();
        batch = db.batch();
        ops = 0;
      }
    };

    for (const stale of existing.docs) {
      if (!keep.has(stale.id)) {
        batch.delete(stale.ref);
        ops += 1;
        if (ops >= 400) await flush();
      }
    }
    for (const it of top) {
      // Give every item a fresh ULID-stamped revision id field for audit, but
      // keep the deterministic doc id so updates merge in place.
      batch.set(col.doc(it.itemId), { ...it, rev: newUlid(), builtAt: ts }, { merge: true });
      ops += 1;
      if (ops >= 400) await flush();
    }
    await flush();

    console.log(`[buildDiscovery] materialized ${top.length} discovery items`);
  },
);
