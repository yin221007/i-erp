import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { createAiRouter } from '../../server/routes/ai.js';

class AiSettingsPool {
  constructor() {
    this.secrets = new Map();
  }

  async query(sql, parameters = []) {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    if (normalized.startsWith('SELECT ciphertext, iv, auth_tag')) {
      const secret = this.secrets.get(parameters[0]);
      return [secret ? [structuredClone(secret)] : [], []];
    }
    if (normalized.startsWith('INSERT INTO system_secrets')) {
      const [name, ciphertext, iv, authTag] = parameters;
      this.secrets.set(name, { ciphertext, iv, auth_tag: authTag });
      return [{ affectedRows: 1 }, []];
    }
    if (normalized.startsWith('DELETE FROM system_secrets')) {
      this.secrets.delete(parameters[0]);
      return [{ affectedRows: 1 }, []];
    }
    throw new Error(`Unexpected SQL in AI settings test: ${normalized}`);
  }
}

function createSettingsApp({
  user = { id: 'u-1', role: 'Admin', isDefaultAdmin: true },
  deepseekApiKey = '',
  minimaxApiKey = '',
  fetchImpl
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
    providers: {
      deepseek: { apiKey: deepseekApiKey },
      minimax: { apiKey: minimaxApiKey }
    },
    gatewayConfig: {
      requestTimeoutMilliseconds: 1_000,
      maximumConcurrentRequests: 2,
      fetchImpl
    },
    fetchImpl,
    secretEncryptionKey: 'm'.repeat(32)
  }));
  return { app, pool };
}

test('normal users cannot inspect or change global AI provider keys', async () => {
  const { app } = createSettingsApp({
    user: { id: 'u-2', role: 'User', isDefaultAdmin: false }
  });

  await request(app).get('/ai/settings').expect(403);
  await request(app)
    .put('/ai/settings/deepseek')
    .send({ apiKey: 'sk-1234567890abcdefghijklmnop' })
    .expect(403);
  await request(app).delete('/ai/settings/minimax').expect(403);
  await request(app)
    .post('/ai/settings/minimax/test')
    .send({ apiKey: 'minimax-1234567890abcdefghijkl' })
    .expect(403);
});

test('administrators manage DeepSeek and MiniMax encrypted keys independently', async () => {
  const { app, pool } = createSettingsApp();
  const deepseekKey = 'sk-1234567890abcdefghijklmnop';
  const minimaxKey = 'minimax-1234567890abcdefghijkl';

  const initial = await request(app).get('/ai/settings').expect(200);
  assert.deepEqual(initial.body, {
    providers: {
      deepseek: {
        configured: false,
        maskedKey: '',
        source: 'none'
      },
      minimax: {
        configured: false,
        maskedKey: '',
        source: 'none'
      }
    }
  });

  await request(app)
    .put('/ai/settings/deepseek')
    .send({ apiKey: deepseekKey })
    .expect(200);
  await request(app)
    .put('/ai/settings/minimax')
    .send({ apiKey: minimaxKey })
    .expect(200);

  assert.deepEqual(
    [...pool.secrets.keys()].sort(),
    ['deepseek_api_key', 'minimax_api_key']
  );
  assert.equal(JSON.stringify([...pool.secrets.values()]).includes(deepseekKey), false);
  assert.equal(JSON.stringify([...pool.secrets.values()]).includes(minimaxKey), false);

  const status = await request(app).get('/ai/settings').expect(200);
  assert.equal(status.body.providers.deepseek.maskedKey, '********mnop');
  assert.equal(status.body.providers.minimax.maskedKey, '********ijkl');
  assert.equal(JSON.stringify(status.body).includes('1234567890abcd'), false);

  await request(app).delete('/ai/settings/minimax').expect(204);
  const cleared = await request(app).get('/ai/settings').expect(200);
  assert.equal(cleared.body.providers.deepseek.configured, true);
  assert.equal(cleared.body.providers.minimax.configured, false);
});

test('environment keys remain read-only fallbacks per provider', async () => {
  const { app } = createSettingsApp({
    deepseekApiKey: 'sk-environment-1234567890',
    minimaxApiKey: 'minimax-environment-123456'
  });

  const status = await request(app).get('/ai/settings').expect(200);
  assert.equal(status.body.providers.deepseek.source, 'environment');
  assert.equal(status.body.providers.minimax.source, 'environment');

  await request(app).delete('/ai/settings/deepseek').expect(204);
  await request(app).delete('/ai/settings/minimax').expect(204);
  const afterClear = await request(app).get('/ai/settings').expect(200);
  assert.equal(afterClear.body.providers.deepseek.source, 'environment');
  assert.equal(afterClear.body.providers.minimax.source, 'environment');
});

test('invalid keys and unknown providers are rejected without writing secrets', async () => {
  const { app, pool } = createSettingsApp();

  for (const apiKey of [
    '',
    'too-short',
    'key-has whitespace 1234567890',
    `key-${'x'.repeat(300)}`
  ]) {
    await request(app)
      .put('/ai/settings/minimax')
      .send({ apiKey })
      .expect(400);
  }
  await request(app)
    .put('/ai/settings/custom')
    .send({ apiKey: 'custom-1234567890abcdefghijkl' })
    .expect(404);

  assert.equal(pool.secrets.size, 0);
});

test('connection tests use only the fixed official provider endpoint', async () => {
  const upstreamRequests = [];
  const { app, pool } = createSettingsApp({
    fetchImpl: async (url, options) => {
      upstreamRequests.push({ url, options, body: JSON.parse(options.body) });
      return new Response(JSON.stringify({
        choices: [{ message: { content: 'ok' } }]
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
  });

  await request(app)
    .post('/ai/settings/minimax/test')
    .send({ apiKey: 'minimax-1234567890abcdefghijkl' })
    .expect(200, { ok: true });
  await request(app)
    .post('/ai/settings/custom/test')
    .send({ apiKey: 'custom-1234567890abcdefghijkl' })
    .expect(404);

  assert.equal(upstreamRequests.length, 1);
  assert.equal(
    upstreamRequests[0].url,
    'https://api.minimaxi.com/v1/chat/completions'
  );
  assert.equal(upstreamRequests[0].body.model, 'MiniMax-M3');
  assert.equal(upstreamRequests[0].body.stream, false);
  assert.equal(pool.secrets.size, 0);
});
