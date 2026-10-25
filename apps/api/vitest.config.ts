import { existsSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// Load the root .env (if present) using Node's built-in loader, so we don't need the dotenv package.
// In CI there is no .env file; the variables are set by the workflow instead.
const rootEnv = new URL('../../.env', import.meta.url);
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

// Tests always use the separate test database, never the dev one.
process.env.TEST_DATABASE_URL ??= 'postgres://sewa:sewa_dev_password@localhost:5432/sewa_track_test';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    // Runs once before all tests: applies migrations to the test database.
    globalSetup: ['./test/globalSetup.ts'],
    // Test files share one database, so run them one at a time to avoid tests changing
    // each other's data. (Fine for this project's size; keeps tests simple and reliable.)
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env.TEST_DATABASE_URL,
      LOG_LEVEL: 'silent',
      // Test-only signing secret (not used anywhere else).
      JWT_SECRET: 'test-only-secret-0123456789-abcdefghijklmnop',
    },
  },
});
