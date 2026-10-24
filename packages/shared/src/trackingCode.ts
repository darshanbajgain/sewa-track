/**
 * Public tracking code format (PRD F4): "ST-" + 10 characters of Crockford Base32.
 *
 * Crockford Base32 = digits + letters, WITHOUT I, L, O, U:
 *   I, L look like 1 · O looks like 0 · U is left out to avoid accidental rude words.
 * So a code read aloud over the phone or copied by hand is hard to get wrong.
 *
 * Shared by the API (validation) and the web app (the "Track" form), and identical to the
 * database CHECK constraint in 001_init.sql.
 */
export const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // exactly 32 characters

export const TRACKING_CODE_PREFIX = 'ST-';
export const TRACKING_CODE_LENGTH = 10; // characters after the prefix

export const TRACKING_CODE_REGEX = /^ST-[0-9A-HJKMNP-TV-Z]{10}$/;
