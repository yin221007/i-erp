import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const apiClientUrl = new URL('../../lib/api.ts', import.meta.url);
const pollingUrl = new URL('../../lib/polling.js', import.meta.url);
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
const pdfPreviewUrl = new URL('../../components/PdfPreview.tsx', import.meta.url);
const userManagerUrl = new URL('../../components/UserManager.tsx', import.meta.url);
const documentationUrl = new URL('../../components/Documentation.tsx', import.meta.url);
const safeUrlUrl = new URL('../../lib/safe-url.ts', import.meta.url);
const constantsUrl = new URL('../../constants.ts', import.meta.url);
const homeDashboardUrl = new URL('../../components/HomeDashboard.tsx', import.meta.url);
const projectSummaryUrl = new URL('../../components/ProjectSummary.tsx', import.meta.url);
const projectWorkflowUrl = new URL('../../components/ProjectWorkflow.tsx', import.meta.url);
const projectListUrl = new URL('../../components/ProjectList.tsx', import.meta.url);
const projectMediaTimelineUrl = new URL(
  '../../components/ProjectMediaTimeline.tsx',
  import.meta.url
);
const productionProgressUrl = new URL(
  '../../components/ProductionProgress.tsx',
  import.meta.url
);
const taskDetailModalUrl = new URL(
  '../../components/TaskDetailModal.tsx',
  import.meta.url
);
const approvalManagerUrl = new URL(
  '../../components/ApprovalManager.tsx',
  import.meta.url
);
const appVersionUrl = new URL('../../lib/version.ts', import.meta.url);

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

test('engineering archives use protected previews and explicit download URLs', async () => {
  const source = await readFile(engineeringArchivesUrl, 'utf8');

  assert.match(source, /download=1/);
  assert.match(source, /archiveId=/);
  assert.match(source, /onRenameArchive/);
  assert.match(source, /currentUser\.isDefaultAdmin === true/);
  assert.match(source, /item\.uploader === currentUser\.nickname/);
  assert.match(source, /扩展名保持不变/);
  assert.match(source, /const escapeCsvCell/);
  assert.match(source, /\^\[=\+\\-@\\t\\r\]/);
  assert.match(source, /React\.lazy\(\(\) => import\('\.\/PdfPreview'\)\)/);
  assert.match(source, /<PdfPreview src=\{previewItem\.url\}/);
  assert.doesNotMatch(source, /iframe src=\{previewItem\.url\}/);
  assert.match(source, /img src=\{previewItem\.url\}/);
  assert.match(source, /cleanupToken/);
  assert.match(source, /method:\s*'DELETE'/);
});

test('PDF archives and invoices use the same authenticated mobile viewer', async () => {
  const [previewSource, archiveSource, paymentSource] = await Promise.all([
    readFile(pdfPreviewUrl, 'utf8'),
    readFile(engineeringArchivesUrl, 'utf8'),
    readFile(paymentDashboardUrl, 'utf8')
  ]);

  assert.match(previewSource, /pdfjs-dist\/legacy\/build\/pdf\.mjs/);
  assert.match(previewSource, /pdf\.worker\.min\.mjs\?url/);
  assert.match(previewSource, /APP_VERSION/);
  assert.match(previewSource, /\?v=\$\{APP_VERSION\}/);
  assert.match(previewSource, /withCredentials:\s*true/);
  assert.match(previewSource, /isEvalSupported:\s*false/);
  assert.match(previewSource, /上一页/);
  assert.match(previewSource, /下一页/);
  assert.match(previewSource, /重新加载/);
  assert.match(archiveSource, /<PdfPreview src=\{previewItem\.url\}/);
  assert.match(paymentSource, /<PdfPreview src=\{invoicePreviewItem\.url\}/);
  assert.doesNotMatch(paymentSource, /iframe src=\{invoicePreviewItem\.url\}/);
});

test('process media stays out of engineering archives and dashboard archive activity', async () => {
  const [archiveSource, appSource, homeSource] = await Promise.all([
    readFile(engineeringArchivesUrl, 'utf8'),
    readFile(appUrl, 'utf8'),
    readFile(homeDashboardUrl, 'utf8')
  ]);

  assert.match(archiveSource, /archives\.filter\(item => item\.category !== 'Media'\)/);
  assert.doesNotMatch(archiveSource, /\{\s*id:\s*'Media',\s*label:/);
  assert.match(archiveSource, /regularArchives\.map/);
  assert.match(appSource, /archives=\{archives\.filter\(item => item\.category !== 'Media'\)\}/);
  assert.match(homeSource, /archives\.filter\(archive => archive\.category !== 'Media'\)/);
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

test('workflow attachments wait for archive persistence and archive polling stays fresh', async () => {
  const [appSource, taskDetailSource, pollingSource] = await Promise.all([
    readFile(appUrl, 'utf8'),
    readFile(taskDetailModalUrl, 'utf8'),
    readFile(pollingUrl, 'utf8')
  ]);

  assert.match(taskDetailSource, /const archiveSaved = await onAddArchive\(newArchive\)/);
  assert.match(taskDetailSource, /const projectSaved = await onUpdate\(/);
  assert.match(taskDetailSource, /onDeleteArchive\(fileId,\s*\{/);
  assert.match(pollingSource, /projects:\s*\['projects', 'archives'\]/);
  assert.match(appSource, /setSelectedProject\(current =>/);
  assert.doesNotMatch(appSource, /if \(!arc\) return;/);
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
  assert.match(homeSource, /innerRadius=\{50\}/);
  assert.match(homeSource, /outerRadius=\{74\}/);
  assert.match(homeSource, /paddingAngle=\{projectStatusSlices\.length > 1 \? 3 : 0\}/);
  assert.match(homeSource, /cornerRadius=\{projectStatusSlices\.length > 1 \? 8 : 0\}/);
  assert.match(projectListSource, />\s*我的工程项目\s*</);
  assert.doesNotMatch(projectListSource, /全员项目概览/);
  assert.match(mediaSource, /新建影像文件夹（自定义命名）/);
  assert.match(mediaSource, /自定义文件夹名称/);
  assert.match(mediaSource, /placeholder=\{`建议：\$\{suggestedAlbumTitle\}`\}/);
});

test('production list preserves source order and supports actual specs plus bulk deletion', async () => {
  const source = await readFile(productionProgressUrl, 'utf8');

  assert.match(source, /sortProductionUnitsBySourceOrder/);
  assert.match(source, /actualProductionSpec/);
  assert.match(source, /实际生产规格（可编辑）/);
  assert.match(source, /全选识别设备/);
  assert.match(source, /删除选中/);
  assert.match(source, /toggleAllItemSelection/);
  assert.doesNotMatch(source, /getSerialSortValue/);
});

test('approval history is persisted before closing and completed deletion approvals are retained', async () => {
  const [appSource, approvalSource] = await Promise.all([
    readFile(appUrl, 'utf8'),
    readFile(approvalManagerUrl, 'utf8')
  ]);

  assert.match(appSource, /actionExecutionStatus:\s*'Completed'/);
  assert.match(appSource, /!a\.actionExecutionStatus/);
  assert.match(appSource, /currentUser\.isDefaultAdmin/);
  assert.match(appSource, /\['archive',\s*'archives'\]\.includes\(relatedResource\)/);
  assert.doesNotMatch(
    appSource,
    /approvedDeletionRequests[\s\S]{0,2600}onDeleteApproval\(req\.id\)/
  );
  assert.match(appSource, /versions:\s*\[\{\s*version:\s*1/);
  assert.match(approvalSource, /await onAddApproval/);
  assert.match(approvalSource, /await onUpdateApproval/);
  assert.match(approvalSource, /outcomes:\s*\[\.\.\.\(version\.outcomes \|\| \[\]\)\]/);
  assert.match(approvalSource, /if \(saved\) setIsModalOpen\(false\)/);
});

test('dashboard chart tooltips are readable, hover-only and do not intercept clicks', async () => {
  const [source, projectSummarySource] = await Promise.all([
    readFile(homeDashboardUrl, 'utf8'),
    readFile(projectSummaryUrl, 'utf8')
  ]);

  assert.match(source, /const DASHBOARD_TOOLTIP_PROPS/);
  assert.match(source, /trigger:\s*'hover'/);
  assert.match(source, /itemStyle:\s*\{[\s\S]*?color:\s*'#f8fafc'/);
  assert.match(source, /labelStyle:\s*\{[\s\S]*?color:\s*'#cbd5e1'/);
  assert.match(source, /wrapperStyle:\s*\{[\s\S]*?pointerEvents:\s*'none'/);
  assert.equal(
    (source.match(/<Tooltip\s+\{\.\.\.DASHBOARD_TOOLTIP_PROPS\}/g) || []).length,
    5
  );
  assert.match(source, /\[\s*`\$\{value\} 台`,\s*'设备数量'\s*\]/);
  assert.match(source, /\[\s*`\$\{value\} 项`,\s*'风险数量'\s*\]/);
  assert.match(source, /\[\s*`\$\{value\} 条`,\s*'动态数量'\s*\]/);
  assert.doesNotMatch(source, /<Tooltip \{\.\.\.DASHBOARD_TOOLTIP_PROPS\}\s*\/>/);
  assert.match(projectSummarySource, /\[\s*`\$\{value\} 个节点`,\s*'节点数量'\s*\]/);
  assert.match(projectSummarySource, />总进度<\/p>/);
  assert.doesNotMatch(projectSummarySource, /<RechartsTooltip\s*\/>/);
});

test('project media uses bounded concurrency, progress metrics, optimized photos and resumable video chunks', async () => {
  const [mediaSource, appSource] = await Promise.all([
    readFile(projectMediaTimelineUrl, 'utf8'),
    readFile(appUrl, 'utf8')
  ]);

  assert.match(mediaSource, /const UPLOAD_CONCURRENCY = 2/);
  assert.match(mediaSource, /speedBytesPerSecond/);
  assert.match(mediaSource, /remainingSeconds/);
  assert.match(mediaSource, /MAX_CHUNK_ATTEMPTS = 3/);
  assert.match(mediaSource, /\/upload\/chunks\/init/);
  assert.match(mediaSource, /2560/);
  assert.match(mediaSource, /0\.85/);
  assert.match(mediaSource, /优化照片（推荐）/);
  assert.match(appSource, /\/archives\/batch/);
});

test('project media uses thumbnails, zero-preload video cards and batched rendering', async () => {
  const mediaSource = await readFile(projectMediaTimelineUrl, 'utf8');

  assert.match(mediaSource, /getProjectMediaThumbnailUrl\(item\.url,\s*640\)/);
  assert.match(mediaSource, /getProjectMediaThumbnailUrl\(cover\?\.url,\s*640\)/);
  assert.match(mediaSource, /loading="lazy"/);
  assert.match(mediaSource, /decoding="async"/);
  assert.match(mediaSource, /MEDIA_RENDER_BATCH_SIZE = 24/);
  assert.match(mediaSource, /visibleActiveAlbumItems\.map\(renderMediaCard\)/);
  assert.match(mediaSource, /再加载/);
  assert.equal((mediaSource.match(/<video/g) || []).length, 1);
  assert.equal((mediaSource.match(/preload="metadata"/g) || []).length, 1);
});

test('workflow cards distinguish active and completed states with blue and green', async () => {
  const [workflowSource, taskDetailSource] = await Promise.all([
    readFile(projectWorkflowUrl, 'utf8'),
    readFile(taskDetailModalUrl, 'utf8')
  ]);

  assert.match(
    workflowSource,
    /TaskStatus\.IN_PROGRESS:[\s\S]{0,120}border-l-blue-500 hover:border-l-blue-500/
  );
  assert.match(
    workflowSource,
    /TaskStatus\.COMPLETED:[\s\S]{0,120}border-l-emerald-500 hover:border-l-emerald-500/
  );
  assert.match(
    workflowSource,
    /TaskStatus\.IN_PROGRESS:[\s\S]{0,100}bg-blue-500/
  );
  assert.match(
    workflowSource,
    /TaskStatus\.COMPLETED:[\s\S]{0,100}bg-emerald-500/
  );
  assert.match(workflowSource, /text-blue-700 dark:text-blue-300/);
  assert.match(workflowSource, /text-emerald-700 dark:text-emerald-300/);
  assert.match(
    taskDetailSource,
    /TaskStatus\.IN_PROGRESS[\s\S]{0,180}active: 'bg-blue-600 text-white border-blue-600'/
  );
});

test('system settings derives and displays the package version', async () => {
  const [settingsSource, versionSource] = await Promise.all([
    readFile(systemSettingsUrl, 'utf8'),
    readFile(appVersionUrl, 'utf8')
  ]);

  assert.match(settingsSource, /当前版本 v\{APP_VERSION\}/);
  assert.match(versionSource, /packageMetadata\.version/);
});
