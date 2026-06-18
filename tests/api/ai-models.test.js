import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { createAiRouter } from '../../server/routes/ai.js';

class AiModelPool {
  constructor(models = []) {
    this.models = new Map(models.map(model => [model.id, structuredClone(model)]));
  }

  async query(sql, parameters = []) {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    if (normalized.startsWith('SELECT') && normalized.includes('FROM ai_models')) {
      const enabledOnly = normalized.includes('WHERE enabled = 1');
      const rows = [...this.models.values()]
        .filter(model => !enabledOnly || model.enabled)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map(model => ({
          id: model.id,
          provider: model.provider,
          model_id: model.modelId,
          display_name: model.displayName,
          enabled: model.enabled ? 1 : 0,
          reasoning: model.reasoning ? 1 : 0,
          context_limit: model.contextLimit,
          max_output_tokens: model.maxOutputTokens,
          sort_order: model.sortOrder
        }));
      return [rows, []];
    }

    if (normalized.startsWith('INSERT INTO ai_models')) {
      const [
        id,
        provider,
        modelId,
        displayName,
        enabled,
        reasoning,
        contextLimit,
        maxOutputTokens,
        sortOrder
      ] = parameters;
      if (this.models.has(id)) {
        const error = new Error('duplicate');
        error.code = 'ER_DUP_ENTRY';
        throw error;
      }
      this.models.set(id, {
        id,
        provider,
        modelId,
        displayName,
        enabled: Boolean(enabled),
        reasoning: Boolean(reasoning),
        contextLimit,
        maxOutputTokens,
        sortOrder
      });
      return [{ affectedRows: 1 }, []];
    }

    throw new Error(`Unexpected SQL in AI model test: ${normalized}`);
  }
}

function createTestApp(pool, user) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (user) req.authUser = user;
    next();
  });
  app.use(createAiRouter({
    pool,
    deepseek: {
      apiKey: 'server-only-key',
      baseUrl: 'https://api.deepseek.com'
    }
  }));
  return app;
}

const initialModel = {
  id: 'deepseek-model-1',
  provider: 'deepseek',
  modelId: 'provider-model-id',
  displayName: 'DeepSeek Model',
  enabled: true,
  reasoning: false,
  contextLimit: 64_000,
  maxOutputTokens: 8_192,
  sortOrder: 10
};

test('normal users list enabled safe model fields only', async () => {
  const pool = new AiModelPool([
    initialModel,
    { ...initialModel, id: 'disabled', enabled: false }
  ]);
  const response = await request(createTestApp(pool, {
    id: 'u-2',
    role: 'User'
  }))
    .get('/ai/models')
    .expect(200);

  assert.deepEqual(response.body, [initialModel]);
  assert.equal(JSON.stringify(response.body).includes('server-only-key'), false);
  assert.equal(JSON.stringify(response.body).includes('baseUrl'), false);
});

test('administrators can register future DeepSeek model IDs at runtime', async () => {
  const pool = new AiModelPool([initialModel]);
  const app = createTestApp(pool, {
    id: 'u-1',
    role: 'Admin',
    isDefaultAdmin: true
  });
  const futureModel = {
    ...initialModel,
    id: 'deepseek-future',
    modelId: 'deepseek-future-model',
    displayName: 'DeepSeek Future',
    sortOrder: 20
  };

  await request(app)
    .post('/ai/models')
    .send(futureModel)
    .expect(201);

  const response = await request(app).get('/ai/models').expect(200);
  assert.deepEqual(response.body.map(model => model.modelId), [
    'provider-model-id',
    'deepseek-future-model'
  ]);
});

test('administrators can register future MiniMax model IDs at runtime', async () => {
  const pool = new AiModelPool([initialModel]);
  const app = createTestApp(pool, {
    id: 'u-1',
    role: 'Admin',
    isDefaultAdmin: true
  });
  const minimaxModel = {
    ...initialModel,
    id: 'minimax-future',
    provider: 'minimax',
    modelId: 'MiniMax-Future',
    displayName: 'MiniMax Future',
    sortOrder: 30
  };

  await request(app)
    .post('/ai/models')
    .send(minimaxModel)
    .expect(201);

  const response = await request(app).get('/ai/models').expect(200);
  assert.deepEqual(response.body.map(item => item.provider), [
    'deepseek',
    'minimax'
  ]);
});

test('model configuration cannot redirect requests or add unknown providers', async () => {
  const app = createTestApp(new AiModelPool(), {
    id: 'u-1',
    role: 'Admin',
    isDefaultAdmin: true
  });

  await request(app)
    .post('/ai/models')
    .send({
      ...initialModel,
      baseUrl: 'https://attacker.example/v1'
    })
    .expect(400);

  await request(app)
    .post('/ai/models')
    .send({
      ...initialModel,
      provider: 'other-provider'
    })
    .expect(400);
});
