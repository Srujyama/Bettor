/**
 * RULES INTEGRITY SUITE — proves firestore.rules cannot be cheated.
 *
 * Runs against the Firestore emulator via @firebase/rules-unit-testing. The
 * money core is server-authoritative: the client may NEVER write balances,
 * pools, status, ledgers, settlement results, or stats. These tests assert that
 * contract directly against the SHIPPED firestore.rules.
 *
 * ─── App Check shim (important, documented) ───────────────────────────────────
 * The shipped rules gate EVERY access on `request.app != null` (App Check):
 *
 *     function appChecked() { return request.app != null; }   // firestore.rules
 *     function ok()        { return signedIn() && appChecked(); }
 *
 * @firebase/rules-unit-testing has no supported way to attach an App Check token
 * to the emulator transport (verified empirically: an authenticated context
 * still evaluates `request.app` as undefined, so every ok()-gated path throws an
 * evaluation error instead of exercising the real authorization logic). Unlike
 * the callables (which relax via `enforceAppCheck: !IS_EMULATOR`), the rule does
 * NOT relax in the emulator — see the gap reported in the suite's followups.
 *
 * To exercise the REAL authorization logic (ownership, field whitelists,
 * create-once, membership) we load the shipped rules with ONE surgical,
 * clearly-labeled transform: `appChecked()` is forced to `true`. This neutralizes
 * only the untestable App Check transport gate — it changes NO money, ownership,
 * or whitelist rule. The deny-integrity assertions therefore still prove the
 * exact authorization the shipped file enforces.
 *
 * As an extra guarantee, `describe('shipped rules — verbatim deny core')` loads
 * the UNMODIFIED firestore.rules and proves representative money writes still
 * deny against the byte-for-byte shipped file (denies hold regardless of App
 * Check, since `allow write: if false`).
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const RULES_PATH = path.resolve(__dirname, '../../firestore.rules');
const PROJECT_ID = 'chipd-rules-test';

/** Read the shipped rules verbatim. */
function readShippedRules(): string {
  return fs.readFileSync(RULES_PATH, 'utf8');
}

/**
 * Shipped rules with the (untestable) App Check transport gate neutralized.
 * See the file header for the full rationale. This changes ONLY appChecked().
 */
function readAppCheckShimmedRules(): string {
  const raw = readShippedRules();
  const shimmed = raw.replace(
    /function appChecked\(\)\s*\{[\s\S]*?\}/,
    'function appChecked() {\n      return true;\n    }',
  );
  if (shimmed === raw) {
    throw new Error('appChecked() shim did not match — firestore.rules structure changed.');
  }
  return shimmed;
}

let env: RulesTestEnvironment;
let verbatimEnv: RulesTestEnvironment;

const ALICE = 'alice';
const BOB = 'bob';

/** Seed a doc as an admin (security rules disabled), the way Cloud Functions do. */
async function seed(p: string, data: Record<string, unknown>): Promise<void> {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), p), data);
  });
}

async function seedVerbatim(p: string, data: Record<string, unknown>): Promise<void> {
  await verbatimEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), p), data);
  });
}

/** A representative server-written user doc (what onUserCreate would produce). */
function baseUserDoc(uid: string): Record<string, unknown> {
  return {
    uid,
    displayName: 'Player ' + uid,
    photoURL: null,
    chipsBalance: 1000,
    chipsHeld: 0,
    ledgerVersion: 3,
    xp: 120,
    level: 2,
    // Seeded false so the forbidden-field test patching it to `true` is a REAL
    // diff (writing the same value is a no-op with no affectedKeys to reject).
    ageVerified: false,
    equipped: { avatarFrame: null },
    pro: { active: false, since: null, expiresAt: null },
    powerups: { insurance: 1 },
    settings: { theme: 'dark' },
    locale: 'en',
    region: 'MO',
    isBanned: false,
    flags: { frozen: false },
    rgLimits: { selfExclusionUntil: null },
    winCount: 5,
    lossCount: 2,
  };
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readAppCheckShimmedRules() },
  });
  verbatimEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID + '-verbatim',
    firestore: { rules: readShippedRules() },
  });
});

afterAll(async () => {
  await env.cleanup();
  await verbatimEnv.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await verbatimEnv.clearFirestore();
});

// ─────────────────────────────────────────────────────────────────────────────
// users/{uid} — money / stats / compliance fields are CF-only.
// ─────────────────────────────────────────────────────────────────────────────
describe('users/{uid} — CF-only fields are not client-writable', () => {
  const forbidden: Array<[string, Record<string, unknown>]> = [
    ['chipsBalance', { chipsBalance: 999999 }],
    ['chipsHeld', { chipsHeld: 999999 }],
    ['ledgerVersion', { ledgerVersion: 99 }],
    ['xp', { xp: 999999 }],
    ['level', { level: 99 }],
    ['ageVerified', { ageVerified: true }],
    ['equipped', { equipped: { avatarFrame: 'gold' } }],
    ['pro', { pro: { active: true, since: 1, expiresAt: 2 } }],
    ['powerups', { powerups: { insurance: 999 } }],
  ];

  beforeEach(async () => {
    await seed('users/' + ALICE, baseUserDoc(ALICE));
  });

  for (const [field, patch] of forbidden) {
    it('a client CANNOT write users/{uid}.' + field, async () => {
      const db = env.authenticatedContext(ALICE).firestore();
      await assertFails(updateDoc(doc(db, 'users/' + ALICE), patch));
    });
  }

  it('a client CANNOT write any combination of forbidden fields', async () => {
    const db = env.authenticatedContext(ALICE).firestore();
    await assertFails(
      updateDoc(doc(db, 'users/' + ALICE), {
        displayName: 'Sneaky', // allowed field smuggled alongside...
        chipsBalance: 1_000_000, // ...a forbidden one
      }),
    );
  });
});

describe('users/{uid} — profile whitelist', () => {
  beforeEach(async () => {
    await seed('users/' + ALICE, baseUserDoc(ALICE));
    await seed('users/' + BOB, baseUserDoc(BOB));
  });

  it('a client CAN patch only allowed profile fields on their OWN doc', async () => {
    const db = env.authenticatedContext(ALICE).firestore();
    await assertSucceeds(
      updateDoc(doc(db, 'users/' + ALICE), {
        displayName: 'Alice Prime',
        photoURL: 'https://example.com/a.png',
        settings: { theme: 'light' },
        locale: 'zh-HK',
      }),
    );
  });

  it("a client CANNOT patch another user's profile", async () => {
    const db = env.authenticatedContext(ALICE).firestore();
    await assertFails(updateDoc(doc(db, 'users/' + BOB), { displayName: 'Hacked' }));
  });

  it('a client CANNOT create a user doc directly (server-only)', async () => {
    const db = env.authenticatedContext('carol').firestore();
    await assertFails(setDoc(doc(db, 'users/carol'), baseUserDoc('carol')));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ledgers/{uid}/entries/* — append-only, server-only.
// ─────────────────────────────────────────────────────────────────────────────
describe('ledgers/{uid}/entries — never client-writable', () => {
  it('a client CANNOT create a ledger entry on their own ledger', async () => {
    const db = env.authenticatedContext(ALICE).firestore();
    await assertFails(
      setDoc(doc(db, 'ledgers/' + ALICE + '/entries/e1'), {
        uid: ALICE,
        direction: 'credit',
        amount: 1_000_000,
        reason: 'payout',
        balanceAfter: 1_000_000,
        heldAfter: 0,
      }),
    );
  });

  it("a client CANNOT write to another user's ledger", async () => {
    const db = env.authenticatedContext(ALICE).firestore();
    await assertFails(
      setDoc(doc(db, 'ledgers/' + BOB + '/entries/e1'), { amount: 1, direction: 'credit' }),
    );
  });

  it('a client CAN read their OWN ledger', async () => {
    await seed('ledgers/' + ALICE + '/entries/e1', { uid: ALICE, amount: 100, direction: 'credit' });
    const db = env.authenticatedContext(ALICE).firestore();
    await assertSucceeds(getDoc(doc(db, 'ledgers/' + ALICE + '/entries/e1')));
  });

  it("a client CANNOT read another user's ledger", async () => {
    await seed('ledgers/' + BOB + '/entries/e1', { uid: BOB, amount: 100, direction: 'credit' });
    const db = env.authenticatedContext(ALICE).firestore();
    await assertFails(getDoc(doc(db, 'ledgers/' + BOB + '/entries/e1')));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// bets/{id} — financial + status fields and sub-docs are CF-only.
// ─────────────────────────────────────────────────────────────────────────────
describe('bets/{id} — financial + status writes are CF-only', () => {
  const BET = 'bet1';

  beforeEach(async () => {
    await seed('bets/' + BET, {
      id: BET,
      creatorUid: ALICE,
      status: 'open',
      marketModel: 'PARI_MUTUEL',
      poolTotal: 0,
      poolByOutcome: { yes: 0, no: 0 },
      winningOutcomeId: null,
      outcomes: [
        { id: 'yes', label: 'Yes' },
        { id: 'no', label: 'No' },
      ],
      lockAt: Date.now() + 3_600_000,
    });
  });

  it('a client CANNOT write bets/{id}.poolTotal', async () => {
    const db = env.authenticatedContext(ALICE).firestore();
    await assertFails(updateDoc(doc(db, 'bets/' + BET), { poolTotal: 1_000_000 }));
  });

  it('a client CANNOT flip bets/{id}.status to settled', async () => {
    const db = env.authenticatedContext(ALICE).firestore();
    await assertFails(updateDoc(doc(db, 'bets/' + BET), { status: 'settled' }));
  });

  it('a client CANNOT set bets/{id}.winningOutcomeId', async () => {
    const db = env.authenticatedContext(ALICE).firestore();
    await assertFails(updateDoc(doc(db, 'bets/' + BET), { winningOutcomeId: 'yes' }));
  });

  it('a client CANNOT create a bet directly (server-only)', async () => {
    const db = env.authenticatedContext(ALICE).firestore();
    await assertFails(
      setDoc(doc(db, 'bets/bet2'), {
        id: 'bet2',
        creatorUid: ALICE,
        status: 'open',
        poolTotal: 0,
      }),
    );
  });

  it('a client CANNOT create a bet_entry (escrow record) directly', async () => {
    const db = env.authenticatedContext(ALICE).firestore();
    await assertFails(
      setDoc(doc(db, 'bets/' + BET + '/entries/' + ALICE), {
        uid: ALICE,
        betId: BET,
        outcomeId: 'yes',
        stake: 100,
        status: 'placed',
      }),
    );
  });

  it('a client CANNOT write a bets/{id}/settlement/result doc', async () => {
    const db = env.authenticatedContext(ALICE).firestore();
    await assertFails(
      setDoc(doc(db, 'bets/' + BET + '/settlement/result'), {
        betId: BET,
        model: 'PARI_MUTUEL',
        winningOutcomeId: 'yes',
        pool: 100,
        rake: 0,
        payoutTotal: 100,
        payouts: [{ uid: ALICE, amount: 100, profit: 0 }],
      }),
    );
  });

  it('a client CANNOT write a vote directly (bypassing voteOutcome CF)', async () => {
    const db = env.authenticatedContext(ALICE).firestore();
    await assertFails(
      setDoc(doc(db, 'bets/' + BET + '/votes/' + ALICE), { uid: ALICE, outcomeId: 'yes' }),
    );
  });

  it('a client CANNOT write a comment directly (bypassing postComment CF)', async () => {
    const db = env.authenticatedContext(ALICE).firestore();
    await assertFails(
      setDoc(doc(db, 'bets/' + BET + '/comments/c1'), { uid: ALICE, text: 'gg' }),
    );
  });

  it('a client CAN read a bet', async () => {
    const db = env.authenticatedContext(ALICE).firestore();
    await assertSucceeds(getDoc(doc(db, 'bets/' + BET)));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// handles/{h} — create-once username registry.
// ─────────────────────────────────────────────────────────────────────────────
describe('handles/{h} — create-once, owner-bound', () => {
  it('the owner CAN claim a free handle for themselves', async () => {
    const db = env.authenticatedContext(ALICE).firestore();
    await assertSucceeds(setDoc(doc(db, 'handles/alice'), { uid: ALICE }));
  });

  it('a client CANNOT claim a handle for someone else (uid mismatch)', async () => {
    const db = env.authenticatedContext(ALICE).firestore();
    await assertFails(setDoc(doc(db, 'handles/notalice'), { uid: BOB }));
  });

  it('a SECOND create by another uid fails (handle already taken)', async () => {
    // Alice claims it first.
    const aliceDb = env.authenticatedContext(ALICE).firestore();
    await assertSucceeds(setDoc(doc(aliceDb, 'handles/shared'), { uid: ALICE }));
    // Bob tries to steal the same handle — update/overwrite is denied (create-once).
    const bobDb = env.authenticatedContext(BOB).firestore();
    await assertFails(setDoc(doc(bobDb, 'handles/shared'), { uid: BOB }));
  });

  it('even the owner CANNOT overwrite/update an existing handle', async () => {
    const db = env.authenticatedContext(ALICE).firestore();
    await assertSucceeds(setDoc(doc(db, 'handles/once'), { uid: ALICE }));
    await assertFails(updateDoc(doc(db, 'handles/once'), { uid: ALICE, extra: true }));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// groups/{id}/chat — only crew members may read; member create is allowed.
// ─────────────────────────────────────────────────────────────────────────────
describe('groups/{id}/chat — membership-gated read', () => {
  const GROUP = 'crew1';

  beforeEach(async () => {
    // Alice is a member; Bob is not.
    await seed('groups/' + GROUP, { id: GROUP, name: 'Crew', visibility: 'private' });
    await seed('groups/' + GROUP + '/members/' + ALICE, { uid: ALICE, role: 'member' });
    await seed('groups/' + GROUP + '/chat/m1', {
      messageId: 'm1',
      authorUid: ALICE,
      groupId: GROUP,
      text: 'hello crew',
      createdAt: Date.now(),
    });
  });

  it('a non-member CANNOT read a private group chat', async () => {
    const db = env.authenticatedContext(BOB).firestore();
    await assertFails(getDoc(doc(db, 'groups/' + GROUP + '/chat/m1')));
  });

  it('a member CAN read the group chat', async () => {
    const db = env.authenticatedContext(ALICE).firestore();
    await assertSucceeds(getDoc(doc(db, 'groups/' + GROUP + '/chat/m1')));
  });

  it('a non-member CANNOT post into a group chat', async () => {
    const db = env.authenticatedContext(BOB).firestore();
    await assertFails(
      setDoc(doc(db, 'groups/' + GROUP + '/chat/m2'), {
        messageId: 'm2',
        authorUid: BOB,
        groupId: GROUP,
        text: 'let me in',
        createdAt: Date.now(),
      }),
    );
  });

  it('a member CANNOT author a chat message AS someone else (authorUid spoof)', async () => {
    const db = env.authenticatedContext(ALICE).firestore();
    await assertFails(
      setDoc(doc(db, 'groups/' + GROUP + '/chat/m3'), {
        messageId: 'm3',
        authorUid: BOB, // spoofed author
        groupId: GROUP,
        text: 'not me',
        createdAt: Date.now(),
      }),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// fixtures/{id} — sports oracle data: read-all, CF/scheduled-write only.
// ─────────────────────────────────────────────────────────────────────────────
describe('fixtures/{id} — read-only to clients', () => {
  beforeEach(async () => {
    await seed('fixtures/f1', { fixtureId: 'f1', home: 'A', away: 'B', status: 'scheduled' });
  });

  it('any signed-in user CAN read a fixture', async () => {
    const db = env.authenticatedContext(ALICE).firestore();
    await assertSucceeds(getDoc(doc(db, 'fixtures/f1')));
  });

  it('a client CANNOT write a fixture', async () => {
    const db = env.authenticatedContext(ALICE).firestore();
    await assertFails(updateDoc(doc(db, 'fixtures/f1'), { status: 'finished', homeScore: 3 }));
  });

  it('a client CANNOT create a new fixture', async () => {
    const db = env.authenticatedContext(ALICE).firestore();
    await assertFails(setDoc(doc(db, 'fixtures/f2'), { fixtureId: 'f2', status: 'live' }));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// idempotency / reconciliation — fully server-private.
// ─────────────────────────────────────────────────────────────────────────────
describe('server-only collections', () => {
  it('a client CANNOT read or write /idempotency', async () => {
    const db = env.authenticatedContext(ALICE).firestore();
    await assertFails(getDoc(doc(db, 'idempotency/k1')));
    await assertFails(setDoc(doc(db, 'idempotency/k1'), { key: 'k1' }));
  });

  it('a non-admin client CANNOT read /reconciliation', async () => {
    const db = env.authenticatedContext(ALICE).firestore();
    await assertFails(getDoc(doc(db, 'reconciliation/2026-06-13')));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// VERBATIM shipped-rules deny core — proves money writes deny against the
// byte-for-byte shipped firestore.rules (no App Check shim). These hold because
// the relevant rules are `allow write: if false`, which deny regardless of App
// Check, so they exercise the EXACT shipped file.
// ─────────────────────────────────────────────────────────────────────────────
describe('shipped rules — verbatim deny core (no App Check shim)', () => {
  it('client CANNOT write a ledger entry (verbatim rules)', async () => {
    const db = verbatimEnv.authenticatedContext(ALICE).firestore();
    await assertFails(
      setDoc(doc(db, 'ledgers/' + ALICE + '/entries/e1'), { amount: 1_000_000, direction: 'credit' }),
    );
  });

  it('client CANNOT write a settlement result (verbatim rules)', async () => {
    await seedVerbatim('bets/bv1', { id: 'bv1', status: 'open', poolTotal: 0 });
    const db = verbatimEnv.authenticatedContext(ALICE).firestore();
    await assertFails(
      setDoc(doc(db, 'bets/bv1/settlement/result'), { betId: 'bv1', pool: 100, payoutTotal: 100 }),
    );
  });

  it('client CANNOT bump a user balance (verbatim rules)', async () => {
    await seedVerbatim('users/' + ALICE, baseUserDoc(ALICE));
    const db = verbatimEnv.authenticatedContext(ALICE).firestore();
    await assertFails(updateDoc(doc(db, 'users/' + ALICE), { chipsBalance: 1_000_000 }));
  });

  it('client CANNOT create a bet entry (verbatim rules)', async () => {
    await seedVerbatim('bets/bv2', { id: 'bv2', status: 'open', poolTotal: 0 });
    const db = verbatimEnv.authenticatedContext(ALICE).firestore();
    await assertFails(
      setDoc(doc(db, 'bets/bv2/entries/' + ALICE), { uid: ALICE, stake: 100, status: 'placed' }),
    );
  });
});
