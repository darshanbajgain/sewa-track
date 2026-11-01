import type { AdminUserDto, CreateStaffInput, UserListQuery, UserPageDto } from '@sewa/shared';
import { USER_PAGE_SIZE } from '@sewa/shared';
import { AppError } from '../errors.js';
import { findUserById, insertUser, listUsers, localLevelExists, setUserActive, wardExists, type UserRecord } from '../repositories/user.repository.js';
import { hashPassword } from '../security/password.js';
import type { SessionUser } from '../security/token.js';

/**
 * User management for the SYSTEM ADMIN (PRD F14). The route already requires the SYSTEM_ADMIN role;
 * this file holds the rules about WHICH accounts may be created or changed.
 */

export async function listAllUsers(query: UserListQuery): Promise<UserPageDto> {
  const { items, total } = await listUsers(query);
  return { items, page: query.page, pageSize: USER_PAGE_SIZE, total };
}

/**
 * Create a ward officer or palika admin. Only these two roles can be created here (the Zod schema
 * allows nothing else): citizens sign up themselves, and new system admins are not created from the UI.
 */
export async function createStaff(admin: SessionUser, input: CreateStaffInput): Promise<AdminUserDto> {
  // Check the place exists first, for a clear 400 (instead of a database foreign-key error → 500).
  if (input.role === 'WARD_OFFICER' && !(await wardExists(input.wardId))) {
    throw new AppError('VALIDATION_ERROR', 'Unknown ward', { field: 'wardId' });
  }
  if (input.role === 'PALIKA_ADMIN' && !(await localLevelExists(input.localLevelId))) {
    throw new AppError('VALIDATION_ERROR', 'Unknown palika', { field: 'localLevelId' });
  }

  const created = await insertUser({
    role: input.role,
    name: input.name,
    email: input.email,
    passwordHash: await hashPassword(input.password),
    wardId: input.role === 'WARD_OFFICER' ? input.wardId : null,
    localLevelId: input.role === 'PALIKA_ADMIN' ? input.localLevelId : null,
    createdBy: admin.id, // who created it: an audit trail for accounts
  });
  if (!created) throw new AppError('CONFLICT', 'An account with this email already exists', { field: 'email' });
  return toRow(created);
}

/**
 * Activate / deactivate. A deactivated user can't log in, and their current session stops working at
 * once (requireAuth checks is_active on every request). Their requests and audit rows stay untouched.
 * A system admin can't deactivate a system admin (including themselves): that could lock everyone out.
 */
export async function setActive(userId: string, isActive: boolean): Promise<AdminUserDto> {
  const target = await findUserById(userId);
  if (!target) throw new AppError('NOT_FOUND', 'User not found');
  if (target.role === 'SYSTEM_ADMIN') throw new AppError('FORBIDDEN', 'System admin accounts cannot be deactivated here');
  const updated = await setUserActive(userId, isActive);
  return toRow(updated!);
}

// The create/update responses use the same shape as the list. Ward number and palika name aren't
// needed right after a change (the UI refetches the list), so they're left null.
function toRow(u: UserRecord): AdminUserDto {
  return {
    id: u.id,
    role: u.role,
    name: u.name,
    email: u.email,
    isActive: u.isActive,
    wardId: u.wardId,
    wardNumber: null,
    localLevelId: u.localLevelId,
    palikaNameEn: null,
    createdAt: u.createdAt.toISOString(),
  };
}
