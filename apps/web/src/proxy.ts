import { NextResponse, type NextRequest } from 'next/server';

/**
 * Next.js 16 "proxy" (formerly middleware): runs on the server BEFORE a page renders or a rewrite runs.
 * Two jobs:
 *
 * 1. /api/* → add the shared PROXY_SECRET header before next.config.ts forwards the request to the API.
 *    The API refuses requests without it, so the website is the only way in and the API always knows how
 *    many proxies are in front of it (real client IP for the rate limits; docs/deployment.md §5).
 *    Server-only variable (no NEXT_PUBLIC_), so the secret never reaches the browser. Unset = no header.
 *
 * 2. Portal pages → an OPTIMISTIC check only: if there's no session cookie at all, send the visitor to the
 *    login page straight away instead of rendering a portal page that would immediately redirect. It does
 *    NOT verify the token (the web app doesn't hold the signing secret, by design). The API verifies every
 *    request; RequireRole handles wrong roles. Three layers: proxy (fast redirect) → RequireRole (UX) → API.
 */
const SESSION_COOKIE = 'sewa_session';
const PROXY_SECRET_HEADER = 'x-proxy-secret';

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/api/')) {
    const secret = process.env.PROXY_SECRET;
    if (!secret) return NextResponse.next();
    const headers = new Headers(request.headers);
    headers.set(PROXY_SECRET_HEADER, secret);
    return NextResponse.next({ request: { headers } });
  }

  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();

  const login = new URL('/login', request.url);
  login.searchParams.set('next', request.nextUrl.pathname);
  login.searchParams.set('reason', 'required');
  return NextResponse.redirect(login);
}

// The API forward and the logged-in portals. Public pages never pass through here.
export const config = {
  matcher: ['/api/:path*', '/citizen/:path*', '/ward/:path*', '/palika/:path*', '/admin/:path*'],
};
