'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import en from '../../messages/en.json';
import ne from '../../messages/ne.json';

/**
 * English / Nepali (PRD F12). All user-facing labels go through `t('key')`.
 * The chosen language is remembered in localStorage (a per-browser convenience; wrapped in try/catch
 * because storage can be blocked, e.g. in private windows).
 */
export type Lang = 'en' | 'ne';
type Key = keyof typeof en;

const DICTIONARIES: Record<Lang, Record<Key, string>> = { en, ne };
const STORAGE_KEY = 'sewa-lang';

interface I18n {
  lang: Lang;
  t: (key: Key) => string;
  toggle: () => void;
}

const I18nContext = createContext<I18n | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>('en');

  // Read the saved choice after the first render (the server always renders English).
  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === 'ne') setLang('ne');
    } catch {
      /* storage unavailable: keep English */
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const toggle = useCallback(() => {
    setLang((current) => {
      const next = current === 'en' ? 'ne' : 'en';
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const value = useMemo<I18n>(() => ({ lang, toggle, t: (key) => DICTIONARIES[lang][key] ?? en[key] }), [lang, toggle]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <LanguageProvider>');
  return ctx;
}

/** Pick the English or Nepali variant of a bilingual API field, e.g. pickName(service, lang). */
export const pickName = (item: { nameEn: string; nameNe: string }, lang: Lang) => (lang === 'ne' ? item.nameNe : item.nameEn);
