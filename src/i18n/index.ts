/**
 * Lightweight i18n. English-first for the Macau expat pilot; the structure is
 * ready for zh-HK / pt. We avoid a heavy runtime for the pilot — a typed string
 * table + a `t()` accessor is enough and keeps bundle size down.
 */
import { en } from './en';

const dictionaries = { en };
type Locale = keyof typeof dictionaries;

let current: Locale = 'en';

export function setLocale(locale: Locale) {
  current = dictionaries[locale] ? locale : 'en';
}

export const strings = () => dictionaries[current];

/** Dot-path getter, e.g. t('wallet.balance'). */
export function t(path: string): string {
  const parts = path.split('.');
  let node: any = dictionaries[current];
  for (const p of parts) node = node?.[p];
  return typeof node === 'string' ? node : path;
}

export { en };
