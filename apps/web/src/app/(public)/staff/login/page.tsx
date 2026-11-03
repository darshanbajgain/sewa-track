'use client';

import { Suspense } from 'react';
import { LoginForm } from '@/components/auth/LoginForm';

/** Staff login (PRD F3): ward officers, palika admins, system admin. No sign-up; the system admin creates staff. */
// useSearchParams() (inside LoginForm) needs a Suspense boundary so the rest of the page can still be pre-rendered.
export default function StaffLoginPage() {
  return (
    <Suspense>
      <LoginForm portal="STAFF" />
    </Suspense>
  );
}
