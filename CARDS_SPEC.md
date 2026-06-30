# Chipd — Fixed-odds + Card-tracker build spec

Read `BUILD_SPEC.md` for base contracts (Firebase swap-boundary `@/lib/firebase`, read hooks `@/hooks/data`, stores, theme, UI primitives `@/components/ui`, domain components `@/components/domain`, mutation pattern: callables wrapped in `useMutation` + `toast` from `@/lib/toast`). Two INDEPENDENT features here.

## Hard rules
- Client NEVER computes/writes money — all Chip movement via Cloud Functions + the ledger (`functions/src/lib/ledger.ts`: `postLedgerTxn`, `grantChips`; idempotent, double-entry, conserved). Read an existing callable (`functions/src/callables/placeBet.ts`) + guards (`functions/src/lib/guards.ts`: `requireAuth`, `assertUserAllowed`, `callableOpts`, `toHttpsError`) to match the pattern.
- Import Firebase only via `@/lib/firebase`. TS strict, no `any`, no placeholders. Verify your slice typechecks (`npx tsc --noEmit`, 0 errors in your files) AND `cd functions && npm run build`.
- Compliance: Chips-only, "Chips have no cash value" disclosure on money surfaces. Respect reduce-motion.

## DONE shared contracts (`@/shared` barrel; functions mirror exists)
### `@/shared/fixedodds.ts` (fixed-odds track)
`assertOdds`, `impliedProbability`, `toFractional`, `toAmerican`, `americanToDecimal`, `layerRiskFor(backerStake,decimal)`, `makerProfitFor`, `matchedPot`, `computeFill(remainingBackerStake,decimal,takerBudget)→FillResult|null`, `settleMatch(backerStake,decimal,backerWon)→{winner,payout,pot}`, `refundMatch`, `MIN/MAX_DECIMAL_ODDS`, `OddsError`.
### `@/shared/settleup.ts` (card track)
`computeNets`, `netImbalance`, `totalBuyIn`, `settleUp(nets)→Transfer[]`, `computeSettlement(players)→{nets,transfers,imbalance,balanced}`, `tournamentPayouts(results,prizePool)→[{uid,place,amount}]`. Types `PlayerLedger`, `PlayerNet`, `Transfer`.
### `@/shared/schemas-cards.ts`
`FixedOddsOffer`, `FixedOddsMatch`, `CardSession`, `SessionPlayer`, `SessionTxn`, `CARD_GAME` (POKER_CASH/POKER_TOURNAMENT/BLACKJACK/GENERIC), `CardGameType`. Payloads (+schemas): `CreateOfferPayloadSchema`, `TakeOfferPayloadSchema`, `CancelOfferPayloadSchema`, `CreateSessionPayloadSchema`, `JoinSessionPayloadSchema`, `SessionBuyInPayloadSchema`, `SessionCashoutPayloadSchema`, `SettleSessionPayloadSchema`.
### New `LEDGER_REASON` (in `@/shared/constants`): `OFFER_ESCROW`, `OFFER_REFUND`, `OFFER_PAYOUT`, `SESSION_BUYIN`, `SESSION_CASHOUT`, `SESSION_SETTLE`.

## FILE OWNERSHIP (two tracks, no collisions)
- Each track creates ITS OWN new files (callables, screens, components, feature-hooks file).
- **Fixed-odds track** owns: additions to `src/lib/firebase/paths.ts` (offer/match paths), `src/lib/firebase/functions.ts` (fns wrappers for createOffer/takeOffer/cancelOffer), `firestore.rules` + `firestore.indexes.json` (offers/matches sub-collection rules+indexes). Append only; keep existing intact.
- **Card track** owns: a NEW path file is fine OR append its session paths to `src/lib/firebase/paths.ts`? NO — to avoid 2 tracks editing paths.ts, the **Card track adds its session paths to `src/lib/firebase/paths.ts` too but in a clearly separate block**; if worried, the Card track may instead define its session path strings locally in its feature file. SAFER: Card track owns `src/hooks/data.ts` additions (read hooks) + adds its own session paths inside its feature hooks file (not paths.ts). Fixed-odds owns paths.ts. Card track owns its fns wrappers by appending to functions.ts AFTER fixed-odds' block — to avoid both editing functions.ts, **Card track puts its wrappers in its own `src/features/cards/callables.ts`** instead of functions.ts.
  - NET: Fixed-odds owns paths.ts + functions.ts + rules + indexes (adds entries for BOTH tracks' new collections so there's a single owner). Card track owns data.ts (read hooks for BOTH... no). KEEP IT SIMPLE:
  - **Fixed-odds track owns: paths.ts, functions.ts, firestore.rules, firestore.indexes.json** — and adds entries for BOTH features' collections (offers/matches AND cardSessions/players/txns) since it's the single owner of those shared files. List the card collections from this spec.
  - **Card track owns: `src/hooks/data.ts`** (adds read hooks for BOTH features) and creates its own screens/callables/components. The Card track ASSUMES `paths.cardSession(...)` etc. and `fns.createSession(...)` exist (fixed-odds track adds them).
- `src/components/domain/index.ts`: each track APPENDS its own exports (add lines only).
- DO NOT touch `app/_layout.tsx` routing, `src/shared/*` (done). Add a `_layout.tsx` per new screen directory (copy `app/shop/_layout.tsx`).

## Coordinated collection paths (Fixed-odds track adds ALL of these to paths.ts + rules + indexes)
- Offers: `bets/{betId}/offers/{offerId}` → `offers(betId)`, `offer(betId,offerId)`. Matches: `bets/{betId}/matches/{matchId}` → `matches(betId)`, `match(betId,matchId)`.
- Card sessions: `cardSessions/{sessionId}` → `cardSessions()`, `cardSession(id)`. Players: `cardSessions/{id}/players/{uid}` → `sessionPlayers(id)`, `sessionPlayer(id,uid)`. Txns: `cardSessions/{id}/txns/{txnId}` → `sessionTxns(id)`, `sessionTxn(id,txnId)`.
- Rules: offers/matches readable by signed-in users on a readable bet, CF-write only. cardSessions readable by members (or signed-in for the pilot), CF-write only (clients never write money/net/transfers). Indexes: offers by (betId/status), cardSessions by (hostUid, createdAt) and (status, createdAt), players/txns by createdAt.

## Design
Match the matte design language (flat surfaces, jade/coral/gold accents, hairline borders — see src/components/ui). Fixed-odds: an "odds book" feeling (offers list with odds + stake + take button; a 'lay odds' composer with an odds stepper showing implied % + to-win). Card tracker: a clean ledger feel — players with running buy-in totals, big net numbers (jade up / coral down), a settle-up screen listing "X pays Y: N chips".
