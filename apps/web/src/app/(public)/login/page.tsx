'use client';

import { Suspense } from 'react';
import { LoginForm } from '@/components/auth/LoginForm';

/** Citizen login (PRD F3). Staff log in at /staff/login. */
// useSearchParams() (inside LoginForm) needs a Suspense boundary so the rest of the page can still be pre-rendered.
export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm portal="CITIZEN" />
    </Suspense>
  );
}
