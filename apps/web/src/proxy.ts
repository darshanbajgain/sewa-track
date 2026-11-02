import { NextResponse, type NextRequest } from 'next/server';

/**
 * Next.js 16 "proxy" (formerly middleware): runs on the server BEFORE a page renders.
 *
 * An OPTIMISTIC check only: if there's no session cookie at all, send the visitor to the login page
 * straight away instead of rendering a portal page that would immediately redirect. It does NOT verify
 * the token (the web app doesn't hold the signing secret, by design). The API verifies every request;
 * RequireRole handles wrong roles. Three layers: proxy (fast redirect) → RequireRole (UX) → API (security).
 */
const SESSION_COOKIE = 'sewa_session';

export function proxy(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();

  const login = new URL('/login', request.url);
  login.searchParams.set('next', request.nextUrl.pathname);
  login.searchParams.set('reason', 'required');
  return NextResponse.redirect(login);
}

// Only the logged-in portals. Public pages never pass through here.
export const config = {
  matcher: ['/citizen/:path*', '/ward/:path*', '/palika/:path*', '/admin/:path*'],
};
