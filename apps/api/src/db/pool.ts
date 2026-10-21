import pg from 'pg';
import { env } from '../config/env.js';
import { logger } from '../logger.js';

/**
 * A connection pool: a small set of open connections to Postgres that requests share.
 *
 * Why a pool: opening a new DB connection for every HTTP request is slow (TCP + auth
 * handshake each time). The pool keeps up to `max` connections open and lends one
 * to each query, then takes it back.
 */
export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 10, // max open connections; enough for a demo, and Postgres' default limit is 100
  idleTimeoutMillis: 30_000, // close a connection that has been unused for 30 s
  connectionTimeoutMillis: 5_000, // give up if no connection is available within 5 s
});

// An idle connection can break (e.g. the DB restarts). Log it instead of crashing the process.
pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected error on idle Postgres connection');
});

/** Close every connection. Called on shutdown and after tests. */
export async function closePool(): Promise<void> {
  await pool.end();
}
