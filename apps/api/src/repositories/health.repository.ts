import { pool } from '../db/pool.js';

/**
 * Repository = the only layer that talks to the database.
 * Here: the smallest possible query, just to prove Postgres answers.
 */
export async function pingDatabase(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
