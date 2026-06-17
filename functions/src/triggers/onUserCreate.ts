/**
 * onUserCreate — bootstrap a users/{uid} doc with safe defaults the moment a
 * Firebase Auth account is created. NO chips are granted here; the signup grant
 * happens at verifyAge (age must be proven first). Generates a referral code and
 * reserves a starter handle.
 *
 * NOTE: Background Auth triggers are a Gen1 feature (Gen2 only offers *blocking*
 * identity functions). We use the v1 auth trigger, pinned to the pilot region,
 * which deploys happily alongside the Gen2 callables/triggers.
 */
import * as functionsV1 from 'firebase-functions/v1';
import { db } from '../lib/admin';
import { paths } from '../lib/paths';
import { now } from '../lib/time';
import { makeShareCode } from '../shared/ids';
import { PILOT_REGION, RG_DEFAULTS } from '../shared/constants';
import { REGION } from '../lib/guards';

/** Derive a unique, schema-valid handle from a display name / email seed. */
async function reserveHandle(uid: string, seed: string): Promise<string> {
  const base =
    seed
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '')
      .slice(0, 16) || 'player';
  for (let attempt = 0; attempt < 8; attempt++) {
    const suffix = attempt === 0 ? '' : String(Math.floor(1000 + Math.random() * 9000));
    const candidate = `${base}${suffix}`.slice(0, 20).padEnd(3, '0');
    const ref = db.doc(paths.handle(candidate));
    try {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (snap.exists) throw new Error('taken');
        tx.set(ref, { uid, handle: candidate, createdAt: now() });
      });
      return candidate;
    } catch {
      // collision — try the next candidate
    }
  }
  // Last resort: uid-derived handle (guaranteed unique).
  const fallback = `p${uid.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 18)}`.padEnd(3, '0');
  await db.doc(paths.handle(fallback)).set({ uid, handle: fallback, createdAt: now() });
  return fallback;
}

export const onUserCreate = functionsV1
  .region(REGION)
  .auth.user()
  .onCreate(async (user) => {
    const uid = user.uid;
    const userRef = db.doc(paths.user(uid));
    const existing = await userRef.get();
    if (existing.exists) return; // already bootstrapped

    const seed = user.displayName || user.email?.split('@')[0] || 'player';
    const handle = await reserveHandle(uid, seed);
    const ts = now();

    const providers = (user.providerData ?? []).map((p) => p.providerId);

    await userRef.set({
      uid,
      displayName: user.displayName || 'New Player',
      handle,
      photoURL: user.photoURL ?? null,
      phoneNumber: user.phoneNumber ?? null,
      email: user.email ?? null,
      authProviders: providers,
      createdAt: ts,
      // Compliance — not verified until verifyAge.
      ageVerified: false,
      dateOfBirth: null,
      kycLevel: 'none',
      region: PILOT_REGION,
      locale: 'en',
      // Money — zero; granted at verifyAge.
      chipsBalance: 0,
      chipsHeld: 0,
      ledgerVersion: 0,
      // Stats.
      lifetimeWagered: 0,
      lifetimeWon: 0,
      winCount: 0,
      lossCount: 0,
      currentStreak: 0,
      bestStreak: 0,
      xp: 0,
      level: 1,
      // Responsible gaming defaults.
      rgLimits: {
        dailyStakeLimit: RG_DEFAULTS.dailyStakeLimit,
        weeklyStakeLimit: RG_DEFAULTS.weeklyStakeLimit,
        dailyBetCountLimit: RG_DEFAULTS.dailyBetCountLimit,
        sessionReminderMins: RG_DEFAULTS.sessionReminderMins,
        selfExclusionUntil: RG_DEFAULTS.selfExclusionUntil,
      },
      rgState: { todayStaked: 0, weekStaked: 0, todayBetCount: 0, lastResetAt: 0 },
      // Daily economy.
      lastDailyGrantAt: null,
      lastZeroRefillAt: null,
      dailyStreak: 0,
      // Social / referral.
      referredBy: null,
      referralCode: makeShareCode(),
      // Admin / safety.
      isBanned: false,
      flags: { shadowBanned: false, frozen: false },
      // Settings defaults (mirror UserSettingsSchema defaults).
      settings: {
        pushEnabled: true,
        notifyOnJoin: true,
        notifyOnResolve: true,
        notifyOnComment: true,
        privacy: 'friends',
        reduceMotion: false,
        biometricGate: false,
      },
    });

    // Mint the house account on first user if it doesn't exist (audit anchor).
    await ensureHouseAccount();
  });

/** Ensure the HOUSE pseudo-account user doc exists for ledger audits. */
async function ensureHouseAccount(): Promise<void> {
  const { HOUSE_UID } = await import('../shared/constants');
  const ref = db.doc(paths.user(HOUSE_UID));
  const snap = await ref.get();
  if (snap.exists) return;
  await ref.set(
    {
      uid: HOUSE_UID,
      displayName: 'House',
      handle: 'house',
      chipsBalance: 0,
      chipsHeld: 0,
      ledgerVersion: 0,
      createdAt: now(),
      isSystem: true,
    },
    { merge: true },
  );
}
