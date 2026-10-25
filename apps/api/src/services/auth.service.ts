import type { AuthUser, LoginInput } from '@sewa/shared';
import { AppError } from '../errors.js';
import { findUserById, findUserByPhone } from '../repositories/user.repository.js';
import { hashPassword, verifyPassword } from '../security/password.js';
import { signSessionToken } from '../security/token.js';

/**
 * Login use case. Returns the user and a signed token; the controller puts the token in a cookie.
 */

// One message for "unknown phone" AND "wrong password". Different messages would let an attacker
// find out which phone numbers have accounts ("user enumeration").
const LOGIN_FAILED = 'Phone or password is incorrect';

// A real hash of a random password, made once. Used when the phone doesn't exist, so that case
// takes as long as a real password check. Otherwise the response time would reveal unknown phones.
const dummyHashPromise = hashPassword(`dummy-${Math.random()}`);

export async function login(input: LoginInput): Promise<{ user: AuthUser; token: string }> {
  const found = await findUserByPhone(input.phone);

  if (!found) {
    await verifyPassword(input.password, await dummyHashPromise); // same work, result ignored
    throw new AppError('UNAUTHENTICATED', LOGIN_FAILED);
  }

  if (!(await verifyPassword(input.password, found.passwordHash))) {
    throw new AppError('UNAUTHENTICATED', LOGIN_FAILED);
  }

  // Never return the hash: build the public user object field by field.
  const user: AuthUser = {
    id: found.id,
    role: found.role,
    name: found.name,
    wardId: found.wardId,
    localLevelId: found.localLevelId,
  };
  return { user, token: signSessionToken(user) };
}

/** The current user, read fresh from the database (the token could be older than a change). */
export async function getCurrentUser(userId: string): Promise<AuthUser> {
  const user = await findUserById(userId);
  if (!user) throw new AppError('UNAUTHENTICATED', 'Please log in'); // account no longer exists
  return user;
}
