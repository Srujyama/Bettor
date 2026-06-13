# Chipd — Build Spec (shared context for builders)

**Chipd** = React Native (Expo SDK 56, expo-router, TypeScript strict) social P2P betting app. Macau pilot, English-first, Western expat audience. Virtual "Chips" currency only — NO real money, NO cash-out. Firebase backend (Auth, Firestore, Functions, Storage). Brand vibe: "private members' card room meets group chat" — casino-luxe, dark-first, NOT sleazy/gambly.

## Absolute rules (do not violate)
- **TypeScript strict.** No `any` unless unavoidable; prefer the shared zod types.
- **The client NEVER computes or writes money.** Balances, pools, payouts, bet status transitions are written ONLY by Cloud Functions. The app reads them and calls callables for mutations.
- Compliance copy: "Chips are for entertainment only and have no real-world cash value." must appear on wallet + onboarding.
- 18+ age gate is server-trusted (verifyAge Cloud Function), never a client checkbox alone.
- Respect reduce-motion: heavy animation degrades to instant/opacity.
- Import Firebase ONLY via `@/lib/firebase` (the swap-boundary). Never import `firebase/*` directly in screens/components.

## Path aliases (tsconfig)
- `@/*` → `src/*`
- `@shared/*` → `src/shared/*` (also reachable as `@/shared/*`)

## Established contracts you MUST build against (already written — read them, do not redefine)

### `src/shared/` (the pure core — already complete & tested)
- `constants.ts`: `ECONOMY`, `STAKE`, `CHIP_DENOMINATIONS`, `RG_DEFAULTS`, `BET_STATUS`, `MARKET_MODEL`, `BET_TYPE`, `RESOLUTION_MODE`, `BET_VISIBILITY`, `BET_CATEGORY`, `LEDGER_REASON`, `LEDGER_DIRECTION`, `HOUSE_UID`, `TIMING`, `TIMEZONE`, `PILOT_REGION`, `IS_REAL_MONEY`, `NO_CASH_VALUE_DISCLOSURE`.
- `money.ts`: `settlePariMutuel`, `settleWinnerTakeAll`, `refundAll`, `applyRake`, `apportion`, `previewPayout`, `verifyConservation`, `assertChips`, `formatChips`, `formatChipsCompact`, `MoneyError`. Types: `SettlementResult`, `Payout`.
- `betStateMachine.ts`: `canTransition`, `assertTransition`, `isTerminal`, `acceptsEntries`, `isEscrowed`, `allowsCancel`.
- `schemas.ts`: zod schemas + inferred types — `User`, `Bet`, `BetEntry`, `Outcome`, `Vote`, `Dispute`, `Comment`, `LedgerEntry`, `Settlement`, `Friend`, `Group`, `FeedItem`, `AppNotification`, `Achievement`, `LeaderboardRow`. Payloads: `CreateBetPayload`, `PlaceBetPayload`, etc. Timestamps are epoch millis (number) on the client.
- `ids.ts`: `makeShareCode()`, `makeId(prefix?)`, `makeIdempotencyKey()`.
- Barrel: `src/shared/index.ts`.

### `src/lib/firebase/` (swap-boundary — already complete)
- `index.ts` re-exports: `auth`, `db`, `functions`, `storage`, `paths`, `authService`, `fns`, `storageService`, plus firestore helpers `getDocOnce`, `getCollectionOnce`, `subscribeDoc`, `subscribeCollection`, `normalize`, and config flags `USE_EMULATOR`, `isFirebaseConfigured`.
- `paths.ts`: `paths.user(uid)`, `paths.bet(id)`, `paths.entries(betId)`, `paths.ledger(uid)`, `paths.group(id)`, `paths.feed(uid)`, `paths.notifications(uid)`, `paths.comments(betId)`, `paths.votes(betId)`, `paths.settlement(betId)`, etc.
- `auth.ts` (as `authService`): `onAuth`, `currentUser`, `signUpEmail`, `signInEmail`, `resetPassword`, `signOut`, `getIdToken`.
- `functions.ts` (as `fns`): `verifyAge`, `createBet`, `placeBet`, `cancelEntry`, `resolveBet`, `voteOutcome`, `raiseDispute`, `grantDailyChips`, `claimZeroRefill`, `setRgLimits`, `sendFriendRequest`, `respondFriendRequest`, `createGroup`, `joinGroup`, `postComment`, `registerDevice`. Each validates with a zod schema and calls the same-named callable.
- `storage.ts` (as `storageService`): `uploadFromUri`, `storagePathForAvatar`, `storagePathForBetMedia`, `storagePathForEvidence`.

### `src/hooks/` (already complete)
- `data.ts`: live (onSnapshot-backed) read hooks: `useCurrentUser()`, `useUser(uid)`, `useWallet()`, `useLedger(max?)`, `useBet(betId)`, `useBetEntries(betId)`, `useBetVotes(betId)`, `useBetComments(betId)`, `useSettlement(betId)`, `useDiscoverBets(max?)`, `useGroupBets(groupId)`, `useUserBets(uid)`, `useFeed()`, `useNotifications()`, `useFriends()`, `useGroups()`, `useGroup(id)`. All return `{ data, isLoading, ... }` (React Query) — collections default `data` to `[]`.
- `useFirestoreQuery.ts`: `useDocQuery`, `useCollectionQuery` (lower-level; usually use `data.ts`).

### `src/stores/` (already complete)
- `session.ts`: `useSession()` → `{ status, uid, appCheckReady, profile, setStatus, setAppCheckReady, setProfile, reset }`; `isOnboarded(profile)`.
- `ui.ts`: `useUi()` → `{ celebrate, triggerCelebrate, clearCelebrate, stakeDraft, setStakeDraft, sessionStartedAt, lastRealityCheckAt, noteRealityCheck, resetSession }`; `useOnboarding()` → `{ ageAcknowledged, rgConsented, tutorialDone, setAgeAcknowledged, setRgConsented, setTutorialDone }`.

### `src/theme/` (already complete)
- `index.ts`: `colors`, `gradients`, `categoryColor`, `space`, `radius`, `shadow`.
- Colors: `ink` (bg), `surface`/`surfaceRaised`/`surfaceSunken`, `jade` (your money/win), `coral` (other side/urgency), `gold` (prestige), `royal` (secondary), `muted`/`faint`, `text`/`textDim`/`textFaint`, semantic `win/loss/pending/void`.

### `src/components/ui/` (design system — already complete)
- `index.ts` exports: `Txt` (variant: display|title|heading|body|label|caption|mono; props dim/muted), `Button` (tone: jade|coral|gold|royal|ghost|danger; size sm|md|lg; loading/disabled/icon/fullWidth), `Card` (raised?, onPress?), `Screen` (edges?), `ChipCounter` (value, size?, color?, prefix?), `Avatar` (uri/name/size/ring), `Input` (label/error/prefix), `Pill` (label/tone/icon), `CountdownRing` (lockAt, createdAt?, size?), `TwoSidedBar` (segments:[{outcomeId,label,amount}], mySide?), `EmptyState` (emoji/title/subtitle/actionLabel/onAction).

## Styling
NativeWind v4 className strings using the tailwind tokens (jade, coral, gold, royal, ink, surface, surface-raised, text, text-dim, muted, hairline, rounded-chip/card/sheet/pill, font-display/sans/mono). For raw color values (SVG/gradient/Reanimated) import from `@/theme`.

## Tailwind color usage note
Opacity modifiers like `bg-jade/15`, `border-coral/30`, `text-jade` work. Surfaces: `bg-ink`, `bg-surface`, `bg-surface-raised`. Borders: `border-hairline`.

## expo-router structure (target)
```
app/
  _layout.tsx                  # root: providers (QueryClient, GestureHandler, SafeArea, BottomSheet), AuthGate, font loading, splash
  +not-found.tsx
  (auth)/_layout.tsx, index.tsx (welcome), email.tsx, phone.tsx, otp.tsx
  (onboarding)/_layout.tsx, age-gate.tsx, profile.tsx, responsible-gaming.tsx, starter-chips.tsx, find-friends.tsx
  (tabs)/_layout.tsx           # bottom tabs: index(Feed), discover, create(FAB→modal), activity, profile
    index.tsx, discover.tsx, create.tsx, activity.tsx, profile.tsx
  bet/[id]/_layout.tsx, index.tsx (detail), resolve.tsx, dispute.tsx, participants.tsx
  group/[id]/index.tsx, settings.tsx
  user/[id].tsx
  leaderboard/index.tsx
  wallet/index.tsx, transactions.tsx
  settings/index.tsx, account.tsx, notifications.tsx, responsible-gaming.tsx, privacy.tsx, legal.tsx
  (modals)/create-bet.tsx, place-stake.tsx, invite-friends.tsx, reality-check.tsx
```
Use typed routes. Deep link scheme `chipd://`.

## Mutation pattern
Wrap callables (`fns.*`) in `useMutation` from `@tanstack/react-query`. Show `burnt` toasts on success/error. The server-written state flows back through the live read hooks automatically — do NOT manually patch balances.
