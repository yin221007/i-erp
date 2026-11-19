import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('native API contract includes authentication and every resource', async () => {
  const source = await readFile(
    new URL('../../api-contract/openapi.yaml', import.meta.url),
    'utf8'
  );

  for (const path of [
    '/auth/login',
    '/auth/me',
    '/auth/logout',
    '/upload',
    '/uploads/{filename}'
  ]) {
    assert.match(source, new RegExp(`${path.replaceAll('/', '\\/').replace('{filename}', '\\{filename\\}')}:`));
  }

  for (const resource of [
    'projects',
    'clients',
    'equipment',
    'schedule',
    'docs',
    'archives',
    'production',
    'users',
    'settings',
    'payments',
    'approvals',
    'worklogs',
    'messages',
    'channels',
    'email_configs',
    'announcements',
    'ai_messages',
    'recycle_bin'
  ]) {
    assert.match(source, new RegExp(`/${resource}:`));
  }

  assert.match(source, /sessionCookie:/);
  assert.match(source, /persistent:/);
  assert.doesNotMatch(source, /password:\s*[^\n]*example/i);
});
