'use client';

import { useEffect } from 'react';

export const SITE_TITLE = 'Sewa Track (demo)';

/**
 * Sets the browser tab title to "<page> · Sewa Track (demo)" (or just the site name for the home page).
 * Client-side because most pages are client components and the text depends on the chosen language;
 * the root layout's metadata gives the server-rendered default. PageTitle calls this, so a page with a
 * normal heading gets its tab title for free.
 */
export function usePageTitle(title: string | undefined) {
  useEffect(() => {
    document.title = title ? `${title} · ${SITE_TITLE}` : SITE_TITLE;
  }, [title]);
}
