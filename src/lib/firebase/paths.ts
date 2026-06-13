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
} as const;
