import { portalForRole, type AuthUser, type LoginInput, type RegisterInput } from '@sewa/shared';
import { AppError } from '../errors.js';
import { findUserByEmail, findUserById, insertUser, type UserRecord } from '../repositories/user.repository.js';
import { hashPassword, verifyPassword } from '../security/password.js';
import { signSessionToken } from '../security/token.js';

/**
 * Login and sign-up use cases. Each returns the user and a signed token; the controller puts the token
 * in a cookie.
 */

// One message for "unknown email" AND "wrong password". Different messages would let an attacker
// find out which emails have accounts ("user enumeration").
const LOGIN_FAILED = 'Email or password is incorrect';

// A real hash of a random password, made once. Used when the email doesn't exist, so that case
// takes as long as a real password check. Otherwise the response time would reveal unknown emails.
const dummyHashPromise = hashPassword(`dummy-${Math.random()}`);

/** Never return the hash: build the public user object field by field. */
const toAuthUser = (u: UserRecord): AuthUser => ({
  id: u.id,
  role: u.role,
  name: u.name,
  email: u.email,
  wardId: u.wardId,
  localLevelId: u.localLevelId,
});

export async function login(input: LoginInput): Promise<{ user: AuthUser; token: string }> {
  const found = await findUserByEmail(input.email);

  if (!found) {
    await verifyPassword(input.password, await dummyHashPromise); // same work, result ignored
    throw new AppError('UNAUTHENTICATED', LOGIN_FAILED);
  }

  if (!(await verifyPassword(input.password, found.passwordHash))) {
    throw new AppError('UNAUTHENTICATED', LOGIN_FAILED);
  }

  // Checked AFTER the password, so this message only reaches someone who knows the password.
  if (!found.isActive) {
    throw new AppError('FORBIDDEN', 'This account has been deactivated. Contact the system admin.');
  }

  // Right account, wrong login page (PRD F3). Also after the password, so it never tells a stranger
  // which emails belong to staff. `details.portal` lets the page link to the right one. No cookie is set.
  const portal = portalForRole(found.role);
  if (input.portal !== portal) {
    throw new AppError(
      'FORBIDDEN',
      portal === 'STAFF' ? 'Staff accounts log in on the staff login page' : 'Citizens log in on the citizen login page',
      { portal },
    );
  }

  const user = toAuthUser(found);
  return { user, token: signSessionToken(user) };
}

/**
 * Citizen sign-up (PRD F3). The role is ALWAYS CITIZEN: it is never read from the request body, so nobody
 * can register themselves as staff. Staff accounts are created by a system admin (admin.service.ts).
 * After sign-up the user is logged in straight away (the controller sets the cookie).
 */
export async function register(input: RegisterInput): Promise<{ user: AuthUser; token: string }> {
  const created = await insertUser({
    role: 'CITIZEN',
    name: input.name,
    email: input.email,
    passwordHash: await hashPassword(input.password),
    wardId: null,
    localLevelId: null,
    createdBy: null,
  });
  if (!created) {
    // Saying "taken" does reveal that the email exists; every sign-up form has this trade-off.
    // The rate limit on this route keeps anyone from using it to test many emails.
    throw new AppError('CONFLICT', 'An account with this email already exists', { field: 'email' });
  }
  const user = toAuthUser(created);
  return { user, token: signSessionToken(user) };
}

/** The current user, read fresh from the database (the token could be older than a change). */
export async function getCurrentUser(userId: string): Promise<AuthUser> {
  const user = await findUserById(userId);
  if (!user || !user.isActive) throw new AppError('UNAUTHENTICATED', 'Please log in'); // gone or deactivated
  return toAuthUser(user);
}
