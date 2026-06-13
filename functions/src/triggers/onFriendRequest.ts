/**
 * onFriendRequest — when an incoming friend-request edge (status 'pending_in')
 * is created on a user, notify that user. When the edge flips to 'accepted',
 * notify the requester + post a "friend joined" feed item. NON-financial.
 */
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { db } from '../lib/admin';
import { REGION } from '../lib/guards';
import { pushFeedItem, pushNotification } from '../lib/notify';

export const onFriendRequest = onDocumentWritten(
  { region: REGION, document: 'users/{uid}/friends/{friendUid}' },
  async (event) => {
    const uid = event.params.uid; // the owner of this edge
    const friendUid = event.params.friendUid;
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!after) return; // deletion — nothing to notify

    const beforeStatus = before?.status as string | undefined;
    const afterStatus = after.status as string;

    const batch = db.batch();
    let wrote = false;

    // New incoming request → notify the recipient (this edge's owner).
    if (afterStatus === 'pending_in' && beforeStatus !== 'pending_in') {
      const name = (after.displayNameCache as string) ?? 'Someone';
      pushNotification(batch, uid, {
        type: 'friend_request',
        title: 'New friend request',
        body: `${name} wants to be friends.`,
        deepLink: `chipd://user/${friendUid}`,
      });
      wrote = true;
    }

    // Accepted: this edge is the requester's outgoing edge flipping to accepted.
    // Notify the edge owner (the requester) that their request was accepted.
    if (afterStatus === 'accepted' && beforeStatus === 'pending_out') {
      const name = (after.displayNameCache as string) ?? 'Someone';
      pushNotification(batch, uid, {
        type: 'friend_accepted',
        title: 'Friend added',
        body: `${name} accepted your friend request.`,
        deepLink: `chipd://user/${friendUid}`,
      });
      pushFeedItem(batch, uid, {
        type: 'friend_joined',
        actorUid: friendUid,
        actorName: name,
        actorPhotoURL: (after.photoURLCache as string | null) ?? null,
      });
      wrote = true;
    }

    if (wrote) await batch.commit();
  },
);
