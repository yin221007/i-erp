import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const apiClientUrl = new URL('../../lib/api.ts', import.meta.url);
const appUrl = new URL('../../App.tsx', import.meta.url);
const loginUrl = new URL('../../components/Login.tsx', import.meta.url);
const systemSettingsUrl = new URL(
  '../../components/SystemSettings.tsx',
  import.meta.url
);

test('API client includes cookies and handles unauthorized sessions centrally', async () => {
  const source = await readFile(apiClientUrl, 'utf8');

  assert.match(source, /credentials:\s*'include'/);
  assert.match(source, /response\.status === 401/);
  assert.match(source, /unauthorizedHandler/);
  assert.doesNotMatch(source, /x-user-id/i);
});

test('application restores the session from the backend and never authenticates locally', async () => {
  const source = [
    await readFile(appUrl, 'utf8'),
    await readFile(loginUrl, 'utf8')
  ].join('\n');

  assert.match(source, /\/auth\/me/);
  assert.match(source, /\/auth\/login/);
  assert.doesNotMatch(source, /x-user-id/i);
  assert.doesNotMatch(source, /user\.password\s*===/);
  assert.doesNotMatch(source, /ierp_current_user_id/);
});

test('the frontend does not offer destructive browser backup restore', async () => {
  const [appSource, settingsSource] = await Promise.all([
    readFile(appUrl, 'utf8'),
    readFile(systemSettingsUrl, 'utf8')
  ]);

  assert.doesNotMatch(appSource, /\/backup\/import/);
  assert.doesNotMatch(settingsSource, /onImportBackup|accept="\.json"/);
});
