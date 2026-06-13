# Chipd 🎲

**Casual peer-to-peer betting among friends.** Make a wager on anything — "Will it rain Saturday?", "Lakers beat Celtics tonight?", "Me vs Dave in the 10k" — pool your Chips, settle the score. No cash, all bragging rights.

A React Native (Expo) + Firebase app. **Macau pilot, English-first**, built for the expat / Western community. Virtual **"Chips"** currency only — no real money, no cash-out — architected so real-money rails can be added later without a rewrite.

> **Compliance stance.** Chips are a closed-loop, non-redeemable entertainment token: no on-ramp (cash → Chips), no off-ramp (Chips → cash), no standalone gifting. By removing both *consideration paid in* and *prize paid out*, the pilot is a **social game**, not real-money gambling. The app gates at **18+** (server-trusted) and ships responsible-gaming tools as first-class features. **Get a Macau-qualified legal opinion before any public launch.**

---

## What's in here

| Layer | Tech | Where |
|---|---|---|
| Mobile app | Expo SDK 56, expo-router, React 19, TypeScript strict | `app/`, `src/` |
| Styling | NativeWind (Tailwind), Reanimated 4 | `src/theme/`, `tailwind.config.js` |
| State | TanStack React Query (server state) + Zustand (UI state) | `src/hooks/`, `src/stores/` |
| Backend | Firebase Cloud Functions (gen2, TS) — the trusted money engine | `functions/` |
| Data | Firestore + double-entry append-only ledger | `firestore.rules`, `functions/src/lib/ledger.ts` |
| Shared core | Pure money math + zod schemas + bet state machine (used by app AND functions) | `src/shared/`, mirrored in `functions/src/shared/` |

### The integrity model (read this)
- **The client never computes or writes money.** Balances, pools, payouts, and bet-status transitions are written **only** by Cloud Functions inside Firestore transactions. The app reads server-written state and calls callables for mutations.
- **Double-entry, append-only ledger.** Every Chip movement is an immutable entry; balances are a denormalized cache. Grants flow house → user so Chips are conservable. Settlement asserts a conservation checksum (`payouts + rake == pool`) before committing — it is impossible to create or destroy a Chip.
- **Idempotent everything.** Settlement, placeBet, grants — all keyed so retries and races can't double-spend or double-pay.
- **Firebase access is behind a swap-boundary** (`src/lib/firebase/`). The pilot uses the Firebase JS SDK (runs in Expo Go); migrating to react-native-firebase for hardware-backed App Check is a contained change to that folder only.

---

## Quick start (local, against the emulator)

The app is wired to run against the **Firebase Emulator Suite** out of the box — no real Firebase project needed to develop.

```bash
# 1. Install (root + functions)
npm install
(cd functions && npm install)

# 2. Start the Firebase emulators (Auth, Firestore, Functions, Storage + UI on :4000)
npm run emulators

# 3. In another terminal, seed demo users + bets
npm run seed
#    → demo login (Auth emulator): alextan@example.com / chipd123

# 4. In another terminal, start the app
npm start            # then press i (iOS) / a (Android) / w (web)
```

The default `.env` points at `localhost` emulators. iOS simulator and web use `localhost`; for the **Android emulator** set `EXPO_PUBLIC_EMULATOR_HOST=10.0.2.2`, and for a **physical device** use your machine's LAN IP.

### Going to a real Firebase project
1. `firebase login` then create projects (`chipd-dev` / `chipd-staging` / `chipd-prod`) — or reuse one.
2. Copy `.env.example` → `.env`, fill the `EXPO_PUBLIC_FIREBASE_*` web-config values, set `EXPO_PUBLIC_USE_FIREBASE_EMULATOR=0`.
3. Deploy backend: `firebase deploy --only firestore:rules,firestore:indexes,storage,functions`.
4. Enable Email/Password (and Google/Apple) sign-in providers in the console.

See **[SETUP.md](./SETUP.md)** for the full checklist.

---

## Scripts
- `npm start` / `ios` / `android` / `web` — Expo dev server
- `npm run typecheck` — `tsc --noEmit` (currently **0 errors**)
- `npm test` — shared money-math + state-machine tests (23 tests incl. a 2,000-iteration conservation fuzz)
- `npm run emulators` — Firebase Emulator Suite
- `npm run seed` — populate the emulator with demo data
- `npm run functions:build` — compile Cloud Functions

---

## App map
- **(auth)** welcome → email / phone+OTP sign-in
- **(onboarding)** 18+ age gate → handle/avatar → responsible-gaming consent → 1,000-Chip welcome grant → find friends
- **(tabs)** Feed · Discover · **➕ Create** (FAB) · Activity · Profile
- **Create wizard** — binary / multi-choice / over-under / head-to-head / pool bets, stake & visibility & resolution settings, Macau-timezone deadlines
- **Bet detail** — live pool, two-sided "me vs them" bar, backers, comments/trash-talk, join (hold-to-confirm), resolve, dispute
- **Wallet** — balance, daily Chips, free refill at zero, full ledger
- **Leaderboard · Crews (groups) · Settings · Responsible Gaming (limits, self-exclusion, reality checks, "My Activity")**

## Rich feature set (expansion)
Beyond the core lifecycle, Chipd now includes:
- **Gamification** — XP & levels (with a level-up Chip reward curve), an achievements gallery (22 badges across bronze→platinum, incl. secret ones), daily & weekly **missions/quests**, competitive **seasons** with placement rewards & standings, and a swipeable **"Chipd Wrapped"** stats recap with a shareable card.
- **New bet formats** — **parlays** (multi-leg, all-must-hit, capped multiplier), **squares** (interactive 10×10 grid), single-elimination **brackets/tournaments**, a **quick-bet template library**, one-tap **rematch**, and **challenge-a-friend** head-to-head.
- **Live sports** — a sports browse screen (leagues, upcoming + live fixtures with scores/clock), fixture detail with one-tap "bet on this game", and an **oracle** that auto-resolves sports-tagged bets (and parlay legs) from final scores. Behind a provider port with a deterministic mock — drop in a real sports API later with one adapter.
- **Social depth & virality** — head-to-head **rivalry** pages, **crew chat** (text + stickers you own + share-a-bet), **shareable cards** (bet results, stat flexes, leaderboard, Wrapped) via view-shot, a **referral** program with deep links, reaction fly-ups, and profile **flair** (equipped frames + name colors).
- **Economy & cosmetics** — a **shop** of cosmetic-only items (card skins, avatar frames, sticker packs, name colors, win effects) bought with Chips; **power-ups** (insurance, double-or-nothing, peek) honored post-settlement from the house; a **Pro tier** (cosmetic/convenience perks, 2× daily drop); and compliance-safe **co-bet/gifting** that only moves Chips inside a bet pool.

> Compliance note: all shop/Pro/power-up purchases use **Chips only** (no real money), cosmetics are **cosmetic-only** (never pay-to-win on an outcome), and the "no cash value" line is shown in the shop. Power-ups affect only the virtual Chip economy.

## Bet lifecycle
`draft → open → locked → pending_resolution → (disputed) → resolved → settled`, with `cancelled` / `voided` escape hatches. Locking, auto-void (refund if unresolved by the deadline), and post-dispute-window settlement run as scheduled sweeps. Resolution can be **creator-declared**, **consensus vote**, or (future) **objective oracle**, always with a dispute window that freezes payouts.

---

## Status & known follow-ups
- ✅ Builds clean: iOS + Android Metro bundles (2,500+ modules), `tsc` 0 errors, **57 Cloud Functions** load in the emulator, **41/41 app tests** + **63/63 backend integrity tests** pass. 65 screens, 42 domain components.
- 🔒 **Integrity test suite** (`cd functions && npm run test:rules`): Firestore-rules tests prove clients can't write money/ledger/settlement; a real emulator-backed double-spend test proves concurrent `placeBet` can't overspend; money-conservation property tests over thousands of random books.
- 🤖 **CI** (`.github/workflows/ci.yml`): typecheck + tests + Metro bundle (iOS/Android) + functions build + rules tests + a **compliance gate** that fails the build if a real-money/cash-out path appears or `IS_REAL_MONEY` isn't `false`.
- ⚙️ Runtime wiring live: push registration + deep-link tap routing, the responsible-gaming reality check fires on a session tick, missions seed on app open, template/rematch prefill flows into the create wizard, win celebrations share a card, notification read-state persists.
- ⚠️ **Phone auth** UI is complete but the JS SDK needs a reCAPTCHA verifier on RN — it currently falls back to email. Wire real phone auth when moving to react-native-firebase.
- ⚠️ **Google/Apple sign-in** buttons are present but show "coming soon"; wire `expo-auth-session` / native providers.
- ⚠️ **Push delivery**: device tokens are registered and notification docs are written, but actually sending FCM pushes to those tokens is a follow-up.
- ⚠️ **Leaderboards** are currently derived client-side from your friend circle; add a materializing scheduled function for global/seasonal boards.
- ⚠️ **A future `cancelBet` callable** must refund escrow via `runSettlement(betId, { refund: true, terminalStatus: CANCELLED })` — do not transition a bet with entries to `cancelled` without refunding.
- ⚠️ Set a Firestore **TTL policy** on the `/idempotency` collection's `expireAt` field for prod cleanup.
- ⚠️ **App Check**: start in monitoring mode, flip to enforced before the pilot (and prefer react-native-firebase for hardware attestation).
- 📋 Before launch: Macau-qualified legal opinion; confirm `realMoneyEnabled`/`cashOutEnabled` are false in prod; store listings positioned as a social prediction game (no "gambling / win cash / casino" framing).
