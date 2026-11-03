'use client';

import { DEMO_EMAIL_DOMAIN, registerSchema } from '@sewa/shared';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { ApiError } from '@/api/client';
import { Alert, Button, Card, PageTitle, TextField } from '@/components/common';
import { useRegister } from '@/hooks/useAuth';
import { useI18n } from '@/lib/i18n';
import { ROLE_HOME } from '@/lib/routing';

type Field = 'name' | 'email' | 'password' | 'confirm';

/**
 * Citizen sign-up (PRD F3). Always creates a CITIZEN: the role isn't even sent (the API ignores it
 * anyway). Staff accounts are created by the system admin.
 *
 * Validation runs twice with the SAME Zod schema (packages/shared): here for instant messages, and on
 * the API, which is the one that counts. Demo rule: only @example.com addresses (no real emails stored).
 */
export default function RegisterPage() {
  const { t } = useI18n();
  const register = useRegister();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});

  const set = (field: Field) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [field]: e.target.value }));

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = registerSchema.safeParse(form);
    const next: Partial<Record<Field, string>> = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) next[issue.path[0] as Field] ??= t(`register.err.${issue.path[0] as 'name' | 'email' | 'password'}`);
    }
    if (form.password !== form.confirm) next.confirm = t('register.err.confirm');
    setErrors(next);
    if (!parsed.success || next.confirm) return;

    register.mutate(parsed.data, {
      onSuccess: (user) => window.location.assign(ROLE_HOME[user.role]), // full load, same reason as login
      onError: (err) => {
        if (err instanceof ApiError && err.code === 'CONFLICT') setErrors({ email: t('register.err.taken') });
      },
    });
  }

  const apiError =
    register.error instanceof ApiError && register.error.code !== 'CONFLICT'
      ? register.error.code === 'RATE_LIMITED'
        ? t('login.tooMany')
        : t('common.error')
      : register.error && !(register.error instanceof ApiError)
        ? t('common.error')
        : null;

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-10">
      <PageTitle title={t('register.title')} intro={t('register.intro')} />
      <Alert tone="info">{t('register.demoNote').replace('{domain}', DEMO_EMAIL_DOMAIN)}</Alert>
      {apiError && <Alert tone="error">{apiError}</Alert>}

      <Card as="section" aria-label={t('register.title')}>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <TextField label={t('register.name')} autoComplete="name" value={form.name} onChange={set('name')} error={errors.name} required maxLength={100} />
          <TextField
            label={t('login.email')}
            type="email"
            autoComplete="email"
            placeholder={`yourname@${DEMO_EMAIL_DOMAIN}`}
            hint={t('register.emailHint').replace('{domain}', DEMO_EMAIL_DOMAIN)}
            value={form.email}
            onChange={set('email')}
            error={errors.email}
            required
          />
          <TextField
            label={t('login.password')}
            type="password"
            autoComplete="new-password"
            hint={t('register.passwordHint')}
            value={form.password}
            onChange={set('password')}
            error={errors.password}
            required
          />
          <TextField label={t('register.confirm')} type="password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} error={errors.confirm} required />
          <Button type="submit" size="lg" loading={register.isPending}>
            {t('register.submit')}
          </Button>
          <p className="text-sm">
            {t('register.haveAccount')}{' '}
            <Link href="/login" className="font-semibold text-primary">
              {t('login.submit')}
            </Link>
          </p>
        </form>
      </Card>
    </div>
  );
}
