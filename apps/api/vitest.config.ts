import { existsSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// Load the root .env (if present) using Node's built-in loader, so we don't need the dotenv package.
// In CI there is no .env file; the variables are set by the workflow instead.
const rootEnv = new URL('../../.env', import.meta.url);
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    env: {
      NODE_ENV: 'test',
      // Tests always use the separate test database, never the dev one.
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ??
        'postgres://sewa:sewa_dev_password@localhost:5432/sewa_track_test',
      LOG_LEVEL: 'silent',
    },
  },
});
