# Chipd — notes for Claude

Social P2P betting app. **Macau pilot, English-first, virtual "Chips" only (no real money).** React Native (Expo SDK 56, expo-router, TS strict) + Firebase. See `README.md` and `BUILD_SPEC.md` for the full contract.

## Non-negotiable rules
- **The client NEVER computes or writes money.** Balances/pools/payouts/bet-status are written only by Cloud Functions (`functions/`) in Firestore transactions. The app reads server state (live via `src/hooks/data.ts`) and mutates via callables (`src/lib/firebase/functions.ts`, used through `src/features/*/mutations|hooks`).
- **Compliance gates:** no real money, no cash-out, no standalone gifting; 18+ server-trusted gate (`verifyAge`); "Chips have no cash value" in onboarding/wallet. Don't add features that breach these without the user explicitly deciding to.
- **Import Firebase only via `@/lib/firebase`** (the swap-boundary). Never `firebase/*` directly in screens/components.
- **Money math lives in `src/shared/money.ts`** and is mirrored byte-for-byte into `functions/src/shared/money.ts`. If you change one, change both. It's covered by tests (`npm test`) — keep them green; the conservation invariant (`payouts + rake == pool`) must never break.

## Layout
- `src/shared/` — pure core: `constants`, `money`, `betStateMachine`, `schemas` (zod), `ids`. Mirrored in `functions/src/shared/`.
- `src/lib/firebase/` — the SDK swap-boundary (config, app, auth, firestore, functions, storage, paths).
- `src/hooks/data.ts` — live (onSnapshot → React Query) read hooks. Screens read only from here.
- `src/stores/` — Zustand: `session` (auth/uid/profile), `ui` (celebrate, stake draft, onboarding flags).
- `src/components/ui/` — design system primitives. `src/components/domain/` — BetCard, PoolMeter, etc.
- `src/features/{bets,social}/` — mutation hooks wrapping callables.
- `app/` — expo-router screens. Root `app/_layout.tsx` is the provider + auth/onboarding routing brain.
- `functions/` — gen2 Cloud Functions (region asia-east2). The trusted core: `lib/ledger.ts` (double-entry), `settlement/settle.ts` (atomic, idempotent, conservation-checked), `callables/`, `triggers/`, `scheduled/`.

## Verify after changes
```bash
npm run typecheck                 # tsc, expect 0 errors
npm test                          # shared money/state tests
(cd functions && npm run build)   # functions tsc
npx expo export --platform ios --output-dir /tmp/x   # full Metro bundle (true integration check)
```

## Design language
Dark-first "card room meets group chat". Jade = your money/win, Coral = the other side/urgency, Gold = prestige, Royal = secondary. Tokens in `tailwind.config.js` + `src/theme/`. Respect reduce-motion.

## Known follow-ups
Phone auth (JS SDK reCAPTCHA limitation → falls back to email), Google/Apple sign-in ("coming soon"), FCM push send, materialized leaderboards, a `cancelBet` callable (must refund via `runSettlement({refund:true, terminalStatus:CANCELLED})`), App Check enforcement + RNFB migration for hardware attestation, Firestore TTL on `/idempotency`.
