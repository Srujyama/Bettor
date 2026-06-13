/**
 * THE Firebase swap-boundary. Everything else in the app imports services from
 * here, never from `firebase/*` directly. To migrate to react-native-firebase
 * (for hardware-backed App Check, native phone auth, background FCM) you only
 * rewrite this file and its siblings in src/lib/firebase — call sites are untouched.
 *
 * We use the Firebase JS SDK so the app runs in Expo Go for fast iteration. Auth
 * persistence uses AsyncStorage (RN) via initializeAuth.
 */

import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  Auth,
  connectAuthEmulator,
  getAuth,
  // @ts-expect-error — getReactNativePersistence is exported from the RN entry but
  // not always in the JS SDK's type surface; it exists at runtime in firebase/auth.
  getReactNativePersistence,
  initializeAuth,
} from 'firebase/auth';
import {
  Firestore,
  connectFirestoreEmulator,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
} from 'firebase/firestore';
import { Functions, connectFunctionsEmulator, getFunctions } from 'firebase/functions';
import { FirebaseStorage, connectStorageEmulator, getStorage } from 'firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { EMULATOR_HOST, FUNCTIONS_REGION, USE_EMULATOR, firebaseConfig } from './config';

let _app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Auth with RN persistence (survives app restarts).
let _auth: Auth;
try {
  _auth = initializeAuth(_app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch {
  // Already initialized (Fast Refresh) — fall back to the existing instance.
  _auth = getAuth(_app);
}

// Firestore. The JS SDK's RN persistence is limited; use memory cache when in
// doubt and let React Query + AsyncStorage be the offline layer.
let _db: Firestore;
try {
  _db = initializeFirestore(_app, {
    localCache: USE_EMULATOR ? memoryLocalCache() : persistentLocalCache({}),
  });
} catch {
  const { getFirestore } = require('firebase/firestore');
  _db = getFirestore(_app);
}

const _functions: Functions = getFunctions(_app, FUNCTIONS_REGION);
const _storage: FirebaseStorage = getStorage(_app);

// Wire emulators once.
let _emulatorsConnected = false;
if (USE_EMULATOR && !_emulatorsConnected) {
  _emulatorsConnected = true;
  try {
    connectAuthEmulator(_auth, `http://${EMULATOR_HOST}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(_db, EMULATOR_HOST, 8080);
    connectFunctionsEmulator(_functions, EMULATOR_HOST, 5001);
    connectStorageEmulator(_storage, EMULATOR_HOST, 9199);
    // eslint-disable-next-line no-console
    console.log(`[firebase] Connected to emulators at ${EMULATOR_HOST}`);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[firebase] Emulator connect failed (already connected?)', e);
  }
}

export const firebaseApp = _app;
export const auth = _auth;
export const db = _db;
export const functions = _functions;
export const storage = _storage;
