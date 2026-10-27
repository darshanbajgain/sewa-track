import type { NextConfig } from 'next';

/**
 * The browser only ever talks to THIS web app's origin. Requests to /api/* are forwarded ("rewritten")
 * by Next.js to the Express API. Why (docs/architecture.md §3): the login cookie is SameSite=Lax, so if
 * the web and the API were two different sites, the browser wouldn't send it. Same origin = the cookie
 * just works, and no CORS setup is needed.
 */
const API_ORIGIN = process.env.API_ORIGIN ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false, // don't advertise "X-Powered-By: Next.js"
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_ORIGIN}/api/:path*` }];
  },
};

export default nextConfig;
