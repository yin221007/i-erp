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
const userManagerUrl = new URL('../../components/UserManager.tsx', import.meta.url);
const documentationUrl = new URL('../../components/Documentation.tsx', import.meta.url);
const safeUrlUrl = new URL('../../lib/safe-url.ts', import.meta.url);
const constantsUrl = new URL('../../constants.ts', import.meta.url);
const homeDashboardUrl = new URL('../../components/HomeDashboard.tsx', import.meta.url);
const projectListUrl = new URL('../../components/ProjectList.tsx', import.meta.url);
const projectMediaTimelineUrl = new URL(
  '../../components/ProjectMediaTimeline.tsx',
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

test('business records are not persisted in browser local storage', async () => {
  const source = await readFile(appUrl, 'utf8');

  for (const key of ['users', 'projects', 'clients', 'equipment', 'settings']) {
    assert.doesNotMatch(source, new RegExp(`localStorage\\.setItem\\(['\"]ierp_${key}`));
  }
  assert.match(source, /localStorage\.removeItem\(`ierp_\$\{key\}`\)/);
});

test('user passwords stay exact, masked, and optional during profile edits', async () => {
  const [loginSource, userManagerSource, constantsSource] = await Promise.all([
    readFile(loginUrl, 'utf8'),
    readFile(userManagerUrl, 'utf8'),
    readFile(constantsUrl, 'utf8')
  ]);

  assert.doesNotMatch(loginSource, /password\.trim\(\)/);
  assert.match(userManagerSource, /type="password"/);
  assert.match(userManagerSource, /留空则保持不变/);
  assert.doesNotMatch(constantsSource, /password:\s*['\"]password['\"]/);
});

test('external document URLs are protocol-checked and never embedded as live pages', async () => {
  const [documentationSource, safeUrlSource] = await Promise.all([
    readFile(documentationUrl, 'utf8'),
    readFile(safeUrlUrl, 'utf8')
  ]);

  assert.match(documentationSource, /normalizeExternalUrl/);
  assert.match(documentationSource, /外部网页不在系统内嵌加载/);
  assert.match(documentationSource, /sandbox=""/);
  assert.match(safeUrlSource, /\['http:', 'https:'\]/);
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
  assert.match(source, /cleanupToken/);
  assert.match(source, /method:\s*'DELETE'/);
});

test('payment cards avoid nesting buttons inside a synthetic button container', async () => {
  const source = await readFile(paymentDashboardUrl, 'utf8');

  assert.doesNotMatch(source, /<section[\s\S]{0,160}role="button"/);
});

test('payment cards open details from the whole card without disabled metric controls', async () => {
  const source = await readFile(paymentDashboardUrl, 'utf8');

  assert.match(
    source,
    /<section[\s\S]{0,220}onClick=\{\(\) => setSelectedPayment\(item\)\}/
  );
  assert.doesNotMatch(source, /disabled=\{!isClickable\}/);
  assert.match(source, /return isClickable \? \(/);
});

test('invoice preview is available only for invoiced payments or matched archives', async () => {
  const source = await readFile(paymentDashboardUrl, 'utf8');

  assert.match(
    source,
    /const canPreviewInvoice = \(item\.invoicedAmount \|\| 0\) > 0 \|\| invoiceArchives\.length > 0/
  );
  assert.match(source, /\{canPreviewInvoice && \(/);
  assert.doesNotMatch(source, /if \(\(payment\.invoicedAmount \|\| 0\) <= 0\) return/);
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

test('system settings manages DeepSeek and MiniMax through provider secret APIs', async () => {
  const source = await readFile(systemSettingsUrl, 'utf8');

  assert.match(source, /DeepSeek 官方 API/);
  assert.match(source, /MiniMax 官方 API/);
  assert.match(source, /\/ai\/settings\/\$\{providerId\}/);
  assert.match(source, /\/ai\/settings\/\$\{providerId\}\/test/);
  assert.match(source, /method:\s*'PUT'/);
  assert.match(source, /method:\s*'DELETE'/);
  assert.match(source, /method:\s*'POST'/);
  assert.match(source, /type="password"/);
  assert.match(source, /测试连接/);
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

test('preview feedback keeps personal headings, a complete status ring, and custom media folders', async () => {
  const [homeSource, projectListSource, mediaSource] = await Promise.all([
    readFile(homeDashboardUrl, 'utf8'),
    readFile(projectListUrl, 'utf8'),
    readFile(projectMediaTimelineUrl, 'utf8')
  ]);

  assert.match(homeSource, />\s*我的首页\s*</);
  assert.doesNotMatch(homeSource, /经营首页/);
  assert.match(homeSource, /projectStatusChart\.filter\(entry => entry\.value > 0\)/);
  assert.match(homeSource, /paddingAngle=\{projectStatusSlices\.length > 1 \? 3 : 0\}/);
  assert.match(homeSource, /cornerRadius=\{projectStatusSlices\.length > 1 \? 8 : 0\}/);
  assert.match(projectListSource, />\s*我的工程项目\s*</);
  assert.doesNotMatch(projectListSource, /全员项目概览/);
  assert.match(mediaSource, /新建影像文件夹（自定义命名）/);
  assert.match(mediaSource, /自定义文件夹名称/);
  assert.match(mediaSource, /placeholder=\{`建议：\$\{suggestedAlbumTitle\}`\}/);
});
