import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { createAiRouter } from '../../server/routes/ai.js';

class AiSettingsPool {
  constructor() {
    this.secret = null;
  }

  async query(sql, parameters = []) {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    if (normalized.startsWith('SELECT ciphertext, iv, auth_tag')) {
      return [this.secret ? [structuredClone(this.secret)] : [], []];
    }
    if (normalized.startsWith('INSERT INTO system_secrets')) {
      const [, ciphertext, iv, authTag] = parameters;
      this.secret = { ciphertext, iv, auth_tag: authTag };
      return [{ affectedRows: 1 }, []];
    }
    if (normalized.startsWith('DELETE FROM system_secrets')) {
      this.secret = null;
      return [{ affectedRows: 1 }, []];
    }
    throw new Error(`Unexpected SQL in AI settings test: ${normalized}`);
  }
}

function createSettingsApp({
  user = { id: 'u-1', role: 'Admin', isDefaultAdmin: true },
  environmentApiKey = ''
} = {}) {
  const pool = new AiSettingsPool();
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.authUser = user;
    next();
  });
  app.use(createAiRouter({
    pool,
    deepseek: {
      apiKey: environmentApiKey,
      baseUrl: 'https://api.deepseek.com'
    },
    secretEncryptionKey: 'm'.repeat(32)
  }));
  return { app, pool };
}

test('normal users cannot inspect or change the global DeepSeek key', async () => {
  const { app } = createSettingsApp({
    user: { id: 'u-2', role: 'User', isDefaultAdmin: false }
  });

  await request(app).get('/ai/settings').expect(403);
  await request(app)
    .put('/ai/settings')
    .send({ apiKey: 'sk-1234567890abcdefghijklmnop' })
    .expect(403);
  await request(app).delete('/ai/settings').expect(403);
});

test('administrators save, inspect, replace, and clear the encrypted key', async () => {
  const { app, pool } = createSettingsApp();
  const firstKey = 'sk-1234567890abcdefghijklmnop';

  const initial = await request(app).get('/ai/settings').expect(200);
  assert.deepEqual(initial.body, {
    configured: false,
    maskedKey: '',
    source: 'none'
  });

  const saved = await request(app)
    .put('/ai/settings')
    .send({ apiKey: firstKey })
    .expect(200);
  assert.equal(saved.body.configured, true);
  assert.equal(saved.body.maskedKey, '********mnop');
  assert.equal(saved.body.source, 'database');
  assert.equal(JSON.stringify(pool.secret).includes(firstKey), false);

  const status = await request(app).get('/ai/settings').expect(200);
  assert.equal(status.body.maskedKey, '********mnop');
  assert.equal(JSON.stringify(status.body).includes('1234567890abcd'), false);

  await request(app)
    .put('/ai/settings')
    .send({ apiKey: 'sk-replacement-1234567890xyz' })
    .expect(200);
  const replaced = await request(app).get('/ai/settings').expect(200);
  assert.equal(replaced.body.maskedKey, '********0xyz');

  await request(app).delete('/ai/settings').expect(204);
  const cleared = await request(app).get('/ai/settings').expect(200);
  assert.equal(cleared.body.configured, false);
  assert.equal(cleared.body.source, 'none');
});

test('environment configuration remains a read-only fallback after clearing', async () => {
  const { app } = createSettingsApp({
    environmentApiKey: 'sk-environment-1234567890'
  });

  const status = await request(app).get('/ai/settings').expect(200);
  assert.equal(status.body.configured, true);
  assert.equal(status.body.maskedKey, '********7890');
  assert.equal(status.body.source, 'environment');

  await request(app).delete('/ai/settings').expect(204);
  const afterClear = await request(app).get('/ai/settings').expect(200);
  assert.equal(afterClear.body.source, 'environment');
});

test('invalid DeepSeek keys are rejected without writing secret storage', async () => {
  const { app, pool } = createSettingsApp();

  for (const apiKey of [
    '',
    'too-short',
    'sk-has whitespace 1234567890',
    `sk-${'x'.repeat(300)}`
  ]) {
    await request(app)
      .put('/ai/settings')
      .send({ apiKey })
      .expect(400);
  }

  assert.equal(pool.secret, null);
});
