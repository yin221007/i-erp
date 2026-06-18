import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hashPassword,
  verifyPassword,
  isPasswordHash
} from '../../server/auth/passwords.js';

test('scrypt hash verifies the original Unicode password', async () => {
  const stored = await hashPassword('原密码123');

  assert.equal(isPasswordHash(stored), true);
  assert.equal(await verifyPassword('原密码123', stored), true);
  assert.equal(await verifyPassword('wrong', stored), false);
});

test('equal passwords receive independent random salts', async () => {
  const first = await hashPassword('same-password');
  const second = await hashPassword('same-password');

  assert.notEqual(first, second);
});

test('malformed or unsupported hashes are rejected without throwing', async () => {
  assert.equal(isPasswordHash('password'), false);
  assert.equal(await verifyPassword('password', 'password'), false);
  assert.equal(
    await verifyPassword(
      'password',
      'scrypt$v1$1073741824$8$1$c2FsdA==$a2V5'
    ),
    false
  );
  assert.equal(
    await verifyPassword('password', 'scrypt$v2$16384$8$1$c2FsdA==$a2V5'),
    false
  );
});
