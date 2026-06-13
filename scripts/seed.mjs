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

  console.log(`✓ Seeded ${DEMO.length} users and ${BETS.length} bets.`);
  console.log('  Demo login (Auth emulator): alextan@example.com / chipd123');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
