/**
 * Auth service. Wraps Firebase Auth so call sites are SDK-agnostic. Phone auth
 * via the JS SDK on RN requires a reCAPTCHA verifier flow; for the pilot/dev we
 * lean on email + Google/Apple (handled in screens) and expose phone helpers
 * that work against the emulator (which accepts any code).
 */

import {
  EmailAuthProvider,
  User as FbUser,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  updateProfile,
} from 'firebase/auth';
import { auth } from './app';

export type AuthUser = FbUser;

export function onAuth(cb: (user: AuthUser | null) => void): () => void {
  return onAuthStateChanged(auth, cb);
}

export function currentUser(): AuthUser | null {
  return auth.currentUser;
}

export async function signUpEmail(email: string, password: string, displayName?: string) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName) await updateProfile(cred.user, { displayName });
  return cred.user;
}

export async function signInEmail(email: string, password: string) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function resetPassword(email: string) {
  await sendPasswordResetEmail(auth, email);
}

export async function reauthEmail(email: string, password: string) {
  if (!auth.currentUser) throw new Error('Not signed in');
  const cred = EmailAuthProvider.credential(email, password);
  await reauthenticateWithCredential(auth.currentUser, cred);
}

export async function signOut() {
  await fbSignOut(auth);
}

export async function getIdToken(forceRefresh = false): Promise<string | null> {
  return auth.currentUser ? auth.currentUser.getIdToken(forceRefresh) : null;
}
