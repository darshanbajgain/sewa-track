'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, ButtonLink, Modal } from '@/components/common';
import { useLogout, useMe } from '@/hooks/useAuth';
import { useI18n } from '@/lib/i18n';
import { PORTAL_TABS, ROLE_HOME } from '@/lib/routing';

/**
 * The frame around every page: demo notice (dialog on load) → header with the DEMO pill → blue navigation
 * → (page) → footer with the demo line. A familiar government-portal LAYOUT in our own design.
 * Deliberately NO emblem, flag, palika logo, or "Government of Nepal" wording (AGENTS hard rules #1, #8).
 */

/**
 * Hard rule #2 (AGENTS §3.2, PRD F13; changed 2026-11-03 by the owner): the full demo disclaimer, in
 * English and Nepali, opens as a dialog when the site loads. Its open/closed state is plain React state in
 * the root layout, which stays mounted while the user moves between pages, so closing it lasts until the
 * next full page load (a reload shows it again). No storage on purpose.
 * Every page also keeps a permanent marker: the DEMO pill by the logo and the footer line.
 */
export function DemoNotice() {
  const [open, setOpen] = useState(true);
  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title="Demo / portfolio project · डेमो / पोर्टफोलियो परियोजना"
      closeLabel="Close"
      footer={<Button onClick={() => setOpen(false)}>I understand · बुझेँ</Button>}
    >
      <div className="flex flex-col gap-3">
        <p>
          <strong>Sewa Track is a demo / portfolio project.</strong> It is not affiliated with any government body. All data is
          fake. Do not enter real information.
        </p>
        <p lang="ne">
          <strong>सेवा ट्र्याक डेमो / पोर्टफोलियो परियोजना हो।</strong> कुनै पनि सरकारी निकायसँग सम्बन्धित छैन। सबै डेटा नक्कली हो।
          वास्तविक जानकारी नराख्नुहोस्।
        </p>
      </div>
    </Modal>
  );
}

/** The permanent marker on every page, next to the logo. */
function DemoPill() {
  return (
    <span className="rounded-full border border-demo-ink/30 bg-demo px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-demo-ink">
      Demo · <span lang="ne">डेमो</span>
    </span>
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

const PUBLIC_NAV = [
  { href: '/', key: 'nav.home' },
  { href: '/services', key: 'nav.services' },
  { href: '/track', key: 'nav.track' },
  { href: '/stats', key: 'nav.map' },
] as const;

export function SiteHeader() {
  const { t, toggle } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const meQuery = useMe();
  const me = meQuery.data;
  const logout = useLogout();
  // Visitors get the public menu; a logged-in user gets only their portal's tabs (PORTAL_TABS).
  // While we don't know yet (first load), show no items rather than the wrong menu for a moment.
  const items = meQuery.isPending
    ? []
    : me
      ? PORTAL_TABS[me.role].map((tab) => ({ href: tab.href, key: tab.key, active: tab.matches(pathname) }))
      : PUBLIC_NAV.map((item) => ({ ...item, active: item.href === '/' ? pathname === '/' : pathname.startsWith(item.href) }));

  return (
    <header>
      {/* Thin crimson accent line, a nod to the national colours without using any official symbol. */}
      <div className="h-1 bg-accent" aria-hidden="true" />
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4">
        <Link href={me ? ROLE_HOME[me.role] : '/'} className="flex items-center gap-3 text-ink no-underline">
          <LogoMark />
          <span className="flex flex-col leading-tight">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-xl font-bold text-primary">
                Sewa Track <span className="font-semibold text-muted">· सेवा ट्र्याक</span>
              </span>
              <DemoPill />
            </span>
            <span className="text-sm text-muted">{t('site.tagline')}</span>
          </span>
        </Link>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={toggle} lang={t('nav.language') === 'English' ? 'en' : 'ne'}>
            {t('nav.language')}
          </Button>
          {me ? (
            <>
              <span className="hidden text-sm text-muted sm:inline">
                {t('login.loggedInAs')} <strong className="text-ink">{me.name}</strong> · {t(`role.${me.role}`)}
              </span>
              <Button variant="danger" loading={logout.isPending} onClick={() => logout.mutate(undefined, { onSuccess: () => router.push('/') })}>
                {t('login.logout')}
              </Button>
            </>
          ) : (
            <>
              <ButtonLink href="/register" variant="secondary">
                {t('nav.register')}
              </ButtonLink>
              <ButtonLink href="/login" variant="accent">
                {t('nav.login')}
              </ButtonLink>
            </>
          )}
        </div>
      </div>
      <nav aria-label={t('nav.menu')} className="bg-primary">
        <ul className="mx-auto flex min-h-12 max-w-6xl flex-wrap px-2">
          {items.map((item) => {
            const { active } = item;
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
  const me = useMe().data;
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
          {/* Staff get their own login page; the header's "Log in" is the citizen one. Visitors only. */}
          {!me && (
            <li>
              <Link className="text-white underline" href="/staff/login">
                {t('footer.staffLogin')}
              </Link>
            </li>
          )}
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
