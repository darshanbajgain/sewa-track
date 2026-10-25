import type pg from 'pg';
import { pool } from './pool.js';

/**
 * Runs `work` inside ONE database transaction:
 *   BEGIN → work(client) → COMMIT        if everything succeeds
 *   BEGIN → work(client) → ROLLBACK      if anything throws (nothing is saved)
 *
 * Why a dedicated client: a transaction lives on ONE connection. The pool has many connections, so
 * we borrow one (`pool.connect()`), run every query of the transaction on it, and give it back
 * in `finally` (`release()`), even after an error. Forgetting to release would slowly use up the pool.
 *
 * Repositories that take part in a transaction accept this `client` as their first argument.
 */
export type DbClient = pg.PoolClient;

export async function withTransaction<T>(work: (client: DbClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err; // let the caller (and finally the error handler) deal with it
  } finally {
    client.release();
  }
}
