'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useLogout, useMe } from '@/hooks/useAuth';
import { useI18n } from '@/lib/i18n';

/**
 * The frame around every page: demo banner → header → blue navigation → (page) → footer.
 * A familiar government-portal LAYOUT in our own design. Deliberately NO emblem, flag, palika logo,
 * or "Government of Nepal" wording (AGENTS hard rules #1, #8), and the demo banner always comes first.
 */

/** Hard rule #2: on every page, in English and Nepali. Never translated away or hidden. */
export function DemoBanner() {
  return (
    <div role="note" className="bg-demo px-4 py-2 text-center text-sm text-demo-ink">
      <strong>Demo / portfolio project.</strong> Not affiliated with any government body. Do not enter real information.
      <span className="mx-2" aria-hidden="true">·</span>
      <span lang="ne">डेमो / पोर्टफोलियो परियोजना। कुनै पनि सरकारी निकायसँग सम्बन्धित छैन। वास्तविक जानकारी नराख्नुहोस्।</span>
    </div>
  );
}

/** Our own simple letter mark (not an emblem). */
function LogoMark() {
  return (
    <span
      aria-hidden="true"
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary text-lg font-bold tracking-tight text-white"
    >
      ST
    </span>
  );
}

const NAV = [
  { href: '/', key: 'nav.home' },
  { href: '/services', key: 'nav.services' },
  { href: '/track', key: 'nav.track' },
] as const;

export function SiteHeader() {
  const { t, toggle } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const me = useMe().data;
  const logout = useLogout();

  return (
    <header>
      {/* Thin crimson accent line, a nod to the national colours without using any official symbol. */}
      <div className="h-1 bg-accent" aria-hidden="true" />
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4">
        <Link href="/" className="flex items-center gap-3 text-ink no-underline">
          <LogoMark />
          <span className="flex flex-col leading-tight">
            <span className="text-xl font-bold text-primary">
              Sewa Track <span className="font-semibold text-muted">· सेवा ट्र्याक</span>
            </span>
            <span className="text-sm text-muted">{t('site.tagline')}</span>
          </span>
        </Link>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggle}
            className="min-h-11 rounded-md border border-line px-3 text-sm font-medium hover:bg-surface"
          >
            {t('nav.language')}
          </button>
          {me ? (
            <>
              <span className="hidden text-sm text-muted sm:inline">
                {t('login.loggedInAs')} <strong className="text-ink">{me.name}</strong>
              </span>
              <button
                type="button"
                onClick={() => logout.mutate(undefined, { onSuccess: () => router.push('/') })}
                className="min-h-11 rounded-md border border-accent px-4 text-sm font-semibold text-accent hover:bg-accent-soft"
              >
                {t('login.logout')}
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="flex min-h-11 items-center rounded-md bg-accent px-4 text-sm font-semibold text-white hover:opacity-90"
            >
              {t('nav.login')}
            </Link>
          )}
        </div>
      </div>
      <nav aria-label={t('nav.menu')} className="bg-primary">
        <ul className="mx-auto flex max-w-6xl flex-wrap px-2">
          {NAV.map((item) => {
            const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`flex min-h-12 items-center px-4 text-sm font-semibold text-white no-underline hover:bg-primary-dark ${
                    active ? 'bg-primary-dark shadow-[inset_0_-3px_0_var(--color-accent)]' : ''
                  }`}
                >
                  {t(item.key)}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  const { t } = useI18n();
  return (
    <footer className="mt-16 bg-primary-dark text-white">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <p className="text-lg font-bold">Sewa Track · सेवा ट्र्याक</p>
          <p className="text-sm text-white/85">{t('footer.about')}</p>
          <p className="text-sm text-white/85">
            Demo / portfolio project. Not affiliated with any government body. All data is fake.
          </p>
        </div>
        <ul className="flex flex-col gap-2 text-sm sm:items-end">
          <li>
            <a className="text-white underline" href="/api/docs">
              {t('footer.api')}
            </a>
          </li>
          <li>
            <a className="text-white underline" href="https://github.com/darshanbajgain/sewa-track">
              {t('footer.code')}
            </a>
          </li>
        </ul>
      </div>
    </footer>
  );
}
