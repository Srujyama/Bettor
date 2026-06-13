// The Firebase swap-boundary barrel. Import services from here, never firebase/* directly.
export { firebaseApp, auth, db, functions, storage } from './app';
export * from './config';
export * from './paths';
export * as authService from './auth';
export * as fns from './functions';
export * from './firestore';
export * as storageService from './storage';
