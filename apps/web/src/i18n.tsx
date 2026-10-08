import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { DICT, type Key } from './dict';

export type Lang = 'en' | 'th';
interface Ctx { lang: Lang; setLang: (l: Lang) => void; t: (k: Key, vars?: Record<string, string | number>) => string; date: (iso: string, withTime?: boolean) => string }
const I18n = createContext<Ctx>(null as never);
const KEY = 'sola.lang';
const initial = (): Lang => {
  try { const s = localStorage.getItem(KEY); if (s === 'en' || s === 'th') return s; } catch { /* ignore */ }
  return navigator.language?.toLowerCase().startsWith('th') ? 'th' : 'en';
};

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, set] = useState<Lang>(initial);
  const value = useMemo<Ctx>(() => ({
    lang,
    setLang: (l) => { set(l); try { localStorage.setItem(KEY, l); } catch { /* ignore */ } document.documentElement.lang = l; },
    t: (k, vars) => {
      const entry = DICT[k];
      let s = entry ? entry[lang === 'th' ? 1 : 0] : String(k);
      if (vars) for (const [n, v] of Object.entries(vars)) s = s.replaceAll(`{${n}}`, String(v));
      return s;
    },
    // Thai users expect the Buddhist-era calendar in th-TH.
    date: (iso, withTime) => {
      const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
      return d.toLocaleString(lang === 'th' ? 'th-TH' : 'en-GB', withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' });
    },
  }), [lang]);
  return <I18n.Provider value={value}>{children}</I18n.Provider>;
}
export const useI18n = () => useContext(I18n);
