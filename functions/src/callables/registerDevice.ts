/**
 * registerDevice — upsert a device doc carrying the FCM push token + platform,
 * so notifications can be delivered. Keyed by a stable deviceId derived from the
 * token (so re-registering the same token is idempotent).
 */
import { onCall } from 'firebase-functions/v2/https';
import { createHash } from 'crypto';
import { db } from '../lib/admin';
import { paths } from '../lib/paths';
import { now } from '../lib/time';
import { callableOpts, requireAuth, toHttpsError } from '../lib/guards';
import { z } from 'zod';

const RegisterDeviceSchema = z.object({
  token: z.string().min(1),
  platform: z.enum(['ios', 'android', 'web']).or(z.string().min(1)),
  deviceId: z.string().optional(),
});

export const registerDevice = onCall(callableOpts, async (req) => {
  try {
    const uid = requireAuth(req);
    const payload = RegisterDeviceSchema.parse(req.data);

    const deviceId =
      payload.deviceId ?? createHash('sha1').update(payload.token).digest('hex').slice(0, 24);

    await db.doc(paths.device(uid, deviceId)).set(
      {
        deviceId,
        uid,
        token: payload.token,
        platform: payload.platform,
        updatedAt: now(),
      },
      { merge: true },
    );

    return { ok: true, deviceId };
  } catch (e) {
    throw toHttpsError(e, 'Failed to register device.');
  }
});
