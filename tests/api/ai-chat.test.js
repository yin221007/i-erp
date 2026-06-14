import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { createAiRouter } from '../../server/routes/ai.js';

const model = {
  id: 'deepseek-v4-pro',
  provider: 'deepseek',
  modelId: 'deepseek-v4-pro',
  displayName: 'DeepSeek V4 Pro',
  enabled: true,
  reasoning: true,
  contextLimit: 1_000_000,
  maxOutputTokens: 384_000,
  sortOrder: 20
};

const minimaxModel = {
  id: 'minimax-m3',
  provider: 'minimax',
  modelId: 'MiniMax-M3',
  displayName: 'MiniMax M3',
  enabled: true,
  reasoning: true,
  contextLimit: 1_000_000,
  maxOutputTokens: 128_000,
  sortOrder: 30
};

class AiChatPool {
  constructor({ enabled = true, models = [model] } = {}) {
    this.enabled = enabled;
    this.models = new Map(models.map(item => [item.id, item]));
    this.usage = [];
  }

  async query(sql, parameters = []) {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    if (
      normalized.startsWith('SELECT') &&
      normalized.includes('FROM ai_models') &&
      normalized.includes('WHERE id = ?')
    ) {
      const selectedModel = this.models.get(parameters[0]);
      if (!this.enabled || !selectedModel) return [[], []];
      return [[{
        id: selectedModel.id,
        provider: selectedModel.provider,
        model_id: selectedModel.modelId,
        display_name: selectedModel.displayName,
        enabled: 1,
        reasoning: selectedModel.reasoning ? 1 : 0,
        context_limit: selectedModel.contextLimit,
        max_output_tokens: selectedModel.maxOutputTokens,
        sort_order: selectedModel.sortOrder
      }], []];
    }
    if (normalized.startsWith('INSERT INTO ai_usage')) {
      const [id, userId, modelId, status, startedAt] = parameters;
      this.usage.push({
        id,
        userId,
        modelId,
        promptTokens: 0,
        completionTokens: 0,
        status,
        startedAt
      });
      return [{ affectedRows: 1 }, []];
    }
    if (normalized.startsWith('UPDATE ai_usage SET')) {
      const [
        promptTokens,
        completionTokens,
        status,
        errorCode,
        completedAt,
        id
      ] = parameters;
      Object.assign(this.usage.find(item => item.id === id), {
        promptTokens,
        completionTokens,
        status,
        errorCode,
        completedAt
      });
      return [{ affectedRows: 1 }, []];
    }
    throw new Error(`Unexpected SQL in AI chat test: ${normalized}`);
  }
}

function sseResponse(chunks) {
  return new Response(chunks.map(chunk => `data: ${chunk}\n\n`).join(''), {
    status: 200,
    headers: { 'content-type': 'text/event-stream' }
  });
}

function createTestApp({
  pool = new AiChatPool(),
  user = { id: 'u-2', role: 'User' },
  fetchImpl,
  resolveApiKey,
  requestTimeoutMilliseconds = 1_000,
  maximumConcurrentRequests = 2
} = {}) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (user) req.authUser = user;
    next();
  });
  app.use(createAiRouter({
    pool,
    deepseek: {
      apiKey: 'provider-secret-key',
      baseUrl: 'https://api.deepseek.com',
      requestTimeoutMilliseconds,
      maximumConcurrentRequests,
      fetchImpl
    },
    resolveApiKey
  }));
  return { app, pool };
}

const chatBody = {
  modelId: model.id,
  messages: [{ role: 'user', content: 'Hello' }]
};

test('chat uses the official DeepSeek endpoint and emits normalized SSE', async () => {
  let upstreamRequest;
  const { app, pool } = createTestApp({
    fetchImpl: async (url, options) => {
      upstreamRequest = { url, options };
      return sseResponse([
        JSON.stringify({
          choices: [{ delta: { reasoning_content: 'Think' } }],
          usage: null
        }),
        JSON.stringify({
          choices: [{ delta: { content: 'Answer' } }],
          usage: null
        }),
        JSON.stringify({
          choices: [],
          usage: { prompt_tokens: 12, completion_tokens: 7 }
        }),
        '[DONE]'
      ]);
    }
  });

  const response = await request(app)
    .post('/ai/chat')
    .send(chatBody)
    .expect(200);

  assert.equal(upstreamRequest.url, 'https://api.deepseek.com/chat/completions');
  assert.equal(
    upstreamRequest.options.headers.Authorization,
    'Bearer provider-secret-key'
  );
  assert.equal(response.headers['content-type'], 'text/event-stream; charset=utf-8');
  assert.equal(response.headers['x-accel-buffering'], 'no');
  assert.match(response.text, /event: reasoning[\s\S]*Think/);
  assert.match(response.text, /event: token[\s\S]*Answer/);
  assert.match(response.text, /event: done/);
  assert.equal(pool.usage[0].userId, 'u-2');
  assert.equal(pool.usage[0].modelId, model.id);
  assert.equal(pool.usage[0].promptTokens, 12);
  assert.equal(pool.usage[0].completionTokens, 7);
  assert.equal(pool.usage[0].status, 'success');
});

test('chat resolves the DeepSeek key at request time', async () => {
  let resolvedProvider;
  let authorization;
  const { app } = createTestApp({
    resolveApiKey: async provider => {
      resolvedProvider = provider;
      return 'sk-runtime-database-key';
    },
    fetchImpl: async (_url, options) => {
      authorization = options.headers.Authorization;
      return sseResponse(['[DONE]']);
    }
  });

  await request(app)
    .post('/ai/chat')
    .send(chatBody)
    .expect(200);

  assert.equal(resolvedProvider, 'deepseek');
  assert.equal(authorization, 'Bearer sk-runtime-database-key');
});

test('chat routes MiniMax models to the official endpoint and normalizes SSE', async () => {
  let upstreamRequest;
  let resolvedProvider;
  const { app, pool } = createTestApp({
    pool: new AiChatPool({ models: [model, minimaxModel] }),
    resolveApiKey: async provider => {
      resolvedProvider = provider;
      return provider === 'minimax' ? 'minimax-runtime-key' : '';
    },
    fetchImpl: async (url, options) => {
      upstreamRequest = {
        url,
        options,
        body: JSON.parse(options.body)
      };
      return sseResponse([
        JSON.stringify({
          choices: [{
            delta: {
              reasoning_details: [{ text: 'Plan' }],
              content: '答'
            }
          }]
        }),
        JSON.stringify({
          choices: [{
            delta: {
              reasoning_details: [{ text: 'Plan more' }],
              content: '答案'
            }
          }]
        }),
        JSON.stringify({
          choices: [],
          usage: { prompt_tokens: 8, completion_tokens: 5 }
        }),
        '[DONE]'
      ]);
    }
  });

  const response = await request(app)
    .post('/ai/chat')
    .send({ ...chatBody, modelId: minimaxModel.id })
    .expect(200);

  assert.equal(resolvedProvider, 'minimax');
  assert.equal(
    upstreamRequest.url,
    'https://api.minimaxi.com/v1/chat/completions'
  );
  assert.equal(
    upstreamRequest.options.headers.Authorization,
    'Bearer minimax-runtime-key'
  );
  assert.equal(upstreamRequest.body.model, 'MiniMax-M3');
  assert.equal(upstreamRequest.body.max_completion_tokens, 8192);
  assert.equal('max_tokens' in upstreamRequest.body, false);
  assert.deepEqual(upstreamRequest.body.thinking, { type: 'adaptive' });
  assert.equal(upstreamRequest.body.reasoning_split, true);
  assert.match(response.text, /event: reasoning[\s\S]*Plan/);
  assert.match(response.text, /event: reasoning[\s\S]* more/);
  assert.match(response.text, /event: token[\s\S]*答/);
  assert.match(response.text, /event: token[\s\S]*案/);
  assert.equal(pool.usage[0].modelId, minimaxModel.id);
  assert.equal(pool.usage[0].promptTokens, 8);
  assert.equal(pool.usage[0].completionTokens, 5);
});

test('a missing MiniMax key does not prevent a later DeepSeek request', async () => {
  const requestedProviders = [];
  const { app } = createTestApp({
    pool: new AiChatPool({ models: [model, minimaxModel] }),
    resolveApiKey: async provider => {
      requestedProviders.push(provider);
      return provider === 'deepseek' ? 'deepseek-runtime-key' : '';
    },
    fetchImpl: async () => sseResponse(['[DONE]'])
  });

  await request(app)
    .post('/ai/chat')
    .send({ ...chatBody, modelId: minimaxModel.id })
    .expect(503);
  await request(app)
    .post('/ai/chat')
    .send(chatBody)
    .expect(200);

  assert.deepEqual(requestedProviders, ['minimax', 'deepseek']);
});

test('chat requires authentication and an enabled model', async () => {
  const unauthenticated = createTestApp({
    user: null,
    fetchImpl: async () => {
      throw new Error('should not call upstream');
    }
  });
  await request(unauthenticated.app)
    .post('/ai/chat')
    .send(chatBody)
    .expect(401);

  const disabled = createTestApp({
    pool: new AiChatPool({ enabled: false }),
    fetchImpl: async () => {
      throw new Error('should not call upstream');
    }
  });
  await request(disabled.app)
    .post('/ai/chat')
    .send(chatBody)
    .expect(400);
});

test('chat timeout aborts the upstream request and records the failure', async () => {
  let aborted = false;
  const { app, pool } = createTestApp({
    requestTimeoutMilliseconds: 20,
    fetchImpl: async (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        aborted = true;
        reject(options.signal.reason);
      });
    })
  });

  await request(app).post('/ai/chat').send(chatBody).expect(504);

  assert.equal(aborted, true);
  assert.equal(pool.usage[0].status, 'timeout');
});

test('concurrent requests are limited per authenticated user', async () => {
  let releaseUpstream;
  let upstreamStarted;
  const started = new Promise(resolve => {
    upstreamStarted = resolve;
  });
  const { app } = createTestApp({
    maximumConcurrentRequests: 1,
    fetchImpl: async () => {
      upstreamStarted();
      return new Promise(resolve => {
        releaseUpstream = () => resolve(sseResponse(['[DONE]']));
      });
    }
  });

  const firstRequest = request(app).post('/ai/chat').send(chatBody);
  const firstResponsePromise = firstRequest.then(response => response);
  await started;

  await request(app).post('/ai/chat').send(chatBody).expect(429);
  releaseUpstream();
  await firstResponsePromise;
});
