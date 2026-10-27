import type { Lang } from './i18n';

/**
 * Display helpers. Times are stored in UTC (API) and always SHOWN in Nepal time (Asia/Kathmandu).
 * Nepali uses Devanagari digits via the browser's Intl (`nu-deva`); no library needed.
 * (BS / Bikram Sambat dates are planned; see docs/frontend.md §9.)
 */
const locale = (lang: Lang) => (lang === 'ne' ? 'ne-NP-u-nu-deva' : 'en-GB');

export const formatDateTime = (iso: string, lang: Lang) =>
  new Date(iso).toLocaleString(locale(lang), { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kathmandu' });

export const formatDate = (iso: string, lang: Lang) =>
  new Date(iso).toLocaleDateString(locale(lang), { dateStyle: 'medium', timeZone: 'Asia/Kathmandu' });

export const formatNumber = (n: number, lang: Lang) => n.toLocaleString(lang === 'ne' ? 'ne-NP-u-nu-deva' : 'en-US');

/** The moment the charter promises (same rule as the API's overdue check). */
export const dueDate = (submittedAtIso: string, serviceDays: number) =>
  new Date(new Date(submittedAtIso).getTime() + serviceDays * 86_400_000).toISOString();
