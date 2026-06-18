import { AIModel } from '../types';
import { apiFetch } from './api';

export async function fetchAiModels(apiUrl: string): Promise<AIModel[]> {
  const response = await apiFetch(`${apiUrl}/ai/models`);
  if (!response.ok) throw new Error('模型列表读取失败');
  const data = await response.json();
  if (!Array.isArray(data)) throw new Error('模型列表格式错误');
  return data;
}

export async function streamAiChat(
  apiUrl: string,
  request: {
    modelId: string;
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    attachments?: Array<{ name: string; url: string; type: string }>;
    reasoning?: boolean;
  },
  onToken: (token: string) => void
) {
  const response = await apiFetch(`${apiUrl}/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request)
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `AI 请求失败 (${response.status})`);
  }
  if (!response.body) throw new Error('服务器未返回流式响应');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const frames = buffer.split(/\r?\n\r?\n/);
    buffer = frames.pop() || '';

    for (const frame of frames) {
      const event = frame
        .split(/\r?\n/)
        .find(line => line.startsWith('event:'))
        ?.slice(6)
        .trim();
      const data = frame
        .split(/\r?\n/)
        .filter(line => line.startsWith('data:'))
        .map(line => line.slice(5).trimStart())
        .join('\n');
      if (!data) continue;
      const payload = JSON.parse(data);
      if (event === 'token' && typeof payload.content === 'string') {
        onToken(payload.content);
      }
      if (event === 'error') {
        throw new Error(payload.error || 'AI 服务异常');
      }
    }
    if (done) break;
  }
}
