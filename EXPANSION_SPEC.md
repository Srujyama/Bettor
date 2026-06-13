# Chipd — Expansion Spec (shared context for feature builders)

Read `BUILD_SPEC.md` FIRST for the base contracts (shared core, firebase boundary `@/lib/firebase`, read hooks `@/hooks/data`, stores, theme, UI primitives in `@/components/ui`, domain components in `@/components/domain`, mutation patterns). This file adds the EXPANSION contracts. Everything below already exists and compiles — build ON it, do not redefine it.

## Hard rules (unchanged)
- Client NEVER computes/writes money. All Chip movement → Cloud Functions via the ledger. Reads via live hooks; mutations via callables wrapped in `useMutation` + `burnt` toasts.
- Import Firebase only via `@/lib/firebase`. TypeScript strict, no `any`.
- Compliance: Chips have no cash value; shop/Pro/power-ups are bought with CHIPS only (no real money), and cosmetics are **cosmetic-only** (never pay-to-win on a bet outcome). Power-ups affect only the virtual Chip economy and must be disclosed clearly.
- Verify your slice with `npx tsc --noEmit` (expect 0 errors in your files) before finishing.

## NEW shared contracts (already written — `@/shared` barrel re-exports all)

### `@/shared/gamification.ts`
- `XP` (action→points), `xpForLevel(level)`, `levelFromXp(totalXp) → {level,intoLevel,span,progress,nextLevelXp}`, `levelUpReward(level)`.
- `STREAK_MILESTONES`, `streakMilestoneReward(streak)`.
- `ACHIEVEMENTS: AchievementDef[]`, `ACHIEVEMENT_BY_KEY`, `satisfiedAchievements(stats)`, type `AchievementTier`.
- `MISSION_POOL: MissionDef[]`, `MISSION_BY_KEY`, types `MissionPeriod`/`MissionMetric`.
- `SEASON` config, `seasonRankReward(rank)`.
- `SHOP_CATALOG: CosmeticDef[]`, `COSMETIC_BY_KEY`, type `CosmeticType`.
- `POWERUPS: PowerUpDef[]`, `POWERUP_BY_KEY`.
- `PRO` config (PRICE_CHIPS, PERIOD_DAYS, PERKS, DAILY_MULTIPLIER).

### `@/shared/formats.ts`
- Parlays: `ParlayLegLike`, `legResult`, `parlayHits`, `parlayBusted`, `parlayMultiplier`, `parlayProgress`.
- Brackets: `bracketRounds`, `seedBracket`, types `BracketMatch`/`BracketSlot`.
- Squares: `SquaresGrid`, `newSquaresGrid`, `squaresFilled`, `squaresIsFull`, `squaresWinningCell`, `shuffledDigits`.
- Power-ups: `insurancePayout`, `DOUBLE_OR_NOTHING_MULTIPLIER`.

### `@/shared/schemas-ext.ts` (zod + inferred types)
`UserAchievement`, `UserMission`, `Season`, `SeasonStanding`, `Wrapped`, `InventoryItem`, `EquippedCosmetics`, `ProStatus`, `PowerUpInventory`, `ParlayLeg`, `ParlaySlip`, `Bracket`, `SquaresGame`, `Fixture`, `Rivalry`, `ChatMessage`. Payloads: `ClaimMissionPayloadSchema`, `BuyCosmeticPayloadSchema`, `EquipCosmeticPayloadSchema`, `BuyPowerUpPayloadSchema`, `SubscribeProPayloadSchema`, `CreateParlayPayloadSchema`, `CreateSquaresPayloadSchema`, `ClaimSquarePayloadSchema`, `SendChatPayloadSchema`, `ChallengeFriendPayloadSchema`.

### New `LEDGER_REASON` values (in `@/shared/constants`)
`MISSION_REWARD`, `SEASON_REWARD`, `LEVEL_UP_REWARD`, `STREAK_REWARD`, `SHOP_PURCHASE`, `POWERUP_USE`, `POWERUP_PAYOUT`, `PRO_SUBSCRIPTION`, `GIFT_SENT`, `GIFT_RECEIVED`. Use the existing ledger engine (`functions/src/lib/ledger.ts`: `postLedgerTxn`, `grantChips`) for all grants/debits — idempotent, double-entry, conserved.

## Firestore collections to ADD (mirror in firestore.rules + indexes; clients NEVER write money/inventory — CF only)
- `users/{uid}/achievements/{key}` (UserAchievement) — read own/public; CF-write.
- `users/{uid}/missions/{missionId}` (UserMission) — read own; CF-write (claim via callable).
- `users/{uid}/inventory/{itemId}` (InventoryItem) — read own; CF-write. `equipped` cosmetics also denormalized onto `users/{uid}.equipped` (EquippedCosmetics) and `users/{uid}.pro` (ProStatus), `users/{uid}.powerups` (map key→count) — all CF-write-only (extend the user update rule's forbidden set).
- `seasons/{seasonId}` + `seasons/{seasonId}/standings/{uid}` — read all; CF-write.
- `parlays/{slipId}` (ParlaySlip) — read participant/public; created via `createParlay` CF.
- `brackets/{bracketId}`, `squares/{gameId}` — created via CFs.
- `fixtures/{fixtureId}` (Fixture) — read all; CF/scheduled-write only.
- `rivalries/{pairId}` (Rivalry) — read the two participants; CF-write (updated by onBetSettled).
- `groups/{groupId}/chat/{messageId}` (ChatMessage) — read members; create via `sendChat` CF (rate-limited).
- `users/{uid}/wrapped/{periodId}` (Wrapped) — read own; CF-write.

## NEW callables to add to `@/lib/firebase/functions.ts` (`fns.*`) AND implement in `functions/src/callables/`
`claimMission`, `buyCosmetic`, `equipCosmetic`, `buyPowerUp`, `subscribePro`, `createParlay`, `createSquaresGame`, `claimSquare`, `sendChat`, `challengeFriend`. Each: App Check enforced (existing `enforceAppCheck`/guards), validate with the zod payload, run in a transaction, debit/credit via ledger where money moves. Mirror the existing callables' structure exactly.

## NEW read hooks to add to `@/hooks/data.ts`
`useAchievements()`, `useMissions()`, `useInventory()`, `useSeason()`, `useSeasonStandings()`, `useWrapped()`, `useParlay(id)`, `useSquares(id)`, `useFixtures(filter?)`, `useRivalry(otherUid)`, `useCrewChat(groupId)`. Use the existing `useDocQuery`/`useCollectionQuery` + `paths` (add new path builders to `@/lib/firebase/paths.ts`).

## Navigation (add routes; wire into existing tabs/stacks without breaking them)
New stacks under `app/`: `play/` (game-formats hub: parlay builder, brackets, squares, templates), `sports/` (fixtures browse + fixture detail), `shop/` (cosmetics + power-ups + Pro), `season/` (season hub + standings), `missions/` (daily/weekly), `achievements/`, `wrapped/[periodId]`, `rivalry/[uid]`, `group/[id]/chat`. Add a "Play" or "Games" entry point from the Discover or Create surface and a "Shop"/"Missions"/"Season" entry from Profile or a new hub. DO NOT rewrite `app/_layout.tsx` routing logic — only add `<Stack.Screen>` entries if needed (it already has a generic stack).

## Coordination — file ownership (no two tracks touch the same file)
- Each track creates its OWN new files. Shared files that MULTIPLE tracks must extend are owned by ONE track each:
  - `@/lib/firebase/paths.ts` additions → **Gamification track** owns (add ALL new paths for every track in one pass; list them from this spec).
  - `@/lib/firebase/functions.ts` additions → **Economy track** owns (add ALL new `fns.*` wrappers for every track).
  - `@/hooks/data.ts` additions → **Social track** owns (add ALL new read hooks).
  - `firestore.rules` + `firestore.indexes.json` additions → **Sports track** owns (add rules/indexes for ALL new collections).
  - `app/(tabs)/_layout.tsx` / hub entry points → **Gamification track** owns any tab/hub edits.
- If you need a path/hook/callable another track owns, ASSUME it exists with the name listed here and use it; the owner will create it.
- Components: put new domain components in `@/components/domain/` with UNIQUE names; export from its `index.ts` (append, don't rewrite — use a separate `index-ext.ts` if worried, but appending is fine if you only add lines).
