import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password.js';

describe('password hashing (scrypt)', () => {
  it('never stores the password itself', async () => {
    const hash = await hashPassword('demo1234');
    expect(hash).not.toContain('demo1234');
    expect(hash).toMatch(/^scrypt\$16384\$8\$5\$/); // algorithm and parameters are stored with it
  });

  it('verifies the right password and rejects a wrong one', async () => {
    const hash = await hashPassword('demo1234');
    expect(await verifyPassword('demo1234', hash)).toBe(true);
    expect(await verifyPassword('demo1235', hash)).toBe(false);
    expect(await verifyPassword('', hash)).toBe(false);
  });

  it('gives the same password a different hash each time (random salt)', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'));
  });

  it('rejects a stored value that is not our format', async () => {
    expect(await verifyPassword('x', 'plain-text-password')).toBe(false);
    expect(await verifyPassword('x', 'md5$abc')).toBe(false);
  });
});
