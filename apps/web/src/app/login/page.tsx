'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Card, PageTitle } from '@/components/ui';
import { ApiError } from '@/api/client';
import { DEMO_ACCOUNTS, DEMO_PASSWORD, useLogin } from '@/hooks/useAuth';
import { useI18n } from '@/lib/i18n';

/**
 * Login (PRD F3): one-click demo accounts, plus a normal phone + password form.
 * No sign-up page on purpose: a real sign-up would collect real phone numbers (hard rule #3).
 */
export default function LoginPage() {
  const { t } = useI18n();
  const router = useRouter();
  const login = useLogin();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');

  function logIn(credentials: { phone: string; password: string }) {
    login.mutate(credentials, { onSuccess: () => router.push('/') });
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
      {error && (
        <p role="alert" className="rounded-md bg-accent-soft p-4 text-accent">
          {error}
        </p>
      )}
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="flex flex-col gap-3">
          <h2 className="text-xl font-bold text-primary">{t('login.demoTitle')}</h2>
          <p className="text-sm text-muted">{t('login.demoIntro')}</p>
          {DEMO_ACCOUNTS.map((account, i) => (
            <button
              key={account.phone}
              type="button"
              disabled={login.isPending}
              onClick={() => logIn({ phone: account.phone, password: DEMO_PASSWORD })}
              className={`flex min-h-12 items-center justify-between rounded-md px-4 text-left font-semibold disabled:opacity-60 ${
                i === 0 ? 'bg-primary text-white hover:bg-primary-dark' : 'border border-primary text-primary hover:bg-primary-soft'
              }`}
            >
              <span>{t(account.labelKey)}</span>
              <span aria-hidden="true">→</span>
            </button>
          ))}
        </Card>

        <Card>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <h2 className="text-xl font-bold text-primary">{t('login.formTitle')}</h2>
            <div className="flex flex-col gap-1">
              <label htmlFor="phone" className="text-sm font-semibold">
                {t('login.phone')}
              </label>
              <input
                id="phone"
                inputMode="numeric"
                autoComplete="username"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="9000000002"
                className="min-h-12 rounded-md border border-muted px-3"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="password" className="text-sm font-semibold">
                {t('login.password')}
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="min-h-12 rounded-md border border-muted px-3"
              />
            </div>
            <button
              type="submit"
              disabled={login.isPending}
              className="min-h-12 rounded-md bg-primary font-semibold text-white hover:bg-primary-dark disabled:opacity-60"
            >
              {t('login.submit')}
            </button>
          </form>
        </Card>
      </div>
    </div>
  );
}
