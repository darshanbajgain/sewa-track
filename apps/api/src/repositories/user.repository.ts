import type { AdminUserDto, Role, UserListQuery } from '@sewa/shared';
import { USER_PAGE_SIZE } from '@sewa/shared';
import { pool } from '../db/pool.js';

/** A user row as the app uses it. Column names are mapped to camelCase in SQL with AS "...". */
export interface UserRecord {
  id: string;
  role: Role;
  name: string;
  email: string;
  wardId: number | null;
  localLevelId: number | null;
  isActive: boolean;
  createdAt: Date;
}

/** Same, plus the password hash. Only the login flow ever asks for this. */
export interface UserWithPassword extends UserRecord {
  passwordHash: string;
}

const USER_COLUMNS = `id, role, name, email, ward_id AS "wardId", local_level_id AS "localLevelId", is_active AS "isActive", created_at AS "createdAt"`;

export async function findUserByEmail(email: string): Promise<UserWithPassword | null> {
  const { rows } = await pool.query<UserWithPassword>(
    `SELECT ${USER_COLUMNS}, password_hash AS "passwordHash"
     FROM users
     WHERE email = $1`, // $1 = parameter: the email is sent separately, never pasted into the SQL
    [email],
  );
  return rows[0] ?? null;
}

export async function findUserById(id: string): Promise<UserRecord | null> {
  const { rows } = await pool.query<UserRecord>(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

/** Used by requireAuth on every request: one primary-key lookup, so it's very cheap. */
export async function isUserActive(id: string): Promise<boolean> {
  const { rows } = await pool.query<{ isActive: boolean }>(`SELECT is_active AS "isActive" FROM users WHERE id = $1`, [id]);
  return rows[0]?.isActive ?? false; // deleted user = not active
}

export interface NewUser {
  role: Role;
  name: string;
  email: string;
  passwordHash: string;
  wardId: number | null;
  localLevelId: number | null;
  createdBy: string | null;
}

/**
 * Inserts a user. Returns null if the email is already taken: `ON CONFLICT DO NOTHING` lets the
 * database's UNIQUE constraint decide, so two sign-ups with the same email at the same moment can't
 * both succeed (a "SELECT first, then INSERT" check would have that race).
 */
export async function insertUser(u: NewUser): Promise<UserRecord | null> {
  const { rows } = await pool.query<UserRecord>(
    `INSERT INTO users (role, name, email, password_hash, ward_id, local_level_id, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (email) DO NOTHING
     RETURNING ${USER_COLUMNS}`,
    [u.role, u.name, u.email, u.passwordHash, u.wardId, u.localLevelId, u.createdBy],
  );
  return rows[0] ?? null;
}

export async function setUserActive(id: string, isActive: boolean): Promise<UserRecord | null> {
  const { rows } = await pool.query<UserRecord>(`UPDATE users SET is_active = $2 WHERE id = $1 RETURNING ${USER_COLUMNS}`, [id, isActive]);
  return rows[0] ?? null;
}

/**
 * The admin's user list, newest first. Optional filters use the same `($n IS NULL OR …)` pattern as the
 * staff queue; `count(*) OVER ()` returns the total of all pages in the same query.
 * A ward officer's palika comes through their ward (LEFT JOINs: citizens have neither).
 */
export async function listUsers(query: UserListQuery): Promise<{ items: AdminUserDto[]; total: number }> {
  const search = query.q ? `%${query.q.toLowerCase()}%` : null; // the % wildcards are in the VALUE, not the SQL
  const { rows } = await pool.query<AdminUserDto & { total: number }>(
    `SELECT u.id, u.role, u.name, u.email, u.is_active AS "isActive",
            u.ward_id AS "wardId", w.number AS "wardNumber",
            COALESCE(u.local_level_id, w.local_level_id) AS "localLevelId",
            ll.name_en AS "palikaNameEn",
            u.created_at AS "createdAt",
            count(*) OVER ()::int AS total
     FROM users u
     LEFT JOIN wards w ON w.id = u.ward_id
     LEFT JOIN local_levels ll ON ll.id = COALESCE(u.local_level_id, w.local_level_id)
     WHERE ($1::text IS NULL OR u.role = $1)
       AND ($2::text IS NULL OR lower(u.name) LIKE $2 OR u.email LIKE $2)
     ORDER BY u.created_at DESC, u.id
     LIMIT $3 OFFSET $4`,
    [query.role ?? null, search, USER_PAGE_SIZE, (query.page - 1) * USER_PAGE_SIZE],
  );
  const total = rows[0]?.total ?? 0;
  return { items: rows.map(({ total: _t, ...u }) => ({ ...u, createdAt: new Date(u.createdAt).toISOString() })), total };
}

/** Does this ward / palika exist? (to give a clear 400 instead of a foreign-key error) */
export async function wardExists(wardId: number): Promise<boolean> {
  const { rowCount } = await pool.query(`SELECT 1 FROM wards WHERE id = $1`, [wardId]);
  return rowCount === 1;
}
export async function localLevelExists(localLevelId: number): Promise<boolean> {
  const { rowCount } = await pool.query(`SELECT 1 FROM local_levels WHERE id = $1`, [localLevelId]);
  return rowCount === 1;
}
