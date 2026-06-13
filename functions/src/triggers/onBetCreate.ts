/**
 * onBetCreate — fan out a "new bet" feed item + notification to the audience:
 *  - GROUP bets → every group member.
 *  - FRIENDS/PUBLIC bets → the creator's accepted friends.
 * Plus a feed item on the creator's own feed. NON-financial only.
 */
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { db } from '../lib/admin';
import { paths } from '../lib/paths';
import { REGION } from '../lib/guards';
import { pushFeedItem, pushNotification, acceptedFriendUids } from '../lib/notify';
import { BET_VISIBILITY } from '../shared/constants';

export const onBetCreate = onDocumentCreated(
  { region: REGION, document: 'bets/{betId}' },
  async (event) => {
    const bet = event.data?.data();
    if (!bet) return;

    const betId = event.params.betId;
    const creatorUid = bet.creatorUid as string;
    const creatorName = (bet.creatorName as string) ?? 'A player';
    const creatorPhotoURL = (bet.creatorPhotoURL as string | null) ?? null;
    const betTitle = (bet.title as string) ?? 'a bet';
    const visibility = (bet.visibility as string) ?? BET_VISIBILITY.FRIENDS;
    const groupId = (bet.groupId as string | null) ?? null;

    // Determine the audience.
    let audience: string[] = [];
    if (visibility === BET_VISIBILITY.GROUP && groupId) {
      const members = await db.collection(paths.groupMembers(groupId)).get();
      audience = members.docs.map((d) => d.id);
    } else {
      audience = await acceptedFriendUids(creatorUid);
    }
    audience = audience.filter((uid) => uid !== creatorUid);

    const batch = db.batch();

    // Creator's own feed.
    pushFeedItem(batch, creatorUid, {
      type: 'bet_created',
      actorUid: creatorUid,
      actorName: creatorName,
      actorPhotoURL: creatorPhotoURL,
      betId,
      betTitle,
      groupId,
    });

    for (const uid of audience) {
      pushFeedItem(batch, uid, {
        type: 'bet_created',
        actorUid: creatorUid,
        actorName: creatorName,
        actorPhotoURL: creatorPhotoURL,
        betId,
        betTitle,
        groupId,
      });
      pushNotification(batch, uid, {
        type: 'bet_created',
        title: `${creatorName} started a bet`,
        body: betTitle,
        betId,
        deepLink: `chipd://bet/${betId}`,
      });
    }

    await batch.commit();
  },
);
