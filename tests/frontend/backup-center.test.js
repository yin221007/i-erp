import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const settingsUrl = new URL(
  '../../components/SystemSettings.tsx',
  import.meta.url
);
const typesUrl = new URL('../../types.ts', import.meta.url);

test('administrator backup center loads catalog and job status', async () => {
  const source = await readFile(settingsUrl, 'utf8');

  assert.match(source, /\/backup\/catalog/);
  assert.match(source, /\/backup\/jobs/);
  assert.match(source, /setInterval/);
  assert.match(source, /BackupSnapshot/);
  assert.match(source, /MaintenanceJob/);
});

test('manual backup and restore require guarded confirmation fields', async () => {
  const source = await readFile(settingsUrl, 'utf8');

  assert.match(source, /operation:\s*'backup'/);
  assert.match(source, /operation:\s*'restore'/);
  assert.match(source, /currentPassword/);
  assert.match(source, /type="password"/);
  assert.match(source, /confirmation/);
  assert.match(source, /maintenanceAcknowledged/);
  assert.match(source, /selectedBackup\.id/);
});

test('password fields are cleared after requests and modal closure', async () => {
  const source = await readFile(settingsUrl, 'utf8');

  assert.match(source, /setMaintenancePassword\(''\)/);
  assert.match(source, /closeMaintenanceModal/);
  assert.match(source, /finally/);
});

test('backup center never accepts a browser backup file upload', async () => {
  const source = await readFile(settingsUrl, 'utf8');

  assert.doesNotMatch(source, /\/backup\/import/);
  assert.doesNotMatch(source, /accept=["']\.(?:json|sql|gz|zip)/);
  assert.doesNotMatch(source, /name=["']backup/);
});

test('backup and maintenance API types are explicit', async () => {
  const source = await readFile(typesUrl, 'utf8');

  assert.match(source, /interface BackupSnapshot/);
  assert.match(source, /interface MaintenanceJob/);
  assert.match(source, /'pending' \| 'running' \| 'completed' \| 'failed'/);
});
