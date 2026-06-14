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
const engineeringArchivesUrl = new URL(
  '../../components/EngineeringArchives.tsx',
  import.meta.url
);
const paymentDashboardUrl = new URL(
  '../../components/PaymentDashboard.tsx',
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

test('engineering archives use inline preview URLs and explicit download URLs', async () => {
  const source = await readFile(engineeringArchivesUrl, 'utf8');

  assert.match(source, /download=1/);
  assert.match(source, /iframe src=\{previewItem\.url\}/);
  assert.match(source, /img src=\{previewItem\.url\}/);
});

test('payment summary cards use visible semantic hover colors', async () => {
  const source = await readFile(paymentDashboardUrl, 'utf8');

  for (const className of [
    'hover:bg-slate-50',
    'hover:bg-emerald-50',
    'hover:bg-orange-50',
    'hover:bg-primary-50'
  ]) {
    assert.equal(source.includes(className), true, `${className} is missing`);
  }
  assert.doesNotMatch(source, /hover:bg-primary-50\/20/);
});

test('user presence uses the self-service heartbeat instead of writing users', async () => {
  const source = await readFile(appUrl, 'utf8');

  assert.match(source, /\/auth\/heartbeat/);
  assert.doesNotMatch(
    source,
    /syncToBackend\('users',\s*'PUT',\s*currentU,\s*currentU\.id\)/
  );
});

test('system settings manages DeepSeek through the dedicated secret API', async () => {
  const source = await readFile(systemSettingsUrl, 'utf8');

  assert.match(source, /\/ai\/settings/);
  assert.match(source, /method:\s*'PUT'/);
  assert.match(source, /method:\s*'DELETE'/);
  assert.match(source, /type="password"/);
  assert.match(source, /DeepSeek/);
  assert.doesNotMatch(source, /localSettings[^;\n]*apiKey/);
});

test('backup center displays the twice-daily schedule and retention policy', async () => {
  const source = await readFile(systemSettingsUrl, 'utf8');

  assert.match(source, /每天 2 次/);
  assert.match(source, /每日 6 份/);
  assert.match(source, /升级 3 份/);
  assert.match(source, /手动 3 份/);
  assert.match(source, /06:30/);
  assert.match(source, /18:30/);
});

test('application branding uses the public logo endpoint before login', async () => {
  const source = await readFile(appUrl, 'utf8');

  assert.match(source, /\/branding\/logo/);
  assert.match(source, /logoUrl=\{displayLogoUrl\}/);
});
