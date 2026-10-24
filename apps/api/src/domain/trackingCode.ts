import { randomBytes } from 'node:crypto';
import { CROCKFORD_ALPHABET, TRACKING_CODE_LENGTH, TRACKING_CODE_PREFIX, TRACKING_CODE_REGEX } from '@sewa/shared';

/**
 * Tracking codes (PRD F4, AGENTS §6): random, never sequential.
 *
 * Why random: with sequential codes (ST-0000000001, ST-0000000002, ...) anyone could look up
 * other people's requests by counting. 10 random Base32 characters = 32^10 ≈ 1.1 × 10^15
 * possible codes; with a rate limit of 10 lookups/minute, guessing a real one is hopeless.
 */

/**
 * Makes a new random tracking code, e.g. "ST-7K3QX9M2PD".
 *
 * `getRandomBytes` is a parameter (defaulting to the real crypto function) so tests can pass
 * fixed bytes and get a predictable code. This is "dependency injection" in its simplest form.
 */
export function generateTrackingCode(getRandomBytes: (size: number) => Uint8Array = randomBytes): string {
  const bytes = getRandomBytes(TRACKING_CODE_LENGTH);
  let body = '';
  for (const byte of bytes) {
    // A byte is 0..255. 256 / 32 = 8 exactly, so `byte % 32` gives each of the 32 characters
    // the same chance (no "modulo bias"). With an alphabet of, say, 30 characters it would not.
    body += CROCKFORD_ALPHABET[byte % CROCKFORD_ALPHABET.length];
  }
  return TRACKING_CODE_PREFIX + body;
}

/** True only for a correctly formatted code (same rule as the database CHECK constraint). */
export function isValidTrackingCode(code: string): boolean {
  return TRACKING_CODE_REGEX.test(code);
}

/**
 * Cleans what a person typed before we look it up:
 *   " st-7k3qx9m2pd " → "ST-7K3QX9M2PD"
 * and applies Crockford's rule for look-alike letters in the code part: O → 0, I and L → 1.
 * So "ST-OOOOOOOOOI" (letters typed by mistake) still finds "ST-0000000001".
 */
export function normalizeTrackingCode(input: string): string {
  const upper = input.trim().toUpperCase();
  if (!upper.startsWith(TRACKING_CODE_PREFIX)) return upper;
  const body = upper.slice(TRACKING_CODE_PREFIX.length).replace(/O/g, '0').replace(/[IL]/g, '1');
  return TRACKING_CODE_PREFIX + body;
}
