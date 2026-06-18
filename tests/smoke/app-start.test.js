import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../server/app.js';

test('createApp returns an Express application without opening a port', () => {
  const app = createApp({
    pool: { execute: async () => [[]] },
    config: { publicOrigins: ['https://erp.example.test'] }
  });

  assert.equal(typeof app, 'function');
  assert.equal(typeof app.listen, 'function');
});
