import { roleSchema, type AuthUser } from '@sewa/shared';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../config/env.js';

/**
 * Login tokens (JWT = JSON Web Token).
 *
 * A JWT is three base64 parts: header.payload.signature. The payload is READABLE by anyone
 * (it is not encrypted), so it holds only ids and the role, never secrets or personal data.
 * The signature is made with JWT_SECRET: if anyone changes the payload (e.g. role → SYSTEM_ADMIN),
 * the signature no longer matches and verification fails.
 *
 * Stateless: the server keeps no session list. Any API instance can verify a token with the secret.
 */

// What we put inside the token. `sub` (subject) is the standard JWT field for the user id.
const payloadSchema = z.object({
  sub: z.uuid(),
  role: roleSchema,
  wardId: z.number().int().nullable(),
  localLevelId: z.number().int().nullable(),
});

/** The parts of the logged-in user every request needs for authorization. */
export type SessionUser = Pick<AuthUser, 'id' | 'role' | 'wardId' | 'localLevelId'>;

export function signSessionToken(user: SessionUser): string {
  return jwt.sign({ role: user.role, wardId: user.wardId, localLevelId: user.localLevelId }, env.JWT_SECRET, {
    algorithm: 'HS256',
    subject: user.id,
    expiresIn: `${env.SESSION_HOURS}h`,
  });
}

/** Returns the user if the token is valid and not expired; otherwise null. Never throws. */
export function verifySessionToken(token: string): SessionUser | null {
  try {
    // `algorithms: ['HS256']` is important: it refuses tokens that claim another algorithm
    // (e.g. "none"), a classic JWT attack.
    const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
    const payload = payloadSchema.parse(decoded);
    return { id: payload.sub, role: payload.role, wardId: payload.wardId, localLevelId: payload.localLevelId };
  } catch {
    return null; // bad signature, expired, or unexpected shape
  }
}
