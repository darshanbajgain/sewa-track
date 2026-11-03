import { z } from 'zod';

/**
 * All environment variables the API needs, checked once at startup.
 *
 * Why: if a variable is missing or wrong (e.g. PORT="abc"), the app crashes immediately
 * with a clear message instead of failing later in some random request ("fail fast").
 * The rest of the code imports `env` and gets typed values, never raw `process.env` strings.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // z.coerce turns the string "4000" from the environment into the number 4000.
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.url(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  // Secret used to sign login tokens. Anyone who knows it can forge a login, so: long, random,
  // never committed. Generate one with: node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  // How long a login lasts (PRD F3: 8 hours).
  SESSION_HOURS: z.coerce.number().int().positive().max(24).default(8),
  // Serve Swagger UI at /api/docs and the OpenAPI spec at /api/v1/openapi.json.
  API_DOCS_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  // How many proxies sit in front of the API (the Next.js rewrite, the host's load balancer...).
  // Express then reads the real client IP from X-Forwarded-For, so rate limits count per user,
  // not per proxy. 0 = no proxy (local dev). Too HIGH a number lets clients fake their IP.
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
  // Shared with the web app, which sends it on every request it forwards. When set, the API refuses
  // requests without it, so the website is the only way in (middleware/proxySecret.ts). Unset = off.
  PROXY_SECRET: z.string().min(32, 'PROXY_SECRET must be at least 32 characters').optional(),
  // Shown by /health so we can tell which build is running after a deploy.
  APP_VERSION: z.string().default('0.1.0'),
  GIT_COMMIT: z.string().default('local'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Print only the names of bad variables, never their values (they may be secrets).
  const badKeys = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
  console.error(`Invalid or missing environment variables: ${badKeys}`);
  process.exit(1);
}

// The placeholder from .env.example passes the length check, so refuse it explicitly in production.
if (parsed.data.NODE_ENV === 'production' && parsed.data.JWT_SECRET.startsWith('change-me')) {
  console.error('JWT_SECRET is still the example placeholder. Set a real random secret.');
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
