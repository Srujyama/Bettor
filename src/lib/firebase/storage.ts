/** Storage helpers for avatars and bet/proof media. */
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from './app';

/** Upload a local file URI to a storage path; returns the download URL. */
export async function uploadFromUri(path: string, uri: string): Promise<string> {
  const res = await fetch(uri);
  const blob = await res.blob();
  const r = ref(storage, path);
  await uploadBytes(r, blob);
  return getDownloadURL(r);
}

export function storagePathForAvatar(uid: string): string {
  return `avatars/${uid}/${Date.now()}.jpg`;
}

export function storagePathForBetMedia(betId: string): string {
  return `bets/${betId}/${Date.now()}.jpg`;
}

export function storagePathForEvidence(betId: string, uid: string): string {
  return `evidence/${betId}/${uid}-${Date.now()}.jpg`;
}
