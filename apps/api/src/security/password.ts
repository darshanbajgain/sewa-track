import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

/**
 * Password hashing with scrypt (built into Node, no dependency).
 *
 * Why hash at all: if the database leaks, attackers must NOT get the passwords.
 * Why scrypt (not SHA-256): scrypt is deliberately slow AND needs a lot of memory, so guessing
 * billions of passwords on graphics cards becomes very expensive. SHA-256 is fast by design: bad here.
 * Why a random salt per user: two users with the same password get different hashes, and
 * precomputed "rainbow tables" are useless.
 *
 * Parameters: N=2^14, r=8, p=5 is one of the settings OWASP's Password Storage Cheat Sheet lists
 * for scrypt (about 16 MiB of memory per hash).
 *
 * Stored format: "scrypt$N$r$p$<salt base64>$<hash base64>". Keeping the parameters in the string
 * means we can raise them later and still verify old passwords.
 */
const PARAMS = { N: 2 ** 14, r: 8, p: 5 };
const KEY_LENGTH = 64; // bytes of output
const SALT_LENGTH = 16; // bytes

// Node's callback-style scrypt, wrapped in a Promise so we can `await` it.
function scryptAsync(password: string, salt: Buffer, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, { ...options, maxmem: 64 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const hash = await scryptAsync(password, salt, PARAMS);
  return ['scrypt', PARAMS.N, PARAMS.r, PARAMS.p, salt.toString('base64'), hash.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, n, r, p, saltB64, hashB64] = stored.split('$');
  if (algorithm !== 'scrypt' || !n || !r || !p || !saltB64 || !hashB64) return false;

  const expected = Buffer.from(hashB64, 'base64');
  const actual = await scryptAsync(password, Buffer.from(saltB64, 'base64'), { N: Number(n), r: Number(r), p: Number(p) });

  // timingSafeEqual compares every byte, always taking the same time. A normal `===` stops at the
  // first difference, and measuring that time difference can leak information to an attacker.
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
