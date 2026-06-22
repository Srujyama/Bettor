/**
 * Seed the local Firebase Emulator Suite with demo users + bets so the app has
 * something to show on first run. Run AFTER `npm run emulators` is up:
 *
 *   EXPO_PUBLIC_FIREBASE_PROJECT_ID=chipd-dev node ./scripts/seed.mjs
 *
 * Uses the Admin SDK pointed at the emulator (no credentials needed). Safe to
 * re-run — it upserts.
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

process.env.FIRESTORE_EMULATOR_HOST ??= 'localhost:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= 'localhost:9099';
const projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? 'chipd-dev';

initializeApp({ projectId });
const db = getFirestore();
const auth = getAuth();

const now = Date.now();
const HOUR = 3600_000;

// ── Inline geo helpers (mirror src/shared/geo.ts so seeded local bets are
//    queryable by the same geohash logic the app uses) ──
const EARTH_R = 6_371_000;
const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';
function fuzzGrid(lat, lng, gridMeters = 600) {
  const latStep = (gridMeters / EARTH_R) * (180 / Math.PI);
  const lngStep = latStep / Math.max(0.01, Math.cos((lat * Math.PI) / 180));
  return {
    lat: +(Math.round(lat / latStep) * latStep).toFixed(5),
    lng: +(Math.round(lng / lngStep) * lngStep).toFixed(5),
  };
}
function geohash9(lat, lng, precision = 9) {
  let latMin = -90, latMax = 90, lngMin = -180, lngMax = 180, hash = '', bit = 0, ch = 0, even = true;
  while (hash.length < precision) {
    if (even) {
      const mid = (lngMin + lngMax) / 2;
      if (lng >= mid) { ch |= 1 << (4 - bit); lngMin = mid; } else lngMax = mid;
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat >= mid) { ch |= 1 << (4 - bit); latMin = mid; } else latMax = mid;
    }
    even = !even;
    if (bit < 4) bit++; else { hash += BASE32[ch]; bit = 0; ch = 0; }
  }
  return hash;
}

const DEMO = [
  { uid: 'demo_alex', name: 'Alex Tan', handle: 'alextan', balance: 1850, won: 4, lost: 2 },
  { uid: 'demo_mia', name: 'Mia Costa', handle: 'miacosta', balance: 980, won: 2, lost: 3 },
  { uid: 'demo_dave', name: 'Dave Kim', handle: 'davekim', balance: 2400, won: 6, lost: 1 },
  { uid: 'demo_sara', name: 'Sara Lopes', handle: 'saralopes', balance: 1200, won: 3, lost: 3 },
];

function userDoc(d) {
  return {
    uid: d.uid,
    displayName: d.name,
    handle: d.handle,
    photoURL: null,
    email: `${d.handle}@example.com`,
    authProviders: ['password'],
    createdAt: now - 30 * 24 * HOUR,
    ageVerified: true,
    dateOfBirth: now - 28 * 365 * 24 * HOUR,
    kycLevel: 'self_attested',
    region: 'MO',
    locale: 'en',
    chipsBalance: d.balance,
    chipsHeld: 0,
    ledgerVersion: 1,
    lifetimeWagered: (d.won + d.lost) * 200,
    lifetimeWon: d.won * 350,
    winCount: d.won,
    lossCount: d.lost,
    currentStreak: 2,
    bestStreak: 4,
    xp: d.won * 100,
    level: 1 + Math.floor(d.won / 3),
    rgLimits: {
      dailyStakeLimit: null,
      weeklyStakeLimit: null,
      dailyBetCountLimit: null,
      sessionReminderMins: 45,
      selfExclusionUntil: null,
    },
    rgState: { todayStaked: 0, weekStaked: 0, todayBetCount: 0, lastResetAt: now },
    dailyStreak: 1,
    referralCode: d.handle.toUpperCase().slice(0, 6),
    isBanned: false,
    flags: { shadowBanned: false, frozen: false },
    settings: {
      pushEnabled: true,
      notifyOnJoin: true,
      notifyOnResolve: true,
      notifyOnComment: true,
      privacy: 'friends',
      reduceMotion: false,
      biometricGate: false,
    },
  };
}

const BETS = [
  {
    betId: 'bet_rain',
    creator: DEMO[0],
    title: 'Will it rain in Taipa this Saturday?',
    category: 'weather',
    type: 'binary',
    outcomes: [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }],
    pool: { yes: 600, no: 400 },
  },
  {
    betId: 'bet_10k',
    creator: DEMO[2],
    title: 'Dave vs Alex — who finishes the 10k first?',
    category: 'sports',
    type: 'head_to_head',
    outcomes: [{ id: 'dave', label: 'Dave' }, { id: 'alex', label: 'Alex' }],
    pool: { dave: 500, alex: 500 },
    marketModel: 'WINNER_TAKE_ALL',
  },
  {
    betId: 'bet_late',
    creator: DEMO[1],
    title: 'Will Sara be late to dinner again?',
    category: 'social',
    type: 'binary',
    outcomes: [{ id: 'yes', label: 'Definitely' }, { id: 'no', label: 'On time' }],
    pool: { yes: 750, no: 150 },
  },
];

async function main() {
  console.log(`Seeding emulator project "${projectId}"…`);

  for (const d of DEMO) {
    try {
      await auth.createUser({ uid: d.uid, email: `${d.handle}@example.com`, password: 'chipd123', displayName: d.name });
    } catch (e) {
      if (!String(e).includes('already-exists') && !String(e).includes('email-already')) {
        // ignore
      }
    }
    await db.doc(`users/${d.uid}`).set(userDoc(d), { merge: true });
    await db.doc(`handles/${d.handle}`).set({ uid: d.uid, createdAt: now });
    await db.doc(`ledgers/${d.uid}/entries/seed1`).set({
      entryId: 'seed1', uid: d.uid, seq: 1, direction: 'credit', reason: 'signup_grant',
      amount: 1000, balanceAfter: d.balance, heldAfter: 0, currency: 'CHIP',
      txnGroupId: 'seed', idempotencyKey: `seed_${d.uid}`, createdAt: now - 30 * 24 * HOUR,
    });
  }

  for (const b of BETS) {
    const poolTotal = Object.values(b.pool).reduce((s, v) => s + v, 0);
    await db.doc(`bets/${b.betId}`).set({
      betId: b.betId,
      creatorUid: b.creator.uid,
      creatorName: b.creator.name,
      creatorPhotoURL: null,
      title: b.title,
      description: '',
      category: b.category,
      type: b.type,
      outcomes: b.outcomes,
      marketModel: b.marketModel ?? 'PARI_MUTUEL',
      stakeMode: 'open',
      minStake: 10,
      maxStake: 5000,
      currency: 'CHIP',
      rakeBps: 0,
      visibility: 'public',
      groupId: null,
      status: 'open',
      resolutionMode: 'creator',
      resolverUid: b.creator.uid,
      lockAt: now + 24 * HOUR,
      resolveBy: now + 48 * HOUR,
      winningOutcomeId: null,
      poolTotal,
      poolByOutcome: b.pool,
      entryCount: Object.keys(b.pool).length,
      createdAt: now - 2 * HOUR,
      shareCode: b.betId.slice(-6).toUpperCase(),
      tags: [],
    }, { merge: true });

    // a couple of entries per bet
    const backers = DEMO.slice(0, 2);
    let i = 0;
    for (const u of backers) {
      const outcomeId = b.outcomes[i % b.outcomes.length].id;
      await db.doc(`bets/${b.betId}/entries/${u.uid}`).set({
        uid: u.uid, betId: b.betId, outcomeId, stake: 200, status: 'placed',
        ledgerEntryIdEscrow: 'seed', joinedAt: now - HOUR, displayName: u.name, photoURL: null,
      }, { merge: true });
      i++;
    }
  }

  // ── Expansion content: an active season, sports fixtures, missions ──
  const seasonId = 'season_1';
  await db.doc(`seasons/${seasonId}`).set({
    seasonId, name: 'Season 1 — Pearl of the Orient', number: 1,
    startsAt: now - 10 * 24 * HOUR, endsAt: now + 20 * 24 * HOUR, active: true,
  }, { merge: true });
  let rank = 1;
  for (const d of [...DEMO].sort((a, b) => b.won - a.won)) {
    await db.doc(`seasons/${seasonId}/standings/${d.uid}`).set({
      uid: d.uid, displayName: d.name, photoURL: null,
      netChips: d.won * 350 - (d.won + d.lost) * 200, winCount: d.won,
      xpEarned: d.won * 140, rank: rank++,
    }, { merge: true });
  }

  const FIXTURES = [
    { id: 'fx_lakers', sport: 'Basketball', league: 'NBA', home: 'Lakers', away: 'Celtics', inH: 3 },
    { id: 'fx_city', sport: 'Football', league: 'EPL', home: 'Man City', away: 'Arsenal', inH: 6 },
    { id: 'fx_ufc', sport: 'MMA', league: 'UFC', home: 'Adesanya', away: 'Pereira', inH: 26 },
    { id: 'fx_live', sport: 'Basketball', league: 'NBA', home: 'Heat', away: 'Knicks', inH: -1, live: true },
  ];
  for (const f of FIXTURES) {
    await db.doc(`fixtures/${f.id}`).set({
      fixtureId: f.id, league: f.league, sport: f.sport,
      homeTeam: f.home, awayTeam: f.away, homeLogo: null, awayLogo: null,
      startsAt: now + f.inH * HOUR,
      status: f.live ? 'live' : 'scheduled',
      homeScore: f.live ? 58 : null, awayScore: f.live ? 61 : null,
      period: f.live ? 'Q3 4:12' : null, winner: null,
    }, { merge: true });
  }

  // ── Prediction markets (Kalshi-style) + discovery feed ──
  const MARKETS = [
    { id: 'mkt_rain', q: 'Will it rain in Macau this weekend?', cat: 'weather', yes: 62 },
    { id: 'mkt_lakers', q: 'Will the Lakers make the playoffs?', cat: 'sports', yes: 44 },
    { id: 'mkt_btc', q: 'Will Bitcoin top $150k this year?', cat: 'custom', yes: 31 },
    { id: 'mkt_late', q: 'Will Sara be late to dinner Friday?', cat: 'social', yes: 78 },
  ];
  for (const m of MARKETS) {
    const b = 2886; // liquidityForSeed(2000)
    // qYes/qNo chosen so priceYesCents ≈ m.yes (b*ln(p/(1-p)) imbalance)
    const imbalance = Math.round(b * Math.log(m.yes / (100 - m.yes)));
    await db.doc(`markets/${m.id}`).set({
      marketId: m.id, creatorUid: DEMO[0].uid, creatorName: DEMO[0].name,
      question: m.q, description: '', category: m.cat, imageUrl: null,
      qYes: Math.max(0, imbalance), qNo: Math.max(0, -imbalance), b,
      priceYesCents: m.yes, volume: 1500 + Math.floor(Math.random() * 8000),
      traderCount: 3 + Math.floor(Math.random() * 20),
      status: 'open', resolution: null,
      closesAt: now + 5 * 24 * HOUR, resolvesBy: now + 6 * 24 * HOUR,
      createdAt: now - 3 * HOUR, oracleRef: null, heat: Math.random() * 100,
    }, { merge: true });
    await db.doc(`discovery/disc_${m.id}`).set({
      itemId: `disc_${m.id}`, kind: 'market', refId: m.id, title: m.q,
      subtitle: `${m.yes}¢ YES`, imageUrl: null, priceYesCents: m.yes, poolTotal: null,
      heat: Math.random() * 100, createdAt: now - 2 * HOUR,
    }, { merge: true });
  }
  // a couple of big-win discovery items
  await db.doc('discovery/disc_bigwin1').set({
    itemId: 'disc_bigwin1', kind: 'big_win', refId: 'bet_10k', title: 'Dave just won big!',
    subtitle: 'Won 4,200 Chips on a head-to-head', actorName: 'Dave Kim', actorPhotoURL: null,
    amount: 4200, heat: 90, createdAt: now - 30 * 60 * 1000,
  }, { merge: true });

  // ── Local ("in your area") bets around Macau, with geohashes ──
  const LOCAL_BETS = [
    { id: 'loc_market', title: 'Will the Taipa night market be packed tonight?', lat: 22.1554, lng: 113.5616, place: 'Taipa, Macau' },
    { id: 'loc_rain', title: 'Will it rain on the Senado Square crowd this evening?', lat: 22.1936, lng: 113.5390, place: 'Macau Peninsula' },
    { id: 'loc_queue', title: 'Will the wait at the pork chop bun place be over 20 min?', lat: 22.1487, lng: 113.5610, place: 'Coloane' },
    { id: 'loc_ferry', title: 'Will the 7pm HK ferry leave on time?', lat: 22.2070, lng: 113.5290, place: 'Outer Harbour' },
  ];
  for (const lb of LOCAL_BETS) {
    const fuzzed = fuzzGrid(lb.lat, lb.lng);
    await db.doc(`bets/${lb.id}`).set({
      betId: lb.id, creatorUid: DEMO[1].uid, creatorName: DEMO[1].name, creatorPhotoURL: null,
      title: lb.title, description: '', category: 'social', type: 'binary',
      outcomes: [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }],
      marketModel: 'PARI_MUTUEL', stakeMode: 'open', minStake: 10, maxStake: 2000,
      currency: 'CHIP', rakeBps: 0, visibility: 'local', groupId: null, status: 'open',
      resolutionMode: 'creator', resolverUid: DEMO[1].uid,
      lockAt: now + 12 * HOUR, resolveBy: now + 24 * HOUR, winningOutcomeId: null,
      poolTotal: 200 + Math.floor(Math.random() * 1500), poolByOutcome: { yes: 150, no: 100 },
      entryCount: 2 + Math.floor(Math.random() * 8), createdAt: now - 1 * HOUR,
      shareCode: lb.id.slice(-6).toUpperCase(), tags: [],
      isLocal: true, lat: fuzzed.lat, lng: fuzzed.lng, geohash: geohash9(fuzzed.lat, fuzzed.lng),
      placeName: lb.place, radiusMeters: 5000,
    }, { merge: true });
  }

  console.log(`✓ Seeded ${DEMO.length} users, ${BETS.length} bets, 1 season, ${FIXTURES.length} fixtures, ${MARKETS.length} markets, ${LOCAL_BETS.length} local bets.`);
  console.log('  Demo login (Auth emulator): alextan@example.com / chipd123');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
