import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const aiCenterUrl = new URL('../../components/AICenter.tsx', import.meta.url);
const projectSummaryUrl = new URL(
  '../../components/ProjectSummary.tsx',
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
