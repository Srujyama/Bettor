/**
 * Firebase environment config. Read from EXPO_PUBLIC_* env at build time.
 * These are public by design — protection comes from Security Rules + App Check.
 */

export const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? '',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? 'chipd-dev',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? '',
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID ?? '',
};

export const USE_EMULATOR = process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATOR === '1';
export const EMULATOR_HOST = process.env.EXPO_PUBLIC_EMULATOR_HOST ?? 'localhost';
export const FUNCTIONS_REGION = process.env.EXPO_PUBLIC_FUNCTIONS_REGION ?? 'asia-east2';
export const RECAPTCHA_SITE_KEY = process.env.EXPO_PUBLIC_FIREBASE_RECAPTCHA_SITE_KEY ?? '';

/** True when the app is sufficiently configured to talk to a real backend. */
export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey) || USE_EMULATOR;
