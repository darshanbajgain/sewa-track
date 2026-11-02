'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { pingLive } from '@/api/system.api';
import { Spinner } from '@/components/common';
import { useI18n } from '@/lib/i18n';

/** Longer than a normal answer, shorter than a cold start: after this we tell the user what's going on. */
const SLOW_MS = 3_000;
/** A cold start takes about a minute; after 2 minutes it's a real outage, not sleep. */
const GIVE_UP_MS = 120_000;
const RETRY_EVERY_MS = 2_000;

/**
 * Ping until the API answers. One ping isn't enough: a proxy in between (our own Next.js rewrite cuts
 * requests at 30 s) can fail the request while the API is still starting, so we simply ask again.
 */
async function waitUntilLive(signal: AbortSignal, startedAt: number): Promise<boolean> {
  while (!signal.aborted) {
    try {
      await pingLive(signal);
      return true;
    } catch {
      if (Date.now() - startedAt > GIVE_UP_MS) return false;
      await new Promise((resolve) => setTimeout(resolve, RETRY_EVERY_MS));
    }
  }
  return false;
}

/**
 * The demo API runs on a free host that sleeps after 15 minutes without requests, and a cold start
 * takes about a minute. On the first page load:
 *   1. ping /live at once (and again until it answers), so the API starts waking while the user reads
 *   2. if it takes longer than 3 s, show "waking up" instead of letting the page look broken
 *   3. once it answers after a slow start, re-run the queries that failed while it was asleep
 * Lives in the root layout, so it runs once per full page load, not on every navigation.
 */
export function ServerWakeNotice() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [waking, setWaking] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const startedAt = Date.now();
    const slowTimer = setTimeout(() => setWaking(true), SLOW_MS);

    void waitUntilLive(controller.signal, startedAt).then((live) => {
      clearTimeout(slowTimer);
      if (controller.signal.aborted) return;
      setWaking(false);
      // Queries that ran while the API was asleep timed out; fetch them again now that it's up.
      // (Not live after 2 minutes = a real outage: the pages already show their own error and "Try again".)
      if (live && Date.now() - startedAt > SLOW_MS) {
        void queryClient.refetchQueries({ type: 'active', predicate: (query) => query.state.status === 'error' });
      }
    });

    return () => {
      clearTimeout(slowTimer);
      controller.abort();
    };
  }, [queryClient]);

  if (!waking) return null;

  return (
    <div role="status" className="flex items-center justify-center gap-3 bg-primary-soft px-4 py-3 text-center text-sm text-primary">
      <Spinner />
      <p>
        <strong>{t('wake.title')}</strong> {t('wake.body')}
      </p>
    </div>
  );
}
