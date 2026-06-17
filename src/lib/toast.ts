/**
 * Drop-in replacement for `burnt`'s toast() that works EVERYWHERE — Expo Go,
 * iOS/Android dev client, and web. `burnt` ships a native module ("Burnt") that
 * isn't in the Expo Go binary, so importing it crashes the app on a real device.
 *
 * Same call signature as burnt — `toast({ title, message?, preset?, haptic? })`
 * — so screens/hooks don't change; they just import from here instead.
 *
 * The actual rendering is done by <ToastHost/> (mounted once at the app root):
 * this module pushes events onto a tiny pub/sub the host subscribes to. Haptics
 * fire here directly (expo-haptics is Expo Go-safe).
 */
import * as Haptics from 'expo-haptics';

export type ToastPreset = 'done' | 'error' | 'none';
export type ToastHaptic = 'success' | 'warning' | 'error' | 'none';

export interface ToastOptions {
  title: string;
  message?: string;
  preset?: ToastPreset;
  haptic?: ToastHaptic;
  /** ms before auto-dismiss (default 2600). */
  duration?: number;
}

export interface ToastEvent extends ToastOptions {
  id: number;
}

type Listener = (t: ToastEvent) => void;

const listeners = new Set<Listener>();
let seq = 0;

export function subscribeToasts(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function fireHaptic(haptic?: ToastHaptic) {
  // expo-haptics is a no-op on web and safe in Expo Go.
  try {
    if (haptic === 'success') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    else if (haptic === 'warning') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    else if (haptic === 'error') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  } catch {
    /* ignore */
  }
}

/** burnt-compatible toast(). */
export function toast(opts: ToastOptions): void {
  fireHaptic(opts.haptic);
  const evt: ToastEvent = { id: ++seq, duration: 2600, ...opts };
  for (const l of listeners) l(evt);
  // Helpful in dev consoles / web where the visual host may not be mounted yet.
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log(`[toast:${opts.preset ?? 'none'}] ${opts.title}${opts.message ? ` — ${opts.message}` : ''}`);
  }
}

/** burnt also exports alert(); provide a compatible alias. */
export const alert = toast;
