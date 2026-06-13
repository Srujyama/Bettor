/**
 * Firestore read helpers. Normalizes Firestore Timestamps → epoch millis so the
 * rest of the app (and the zod schemas) deal only in numbers. Provides thin
 * doc/collection subscribe helpers that the React Query hooks wrap.
 */

import {
  DocumentData,
  QueryConstraint,
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from './app';

/** Recursively convert Firestore Timestamps to epoch millis. */
export function normalize<T = any>(data: DocumentData | undefined): T | null {
  if (!data) return null;
  const out: any = Array.isArray(data) ? [] : {};
  for (const [k, v] of Object.entries(data)) {
    if (v instanceof Timestamp) out[k] = v.toMillis();
    else if (v && typeof v === 'object' && !Array.isArray(v) && !(v as any)._lat)
      out[k] = normalize(v as DocumentData);
    else if (Array.isArray(v)) out[k] = v.map((x) => (x instanceof Timestamp ? x.toMillis() : x));
    else out[k] = v;
  }
  return out as T;
}

export async function getDocOnce<T = any>(path: string): Promise<T | null> {
  const snap = await getDoc(doc(db, path));
  return snap.exists() ? ({ ...normalize(snap.data()), id: snap.id } as T) : null;
}

export async function getCollectionOnce<T = any>(
  path: string,
  ...constraints: QueryConstraint[]
): Promise<T[]> {
  const snap = await getDocs(query(collection(db, path), ...constraints));
  return snap.docs.map((d) => ({ ...normalize(d.data()), id: d.id } as T));
}

/** Subscribe to a single document. Returns an unsubscribe fn. */
export function subscribeDoc<T = any>(
  path: string,
  cb: (data: T | null) => void,
  onError?: (e: Error) => void,
): () => void {
  return onSnapshot(
    doc(db, path),
    (snap) => cb(snap.exists() ? ({ ...normalize(snap.data()), id: snap.id } as T) : null),
    (e) => onError?.(e),
  );
}

/**
 * Write helpers for the narrow set of client-writable docs the rules allow
 * (profile field patches, handle reservation, marking feed/notif items read).
 * Money/state writes are NEVER done here — those go through callables (fns.*).
 */

/** Create-or-merge a document. Use `{ merge: true }` (default) to patch fields. */
export async function setDocData(
  path: string,
  data: Record<string, unknown>,
  merge = true,
): Promise<void> {
  await setDoc(doc(db, path), data, { merge });
}

/** Patch an existing document's fields. Fails if the doc does not exist. */
export async function updateDocData(
  path: string,
  data: Record<string, unknown>,
): Promise<void> {
  await updateDoc(doc(db, path), data);
}

/** Sentinel for a server-resolved timestamp (normalized back to millis on read). */
export { serverTimestamp };

/** Subscribe to a collection query. Returns an unsubscribe fn. */
export function subscribeCollection<T = any>(
  path: string,
  constraints: QueryConstraint[],
  cb: (data: T[]) => void,
  onError?: (e: Error) => void,
): () => void {
  return onSnapshot(
    query(collection(db, path), ...constraints),
    (snap) => cb(snap.docs.map((d) => ({ ...normalize(d.data()), id: d.id } as T))),
    (e) => onError?.(e),
  );
}

export { db };
