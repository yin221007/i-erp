import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AI_PROVIDER_IDS,
  getAiProvider
} from '../../server/services/ai-providers.js';

const baseRequest = {
  model: 'provider-model',
  messages: [{ role: 'user', content: 'Hello' }],
  maxTokens: 8192,
  reasoning: true,
  userId: 'anonymous-user'
};

test('provider registry exposes only fixed official DeepSeek and MiniMax hosts', () => {
  assert.deepEqual(AI_PROVIDER_IDS, ['deepseek', 'minimax']);
  assert.equal(
    getAiProvider('deepseek').baseUrl,
    'https://api.deepseek.com'
  );
  assert.equal(
    getAiProvider('minimax').baseUrl,
    'https://api.minimaxi.com/v1'
  );
  assert.equal(getAiProvider('custom'), null);
});

test('DeepSeek provider preserves the existing request contract', () => {
  const body = getAiProvider('deepseek').buildRequestBody(baseRequest);

  assert.equal(body.model, 'provider-model');
  assert.equal(body.max_tokens, 8192);
  assert.deepEqual(body.thinking, { type: 'enabled' });
  assert.equal(body.user_id, 'anonymous-user');
  assert.equal(body.stream, true);
  assert.deepEqual(body.stream_options, { include_usage: true });
});

test('MiniMax provider uses OpenAI-compatible completion and reasoning fields', () => {
  const body = getAiProvider('minimax').buildRequestBody(baseRequest);

  assert.equal(body.model, 'provider-model');
  assert.equal(body.max_completion_tokens, 8192);
  assert.deepEqual(body.thinking, { type: 'adaptive' });
  assert.equal(body.reasoning_split, true);
  assert.equal('max_tokens' in body, false);
  assert.equal('user_id' in body, false);
});

test('MiniMax provider converts cumulative reasoning and content into deltas', () => {
  const provider = getAiProvider('minimax');
  const state = {};

  assert.deepEqual(
    provider.extractDelta({
      choices: [{
        delta: {
          reasoning_details: [{ text: 'Plan' }],
          content: '答'
        }
      }]
    }, state),
    { reasoning: 'Plan', content: '答' }
  );
  assert.deepEqual(
    provider.extractDelta({
      choices: [{
        delta: {
          reasoning_details: [{ text: 'Plan more' }],
          content: '答案'
        }
      }]
    }, state),
    { reasoning: ' more', content: '案' }
  );
});
