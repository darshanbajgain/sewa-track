'use client';

import type { LoginPortal } from '@sewa/shared';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { ApiError } from '@/api/client';
import { Alert, Button, Card, PageTitle, TextField } from '@/components/common';
import { DEMO_ACCOUNTS, DEMO_PASSWORD, useLogin } from '@/hooks/useAuth';
import { useI18n } from '@/lib/i18n';
import { LOGIN_PATH, ROLE_HOME, safeNextPath } from '@/lib/routing';

/**
 * Login (PRD F3), used by two pages: /login (citizens, with sign-up) and /staff/login (ward officers,
 * palika admins, system admin; no sign-up, staff accounts are created by the system admin).
 * The form sends `portal`, and the API refuses an account on the wrong page (403, details.portal);
 * the error then links to the right page.
 *
 * "Demo mode" is a separate, collapsed panel listing this page's fake accounts. Choosing one only FILLS
 * the form, so even the demo goes through the real login flow.
 *
 * `?next=/some/page` brings the user back where they were (only to OUR pages: safeNextPath blocks
 * open redirects). `?reason=expired|required` explains why they're here.
 */
export function LoginForm({ portal }: { portal: LoginPortal }) {
  const { t } = useI18n();
  const params = useSearchParams();
  const login = useLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [demoOpen, setDemoOpen] = useState(false);
  const reason = params.get('reason');
  const isStaff = portal === 'STAFF';
  const demoAccounts = DEMO_ACCOUNTS.filter((a) => a.portal === portal);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    login.mutate(
      { email: email.trim(), password, portal },
      {
        // A FULL page load, not router.push: while logged out, Next.js may have pre-fetched and cached the
        // target page as "redirect to login" (that's what proxy.ts answers without a session). A fresh load
        // also resets all client state for the new user.
        onSuccess: (user) => window.location.assign(safeNextPath(params.get('next'), ROLE_HOME[user.role])),
      },
    );
  }

  function fillDemo(demoEmail: string) {
    setEmail(demoEmail);
    setPassword(DEMO_PASSWORD);
    document.getElementById('login-email')?.focus(); // move focus back to the form for keyboard users
  }

  // Right password, wrong page: the API names the right portal.
  const otherPortal = login.error instanceof ApiError && login.error.code === 'FORBIDDEN' ? login.error.details?.portal : undefined;
  const error =
    otherPortal === 'STAFF' || otherPortal === 'CITIZEN'
      ? null // shown below with a link
      : login.error instanceof ApiError
        ? login.error.code === 'RATE_LIMITED'
          ? t('login.tooMany')
          : login.error.code === 'FORBIDDEN'
            ? t('login.deactivated')
            : login.error.code === 'UNAUTHENTICATED' || login.error.code === 'VALIDATION_ERROR'
              ? t('login.wrong')
              : t('common.error')
        : login.error
          ? t('common.error')
          : null;

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-10">
      <PageTitle title={t(isStaff ? 'staffLogin.title' : 'login.title')} intro={isStaff ? t('staffLogin.intro') : undefined} />
      {reason === 'expired' && <Alert tone="warning">{t('login.expired')}</Alert>}
      {reason === 'required' && <Alert tone="info">{t('login.required')}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}
      {(otherPortal === 'STAFF' || otherPortal === 'CITIZEN') && (
        <Alert tone="warning">
          {t(otherPortal === 'STAFF' ? 'login.wrongPortalStaff' : 'login.wrongPortalCitizen')}{' '}
          <Link href={LOGIN_PATH[otherPortal]} className="font-semibold text-primary">
            {t(otherPortal === 'STAFF' ? 'login.staffLinkAction' : 'staffLogin.citizenLinkAction')}
          </Link>
        </Alert>
      )}

      <Card as="section" aria-label={t(isStaff ? 'staffLogin.title' : 'login.title')}>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <TextField
            id="login-email"
            label={t('login.email')}
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            required
          />
          <TextField
            label={t('login.password')}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <Button type="submit" size="lg" loading={login.isPending}>
            {t('login.submit')}
          </Button>
          {isStaff ? (
            <p className="text-sm">
              {t('staffLogin.citizenLink')}{' '}
              <Link href={LOGIN_PATH.CITIZEN} className="font-semibold text-primary">
                {t('staffLogin.citizenLinkAction')}
              </Link>
            </p>
          ) : (
            <>
              <p className="text-sm">
                {t('login.noAccount')}{' '}
                <Link href="/register" className="font-semibold text-primary">
                  {t('register.link')}
                </Link>
              </p>
              <p className="text-sm">
                {t('login.staffLink')}{' '}
                <Link href={LOGIN_PATH.STAFF} className="font-semibold text-primary">
                  {t('login.staffLinkAction')}
                </Link>
              </p>
            </>
          )}
        </form>
      </Card>

      <Card as="section" aria-labelledby="demo-title" className="flex flex-col gap-3 border-dashed bg-demo/40">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="demo-title" className="text-lg font-bold">
            {t('login.demoTitle')}
          </h2>
          <Button variant="secondary" aria-expanded={demoOpen} aria-controls="demo-accounts" onClick={() => setDemoOpen((o) => !o)}>
            {t(demoOpen ? 'login.demoHide' : 'login.demoShow')}
          </Button>
        </div>
        <p className="text-sm text-muted">{t('login.demoIntro')}</p>
        {demoOpen && (
          <ul id="demo-accounts" className="flex flex-col gap-2">
            {demoAccounts.map((account) => (
              <li key={account.email} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-white p-3 text-sm">
                <span className="flex flex-col">
                  <strong>{t(account.labelKey)}</strong>
                  <span className="font-mono text-muted">
                    {account.email} · {DEMO_PASSWORD}
                  </span>
                </span>
                <Button variant="ghost" onClick={() => fillDemo(account.email)}>
                  {t('login.demoUse')}
                  <span className="sr-only"> {t(account.labelKey)}</span>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
