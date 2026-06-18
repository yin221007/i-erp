import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deleteSystemSecret,
  maskSecret,
  readSystemSecret,
  writeSystemSecret
} from '../../server/services/system-secrets.js';

class SecretPool {
  constructor() {
    this.rows = new Map();
  }

  async query(sql, parameters = []) {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    if (normalized.startsWith('SELECT ciphertext, iv, auth_tag')) {
      const row = this.rows.get(parameters[0]);
      return [row ? [structuredClone(row)] : [], []];
    }
    if (normalized.startsWith('INSERT INTO system_secrets')) {
      const [name, ciphertext, iv, authTag] = parameters;
      this.rows.set(name, { ciphertext, iv, auth_tag: authTag });
      return [{ affectedRows: 1 }, []];
    }
    if (normalized.startsWith('DELETE FROM system_secrets')) {
      this.rows.delete(parameters[0]);
      return [{ affectedRows: 1 }, []];
    }
    throw new Error(`Unexpected SQL in secret test: ${normalized}`);
  }
}

const masterSecret = 'm'.repeat(32);

test('system secrets are encrypted at rest and decrypt with the same master secret', async () => {
  const pool = new SecretPool();
  const plaintext = 'sk-example-secret-value';

  await writeSystemSecret(
    pool,
    'deepseek_api_key',
    plaintext,
    masterSecret
  );

  assert.equal(JSON.stringify(pool.rows.get('deepseek_api_key')).includes(plaintext), false);
  assert.equal(
    await readSystemSecret(pool, 'deepseek_api_key', masterSecret),
    plaintext
  );
  await assert.rejects(
    () => readSystemSecret(pool, 'deepseek_api_key', 'x'.repeat(32))
  );
});

test('system secrets can be deleted without exposing their previous value', async () => {
  const pool = new SecretPool();
  await writeSystemSecret(
    pool,
    'deepseek_api_key',
    'sk-example-secret-value',
    masterSecret
  );

  await deleteSystemSecret(pool, 'deepseek_api_key');

  assert.equal(
    await readSystemSecret(pool, 'deepseek_api_key', masterSecret),
    null
  );
});

test('secret masking reveals only the final four characters', () => {
  assert.equal(maskSecret('sk-example-secret-value'), '********alue');
  assert.equal(maskSecret('abc'), '********');
  assert.equal(maskSecret(''), '');
  assert.equal(maskSecret(null), '');
});
