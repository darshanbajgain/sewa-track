import { describe, expect, it } from 'vitest';
import { generateTrackingCode, isValidTrackingCode, normalizeTrackingCode } from './trackingCode.js';

describe('generateTrackingCode', () => {
  it('has the format ST- + 10 Crockford Base32 characters', () => {
    for (let i = 0; i < 1000; i++) {
      expect(generateTrackingCode()).toMatch(/^ST-[0-9A-HJKMNP-TV-Z]{10}$/);
    }
  });

  it('is predictable when we inject the random bytes (dependency injection)', () => {
    // byte % 32 → 0 → '0', 1 → '1', 31 → 'Z', 32 → '0' again, 255 → 31 → 'Z'
    const fixed = () => Uint8Array.from([0, 1, 9, 10, 17, 18, 31, 32, 63, 255]);
    expect(generateTrackingCode(fixed)).toBe('ST-019AHJZ0ZZ');
  });

  it('never repeats in 10,000 codes (random, not sequential)', () => {
    const codes = new Set(Array.from({ length: 10_000 }, () => generateTrackingCode()));
    expect(codes.size).toBe(10_000);
  });

  it('never contains the look-alike letters I, L, O, U', () => {
    const all = Array.from({ length: 2000 }, () => generateTrackingCode().slice(3)).join('');
    expect(all).not.toMatch(/[ILOU]/);
  });
});

describe('isValidTrackingCode', () => {
  it.each(['ST-0123456789', 'ST-ABCDEFGHJK', 'ST-ZZZZZZZZZZ'])('accepts %s', (code) => {
    expect(isValidTrackingCode(code)).toBe(true);
  });

  it.each([
    ['too short', 'ST-012345678'],
    ['too long', 'ST-01234567890'],
    ['lowercase', 'st-0123456789'],
    ['wrong prefix', 'SX-0123456789'],
    ['contains I', 'ST-I123456789'],
    ['contains O', 'ST-O123456789'],
    ['SQL text', "ST-' OR 1=1--"],
  ])('rejects %s', (_label, code) => {
    expect(isValidTrackingCode(code)).toBe(false);
  });
});

describe('normalizeTrackingCode', () => {
  it('trims and uppercases what the user typed', () => {
    expect(normalizeTrackingCode('  st-7k3qx9m2pd ')).toBe('ST-7K3QX9M2PD');
  });

  it('maps look-alike letters to digits in the code part (O → 0, I/L → 1)', () => {
    expect(normalizeTrackingCode('ST-OOOOOOOOOI')).toBe('ST-0000000001');
    expect(normalizeTrackingCode('st-l00000000o')).toBe('ST-1000000000');
  });

  it('leaves input without the prefix alone (it will simply fail validation)', () => {
    expect(normalizeTrackingCode('hello')).toBe('HELLO');
  });
});
