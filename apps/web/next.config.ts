import type { NextConfig } from 'next';

/**
 * The browser only ever talks to THIS web app's origin. Requests to /api/* are forwarded ("rewritten")
 * by Next.js to the Express API. Why (docs/architecture.md §3): the login cookie is SameSite=Lax, so if
 * the web and the API were two different sites, the browser wouldn't send it. Same origin = the cookie
 * just works, and no CORS setup is needed.
 */
const API_ORIGIN = process.env.API_ORIGIN ?? 'http://localhost:4000';

// Vercel sets VERCEL=1 during its builds. Without API_ORIGIN there, the build used to succeed with the
// localhost fallback baked in, and every /api call on the live site failed with 502. Fail the build instead.
if (process.env.VERCEL && !process.env.API_ORIGIN) {
  throw new Error(
    'API_ORIGIN is not set. Add it in Vercel (Settings → Environment Variables), e.g. https://your-api.example.com, then redeploy.',
  );
}

/**
 * Security headers on every page:
 *  - X-Frame-Options DENY + frame-ancestors 'none': nobody can embed our pages in an <iframe>
 *    (stops "clickjacking": tricking users into clicking hidden buttons)
 *  - X-Content-Type-Options nosniff: the browser must trust our Content-Type, not guess
 *  - Referrer-Policy: don't leak full URLs (they can contain ids) to other sites
 *  - Permissions-Policy: this site never needs camera, microphone or location
 * A full Content-Security-Policy for Next.js needs per-request nonces; documented in docs/frontend.md §8.
 *
 * Pages only, NOT /api/*: the API sets its own security headers (helmet), and some responses need a
 * stricter one. A document download sends "Content-Security-Policy: sandbox" (PRD F15); on Vercel our
 * page header used to REPLACE it on the forwarded response.
 */
const SECURITY_HEADERS = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false, // don't advertise "X-Powered-By: Next.js"
  // Docker build only (apps/web/Dockerfile sets it): a self-contained server.js with just the files it
  // needs, so the image doesn't carry the whole node_modules. Local `next start` stays as it is.
  output: process.env.BUILD_STANDALONE === 'true' ? 'standalone' : undefined,
  async headers() {
    return [{ source: '/((?!api/).*)', headers: SECURITY_HEADERS }]; // every path except /api/…
  },
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_ORIGIN}/api/:path*` }];
  },
};

export default nextConfig;
