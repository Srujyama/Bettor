/**
 * Centralized Firestore path builders — the single place document locations are
 * defined, mirrored exactly in firestore.rules and the Cloud Functions.
 */
export const paths = {
  user: (uid: string) => `users/${uid}`,
  users: () => `users`,
  handle: (handleLower: string) => `handles/${handleLower}`,
  friends: (uid: string) => `users/${uid}/friends`,
  friend: (uid: string, friendUid: string) => `users/${uid}/friends/${friendUid}`,

  bets: () => `bets`,
  bet: (betId: string) => `bets/${betId}`,
  entries: (betId: string) => `bets/${betId}/entries`,
  entry: (betId: string, uid: string) => `bets/${betId}/entries/${uid}`,
  votes: (betId: string) => `bets/${betId}/votes`,
  vote: (betId: string, uid: string) => `bets/${betId}/votes/${uid}`,
  disputes: (betId: string) => `bets/${betId}/disputes`,
  comments: (betId: string) => `bets/${betId}/comments`,
  settlement: (betId: string) => `bets/${betId}/settlement/result`,

  ledger: (uid: string) => `ledgers/${uid}/entries`,

  groups: () => `groups`,
  group: (groupId: string) => `groups/${groupId}`,
  groupMembers: (groupId: string) => `groups/${groupId}/members`,
  groupMember: (groupId: string, uid: string) => `groups/${groupId}/members/${uid}`,

  feed: (uid: string) => `users/${uid}/feed`,
  notifications: (uid: string) => `users/${uid}/notifications`,
  devices: (uid: string) => `users/${uid}/devices`,
  achievements: (uid: string) => `users/${uid}/achievements`,

  leaderboard: (scope: string, period: string) => `leaderboards/${scope}/periods/${period}`,
  config: (flagId: string) => `config/${flagId}`,

  // ─── Expansion collections (Gamification track owns these path builders) ───
  // Gamification
  achievement: (uid: string, key: string) => `users/${uid}/achievements/${key}`,
  missions: (uid: string) => `users/${uid}/missions`,
  mission: (uid: string, missionId: string) => `users/${uid}/missions/${missionId}`,
  inventory: (uid: string) => `users/${uid}/inventory`,
  inventoryItem: (uid: string, itemId: string) => `users/${uid}/inventory/${itemId}`,
  wrapped: (uid: string) => `users/${uid}/wrapped`,
  wrappedDoc: (uid: string, periodId: string) => `users/${uid}/wrapped/${periodId}`,
  // Seasons
  seasons: () => `seasons`,
  season: (seasonId: string) => `seasons/${seasonId}`,
  seasonStandings: (seasonId: string) => `seasons/${seasonId}/standings`,
  seasonStanding: (seasonId: string, uid: string) => `seasons/${seasonId}/standings/${uid}`,
  // Game formats
  parlays: () => `parlays`,
  parlay: (slipId: string) => `parlays/${slipId}`,
  brackets: () => `brackets`,
  bracket: (bracketId: string) => `brackets/${bracketId}`,
  squares: () => `squares`,
  squaresGame: (gameId: string) => `squares/${gameId}`,
  // Sports
  fixtures: () => `fixtures`,
  fixture: (fixtureId: string) => `fixtures/${fixtureId}`,
  // Social depth
  rivalries: () => `rivalries`,
  rivalry: (pairId: string) => `rivalries/${pairId}`,
  crewChat: (groupId: string) => `groups/${groupId}/chat`,
  crewChatMessage: (groupId: string, messageId: string) => `groups/${groupId}/chat/${messageId}`,
} as const;

/** Stable, order-independent rivalry pair id from two uids. */
export function rivalryPairId(a: string, b: string): string {
  return [a, b].sort().join('__');
}
