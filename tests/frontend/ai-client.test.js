import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const aiCenterUrl = new URL('../../components/AICenter.tsx', import.meta.url);
const projectSummaryUrl = new URL(
  '../../components/ProjectSummary.tsx',
  import.meta.url
);
const systemSettingsUrl = new URL(
  '../../components/SystemSettings.tsx',
  import.meta.url
);

test('browser AI features use only the backend gateway', async () => {
  const source = [
    await readFile(aiCenterUrl, 'utf8'),
    await readFile(projectSummaryUrl, 'utf8')
  ].join('\n');

  assert.match(source, /fetchAiModels/);
  assert.match(source, /streamAiChat/);
  assert.doesNotMatch(source, /GoogleGenAI|process\.env\.API_KEY/);
  assert.doesNotMatch(source, /Authorization|api\.siliconflow|api\.deepseek/);
  assert.doesNotMatch(source, /localStorage.*ai_key|base64Data/);
});

test('browser AI settings never contain provider hosts or authorization headers', async () => {
  const source = await readFile(systemSettingsUrl, 'utf8');

  assert.doesNotMatch(
    source,
    /api\.deepseek\.com|api\.minimaxi\.com|Authorization/
  );
});

test('AI center copy remains provider-neutral when multiple providers are enabled', async () => {
  const source = await readFile(aiCenterUrl, 'utf8');

  assert.match(source, /系统托管的官方 AI API/);
  assert.match(source, /selectedModel\?\.displayName \|\| 'AI 模型'/);
  assert.doesNotMatch(source, /统一使用系统托管的 DeepSeek 官方 API/);
});
