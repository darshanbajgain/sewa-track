import type { Role } from '@sewa/shared';
import { pool } from '../db/pool.js';

/** A user row as the app uses it. Column names are mapped to camelCase in SQL with AS "...". */
export interface UserRecord {
  id: string;
  role: Role;
  name: string;
  wardId: number | null;
  localLevelId: number | null;
}

/** Same, plus the password hash. Only the login flow ever asks for this. */
export interface UserWithPassword extends UserRecord {
  passwordHash: string;
}

export async function findUserByPhone(phone: string): Promise<UserWithPassword | null> {
  const { rows } = await pool.query<UserWithPassword>(
    `SELECT id, role, name, ward_id AS "wardId", local_level_id AS "localLevelId", password_hash AS "passwordHash"
     FROM users
     WHERE phone = $1`, // $1 = parameter: the phone is sent separately, never pasted into the SQL
    [phone],
  );
  return rows[0] ?? null;
}

export async function findUserById(id: string): Promise<UserRecord | null> {
  const { rows } = await pool.query<UserRecord>(
    `SELECT id, role, name, ward_id AS "wardId", local_level_id AS "localLevelId"
     FROM users
     WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}
