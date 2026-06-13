/**
 * Push notification setup. In the pilot (Firebase JS SDK / Expo Go) we use
 * expo-notifications for the device token + foreground presentation. When the
 * app moves to react-native-firebase, swap the token source to RNFB messaging
 * for true background/quit handlers — registerDevice() and the handlers stay.
 */
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { fns } from '@/lib/firebase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/** Ask for permission, get the Expo push token, register it server-side. */
export async function registerForPush(): Promise<string | null> {
  if (!Device.isDevice) return null;
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (existing !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== 'granted') return null;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Chipd',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 120, 80, 120],
        lightColor: '#00E0A4',
      });
    }

    const token = (await Notifications.getExpoPushTokenAsync()).data;
    try {
      await fns.registerDevice(token, Platform.OS);
    } catch {
      // Server function may not be deployed in dev — token still usable locally.
    }
    return token;
  } catch (e) {
    console.warn('[push] registration failed', e);
    return null;
  }
}

/** Subscribe to taps so we can deep-link into the relevant bet. */
export function onNotificationTap(cb: (data: Record<string, unknown>) => void) {
  const sub = Notifications.addNotificationResponseReceivedListener((res) => {
    cb(res.notification.request.content.data ?? {});
  });
  return () => sub.remove();
}
