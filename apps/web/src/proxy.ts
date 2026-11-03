import { NextResponse, type NextRequest } from 'next/server';
import { loginPathFor } from '@/lib/routing';

/**
 * Next.js 16 "proxy" (formerly middleware): runs on the server BEFORE a page renders or a rewrite runs.
 * Two jobs:
 *
 * 1. /api/* → add the shared PROXY_SECRET header, and the visitor's IP, before next.config.ts forwards the
 *    request to the API. The API refuses requests without the secret, and believes the IP only together
 *    with it (rate limits per visitor; docs/deployment.md §5).
 *    Server-only variable (no NEXT_PUBLIC_), so the secret never reaches the browser. Unset = no headers.
 *
 * 2. Portal pages → an OPTIMISTIC check only: if there's no session cookie at all, send the visitor to the
 *    login page straight away instead of rendering a portal page that would immediately redirect. It does
 *    NOT verify the token (the web app doesn't hold the signing secret, by design). The API verifies every
 *    request; RequireRole handles wrong roles. Three layers: proxy (fast redirect) → RequireRole (UX) → API.
 */
const SESSION_COOKIE = 'sewa_session';
const PROXY_SECRET_HEADER = 'x-proxy-secret';
const CLIENT_IP_HEADER = 'x-client-ip';

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/api/')) {
    const secret = process.env.PROXY_SECRET;
    if (!secret) return NextResponse.next();
    const headers = new Headers(request.headers);
    headers.set(PROXY_SECRET_HEADER, secret);
    // The visitor's IP for the API's rate limits (it doesn't reach the API host any other way).
    // x-real-ip is set by the web host's edge (Vercel replaces any value the visitor sent).
    // Never pass on an X-Client-IP the visitor sent themselves.
    const clientIp = request.headers.get('x-real-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    if (clientIp) headers.set(CLIENT_IP_HEADER, clientIp);
    else headers.delete(CLIENT_IP_HEADER);
    return NextResponse.next({ request: { headers } });
  }

  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();

  const login = new URL(loginPathFor(request.nextUrl.pathname), request.url); // staff portals → /staff/login
  login.searchParams.set('next', request.nextUrl.pathname);
  login.searchParams.set('reason', 'required');
  return NextResponse.redirect(login);
}

// The API forward and the logged-in portals. Public pages never pass through here.
export const config = {
  matcher: ['/api/:path*', '/citizen/:path*', '/ward/:path*', '/palika/:path*', '/admin/:path*'],
};
