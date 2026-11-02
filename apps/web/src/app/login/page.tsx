'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { ApiError } from '@/api/client';
import { Alert, Button, Card, PageTitle, TextField } from '@/components/common';
import { DEMO_ACCOUNTS, DEMO_PASSWORD, useLogin } from '@/hooks/useAuth';
import { useI18n } from '@/lib/i18n';
import { ROLE_HOME, safeNextPath } from '@/lib/routing';

/**
 * Login (PRD F3): email + password for every role. Citizens can sign up at /register; staff accounts
 * are created by the system admin.
 *
 * "Demo mode" is a separate, collapsed panel listing one fake account per role. Choosing one only FILLS
 * the form, so even the demo goes through the real login flow.
 *
 * `?next=/some/page` brings the user back where they were (only to OUR pages: safeNextPath blocks
 * open redirects). `?reason=expired|required` explains why they're here.
 */
function LoginForm() {
  const { t } = useI18n();
  const params = useSearchParams();
  const login = useLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [demoOpen, setDemoOpen] = useState(false);
  const reason = params.get('reason');

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    login.mutate(
      { email: email.trim(), password },
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

  const error =
    login.error instanceof ApiError
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
      <PageTitle title={t('login.title')} />
      {reason === 'expired' && <Alert tone="warning">{t('login.expired')}</Alert>}
      {reason === 'required' && <Alert tone="info">{t('login.required')}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}

      <Card as="section" aria-label={t('login.title')}>
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
          <p className="text-sm">
            {t('login.noAccount')}{' '}
            <Link href="/register" className="font-semibold text-primary">
              {t('register.link')}
            </Link>
          </p>
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
            {DEMO_ACCOUNTS.map((account) => (
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

// useSearchParams() needs a Suspense boundary so the rest of the page can still be pre-rendered.
export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
