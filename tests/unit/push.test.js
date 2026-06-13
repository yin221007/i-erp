import test from 'node:test';
import assert from 'node:assert/strict';
import { createPushService } from '../../server/services/push.js';

function response(ok = true) {
  return { ok, status: ok ? 200 : 502 };
}

test('PushPlus tests use the fixed official endpoint', async () => {
  const calls = [];
  const service = createPushService({
    fetchImpl: async (...args) => {
      calls.push(args);
      return response();
    }
  });

  await service.sendTest('PushPlus', { pushPlusToken: 'secret-token' });

  assert.equal(calls[0][0], 'https://www.pushplus.plus/send');
  assert.doesNotMatch(calls[0][0], /secret-token/);
});

test('webhook tests reject non-official hosts', async () => {
  const service = createPushService({
    fetchImpl: async () => response()
  });

  await assert.rejects(
    service.sendTest('WeCom', {
      wecomWebhook: 'https://internal.example/webhook'
    }),
    /official WeCom/
  );
  await assert.rejects(
    service.sendTest('DingTalk', {
      dingtalkWebhook: 'https://internal.example/webhook'
    }),
    /official DingTalk/
  );
});

test('unknown push providers are rejected', async () => {
  const service = createPushService({
    fetchImpl: async () => response()
  });

  await assert.rejects(
    service.sendTest('Unknown', {}),
    /Unsupported push provider/
  );
});
