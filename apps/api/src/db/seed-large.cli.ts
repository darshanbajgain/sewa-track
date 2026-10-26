import pg from 'pg';
import { env } from '../config/env.js';
import { seedLarge } from './seed-large.js';

/**
 * `pnpm seed:large [count]`: replaces ALL requests in DATABASE_URL with `count` fake ones (default 100,000).
 * Development only: refuses to run in production.
 */
if (env.NODE_ENV === 'production') {
  console.error('seed:large is for development databases only.');
  process.exit(1);
}

const count = Number(process.argv[2] ?? 100_000);
if (!Number.isInteger(count) || count <= 0) {
  console.error('Usage: pnpm seed:large [count]');
  process.exit(1);
}

const client = new pg.Client({ connectionString: env.DATABASE_URL });
await client.connect();
try {
  const started = Date.now();
  const result = await seedLarge(client, count);
  console.log(`Seeded ${result.requests} requests and ${result.events} audit events in ${((Date.now() - started) / 1000).toFixed(1)} s`);
} finally {
  await client.end();
}
