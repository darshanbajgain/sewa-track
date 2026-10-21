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
  // Shown by /health so we can tell which build is running after a deploy.
  APP_VERSION: z.string().default('0.0.1'),
  GIT_COMMIT: z.string().default('local'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Print only the names of bad variables, never their values (they may be secrets).
  const badKeys = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
  console.error(`Invalid or missing environment variables: ${badKeys}`);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
