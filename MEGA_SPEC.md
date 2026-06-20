# Chipd — Mega-feature build spec (markets / casino / engagement / discovery)

Read `BUILD_SPEC.md` + `EXPANSION_SPEC.md` for base contracts. This adds the new "addictive, Kalshi-style, slots-like" feature set. **Virtual Chips only — no real money, no cash-out.** All money moves server-side through the ledger; clients read server state + call callables.

## Hard rules (unchanged)
- Client NEVER computes/writes money. Import Firebase only via `@/lib/firebase`. TS strict, no `any`, no placeholders. Verify your slice with `npx tsc --noEmit` (0 errors in your files) before finishing.
- Compliance: Chips have no cash value; games have a house edge but it's entertainment, not cash. Keep "no cash value" disclosure on casino/markets surfaces.
- Respect reduce-motion on the juicy animations (degrade to instant/opacity).

## NEW shared contracts (DONE — `@/shared` barrel re-exports all; functions mirror exists)

### `@/shared/markets.ts` — LMSR prediction-market AMM
- `MarketState {qYes,qNo,b}`, `cost`, `priceYes`, `price(state,side)`, `priceCents(state,side)`, `quoteBuy(state,side,budget)→{shares,cost,avgPriceCents,after,potentialPayout}`, `quoteSell(state,side,shares)→{proceeds,after}`, `maxSubsidy(b)`, `liquidityForSeed(seedChips)`, `SHARE_PAYOUT=100`. Type `MarketSide='yes'|'no'`.

### `@/shared/casino.ts` — provably-fair games
- `rng(seedStr)`, `seedString(server,client,nonce)`, `hashSeed`.
- `coinFlip(seed,pick)`, `COINFLIP`. `spinSlots(seed)→SlotResult{reels,indices,multiplier,nearMiss}`, `SLOT_SYMBOLS`. `spinWheel(seed)→{segmentIndex,multiplier,rotation}`, `WHEEL_SEGMENTS`. `scratchCard(seed)→{cells,multiplier}`, `SCRATCH`. `crashPoint(seed)`, `resolveCrash(seed,cashoutMult)→{crashAt,won,multiplier}`, `CRASH`. `gamePayout(stake,mult)`, `gameNet(stake,mult)`. All RTP<1 (verified).

### `@/shared/engagement.ts`
- `HOURLY_DROP`, `hourlyDropAmount(streak)`, `hourlyDropReadyIn(lastClaimAt,now)`. `CHEST_TABLE`, `rollChest(r)→{tier,chips}`. `DAILY_SPIN`. `streakMeterProgress(streak)`, `heatScore({joinsLastHour,volumeLastHour,ageMins})`.

### `@/shared/schemas-markets.ts` (zod + types)
`Market`, `MarketPosition`, `MarketTrade`, `GameRound`, `EngagementState`, `DiscoveryItem`. Payloads: `CreateMarketPayloadSchema`, `TradeMarketPayloadSchema`, `ResolveMarketPayloadSchema`, `PlayGamePayloadSchema`, `ClaimHourlyDropPayloadSchema`, `OpenChestPayloadSchema`, `DailySpinPayloadSchema`.

### New `LEDGER_REASON` (in `@/shared/constants`)
`MARKET_BUY`, `MARKET_SELL`, `MARKET_PAYOUT`, `MARKET_REFUND`, `GAME_WAGER`, `GAME_PAYOUT`, `HOURLY_DROP`, `CHEST_REWARD`, `SPIN_REWARD`. Use the existing ledger engine (`functions/src/lib/ledger.ts`: `postLedgerTxn`, `grantChips`) — idempotent, double-entry, conserved. Casino/market wins are funded from the house account (`HOUSE_UID`), same as grants.

## Firestore collections to ADD (clients NEVER write money — CF only)
- `markets/{marketId}` (Market) — read public; created/traded via CFs. `markets/{marketId}/positions/{uid}` (MarketPosition), `markets/{marketId}/trades/{tradeId}` (MarketTrade).
- `users/{uid}/gameRounds/{roundId}` (GameRound) — read own; CF-write.
- `users/{uid}.engagement` (EngagementState map on the user doc) — CF-write-only (add to the user-doc forbidden client-write set).
- `discovery/{itemId}` (DiscoveryItem) — read all; CF/scheduled-write.

## NEW callables — add wrappers to `@/lib/firebase/functions.ts` (`fns.*`) AND implement in `functions/src/callables/`
`createMarket`, `tradeMarket`, `resolveMarket` (admin/oracle), `playGame` (one callable handles all 5 games via the `game` field), `claimHourlyDrop`, `openChest`, `dailySpin`. App Check enforced; validate with the zod payload; transaction + ledger where money moves. Mirror the existing callables' structure.

## NEW read hooks — add to `@/hooks/data.ts`
`useMarkets(filter?)`, `useMarket(id)`, `useMarketPosition(marketId)`, `useMyPositions()`, `useGameRounds(max?)`, `useDiscoveryFeed(max?)`, `useTrendingMarkets()`. Use existing `useDocQuery`/`useCollectionQuery` + `paths` (add new path builders).

## Navigation
New stacks: `markets/` (feed, `[id]` detail, positions, create), `casino/` (hub + `slots`/`wheel`/`scratch`/`coinflip`/`crash`), `feed/` (the discovery vertical pager — make this a NEW TAB if clean, else a hub entry). Engagement surfaces (hourly drop, chest, daily spin, streak meter) live on the wallet + feed + a `rewards/` screen. DO NOT rewrite `app/_layout.tsx` routing — only add `_layout.tsx` per new directory (header stacks, copy `app/shop/_layout.tsx`).

## File OWNERSHIP (avoid collisions — each shared file owned by ONE track)
- `@/lib/firebase/paths.ts` additions → **Markets track** (add ALL new paths for every track in one pass: markets/market/marketPositions/marketPosition/marketTrades, gameRounds, discovery/discoveryItem).
- `@/lib/firebase/functions.ts` additions → **Casino track** (add ALL new `fns.*` wrappers for every track).
- `@/hooks/data.ts` additions → **Discovery track** (add ALL new read hooks).
- `firestore.rules` + `firestore.indexes.json` → **Engagement track** (add rules + indexes for ALL new collections; add `engagement` to the user-doc forbidden client-write fields).
- `app/(tabs)/_layout.tsx` (if adding a Feed tab) → **Discovery track**.
- `src/components/domain/index.ts` → every track APPENDS its own exports (add lines only).
- If you need another track's path/hook/callable, ASSUME it exists by the name in this spec and use it.

## Design / vibe
Casino-luxe but matte (the current design language: flat surfaces, solid fills, jade/coral/gold accents, hairline borders — see src/components/ui). Make casino games genuinely JUICY with Reanimated (spinning reels, wheel deceleration, scratch reveal, rising crash curve, big-win confetti via the existing WinCelebration / a BigWinOverlay). Markets feel like a trading app (price chart, green/red, percent moves). Discovery feed is full-screen vertical TikTok-style. Keep "Chips have no cash value" visible.
