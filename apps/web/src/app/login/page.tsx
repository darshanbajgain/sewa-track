'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { ApiError } from '@/api/client';
import { Alert, Button, Card, PageTitle, TextField } from '@/components/common';
import { DEMO_ACCOUNTS, DEMO_PASSWORD, useLogin } from '@/hooks/useAuth';
import { useI18n } from '@/lib/i18n';
import { ROLE_HOME, safeNextPath } from '@/lib/routing';

/**
 * Login (PRD F3): one-click demo accounts, plus a normal phone + password form.
 * No sign-up page on purpose: a real sign-up would collect real phone numbers (hard rule #3).
 *
 * `?next=/some/page` brings the user back where they were (only to OUR pages: safeNextPath blocks
 * open redirects). `?reason=expired|required` explains why they're here.
 */
function LoginForm() {
  const { t } = useI18n();
  const params = useSearchParams();
  const login = useLogin();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const reason = params.get('reason');

  function logIn(credentials: { phone: string; password: string }) {
    login.mutate(credentials, {
      // A FULL page load, not router.push: while logged out, Next.js may have pre-fetched and cached the
      // target page as "redirect to login" (that's what proxy.ts answers without a session). A fresh load
      // also resets all client state for the new user.
      onSuccess: (user) => window.location.assign(safeNextPath(params.get('next'), ROLE_HOME[user.role])),
    });
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    logIn({ phone: phone.trim(), password });
  }

  const error =
    login.error instanceof ApiError
      ? login.error.code === 'RATE_LIMITED'
        ? t('login.tooMany')
        : login.error.code === 'UNAUTHENTICATED' || login.error.code === 'VALIDATION_ERROR'
          ? t('login.wrong')
          : t('common.error')
      : login.error
        ? t('common.error')
        : null;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-10">
      <PageTitle title={t('login.title')} />
      {reason === 'expired' && <Alert tone="warning">{t('login.expired')}</Alert>}
      {reason === 'required' && <Alert tone="info">{t('login.required')}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}

      <div className="grid gap-6 md:grid-cols-2">
        <Card as="section" aria-labelledby="demo-title" className="flex flex-col gap-3">
          <h2 id="demo-title" className="text-xl font-bold text-primary">
            {t('login.demoTitle')}
          </h2>
          <p className="text-sm text-muted">{t('login.demoIntro')}</p>
          {DEMO_ACCOUNTS.map((account, i) => (
            <Button
              key={account.phone}
              variant={i === 0 ? 'primary' : 'secondary'}
              size="lg"
              disabled={login.isPending}
              onClick={() => logIn({ phone: account.phone, password: DEMO_PASSWORD })}
            >
              <span>{t(account.labelKey)}</span>
              <span aria-hidden="true">→</span>
            </Button>
          ))}
        </Card>

        <Card as="section" aria-labelledby="form-title">
          <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
            <h2 id="form-title" className="text-xl font-bold text-primary">
              {t('login.formTitle')}
            </h2>
            <TextField
              label={t('login.phone')}
              inputMode="numeric"
              autoComplete="username"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="9000000002"
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
          </form>
        </Card>
      </div>
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
