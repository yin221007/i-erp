import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { findEnabledAiModel } from './ai-models.js';
import { getAiProvider } from './ai-providers.js';

const SYSTEM_INSTRUCTION =
  '你是资深的商用厨房设备工程专家。请依据中国现行规范、工程实践和用户提供的上下文，给出专业、准确、可执行的答复；不确定时明确说明。';

function requestError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizeMessages(input, attachments = []) {
  if (!Array.isArray(input) || input.length === 0 || input.length > 50) {
    throw requestError('Conversation is invalid');
  }

  let totalCharacters = 0;
  const messages = input.map(message => {
    if (
      !message ||
      !['user', 'assistant'].includes(message.role) ||
      typeof message.content !== 'string' ||
      message.content.length === 0 ||
      message.content.length > 50_000
    ) {
      throw requestError('Conversation message is invalid');
    }
    totalCharacters += message.content.length;
    return {
      role: message.role,
      content: message.content
    };
  });
  if (totalCharacters > 500_000) {
    throw requestError('Conversation is too large', 413);
  }

  if (attachments.length > 0) {
    if (!Array.isArray(attachments) || attachments.length > 10) {
      throw requestError('Attachments are invalid');
    }
    const references = attachments.map(attachment => {
      const name = String(attachment?.name || '').slice(0, 200);
      const url = String(attachment?.url || '').slice(0, 500);
      const type = String(attachment?.type || '').slice(0, 100);
      if (!name || !url.startsWith('/api/uploads/')) {
        throw requestError('Attachment reference is invalid');
      }
      return `- ${name} (${type || 'unknown'}): ${url}`;
    });
    const lastUserMessage = [...messages]
      .reverse()
      .find(message => message.role === 'user');
    if (!lastUserMessage) throw requestError('A user message is required');
    lastUserMessage.content +=
      `\n\n已上传的服务器文件引用（仅供上下文识别，不代表已解析文件内容）：\n${references.join('\n')}`;
  }

  return [
    { role: 'system', content: SYSTEM_INSTRUCTION },
    ...messages
  ];
}

function pseudonymousUserId(userId) {
  return createHash('sha256').update(String(userId)).digest('hex');
}

async function startUsage(pool, userId, modelId) {
  const id = randomUUID();
  const startedAt = new Date();
  await pool.query(
    `INSERT INTO ai_usage (
      id,
      user_id,
      model_id,
      prompt_tokens,
      completion_tokens,
      status,
      error_code,
      started_at,
      completed_at
    ) VALUES (?, ?, ?, 0, 0, ?, NULL, ?, NULL)`,
    [id, userId, modelId, 'started', startedAt]
  );
  return id;
}

async function finishUsage(
  pool,
  id,
  {
    promptTokens = 0,
    completionTokens = 0,
    status,
    errorCode = null
  }
) {
  await pool.query(
    `UPDATE ai_usage SET
      prompt_tokens = ?,
      completion_tokens = ?,
      status = ?,
      error_code = ?,
      completed_at = ?
    WHERE id = ?`,
    [
      promptTokens,
      completionTokens,
      status,
      errorCode,
      new Date(),
      id
    ]
  );
}

async function writeEvent(res, event, data) {
  if (res.destroyed) return;
  if (!res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)) {
    await once(res, 'drain');
  }
}

async function parseUpstreamStream(body, onEvent) {
  if (!body?.getReader) throw new Error('Provider stream is unavailable');
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let doneReceived = false;

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const frames = buffer.split(/\r?\n\r?\n/);
    buffer = frames.pop() || '';

    for (const frame of frames) {
      const data = frame
        .split(/\r?\n/)
        .filter(line => line.startsWith('data:'))
        .map(line => line.slice(5).trimStart())
        .join('\n');
      if (!data) continue;
      if (data === '[DONE]') {
        doneReceived = true;
        continue;
      }
      let chunk;
      try {
        chunk = JSON.parse(data);
      } catch {
        continue;
      }
      await onEvent(chunk);
    }
    if (done) break;
  }
  if (!doneReceived) throw new Error('Provider stream ended unexpectedly');
}

export function createAiGateway({
  pool,
  config,
  resolveApiKey = async () => config.apiKey,
  fetchImpl = config.fetchImpl || globalThis.fetch
}) {
  const activeRequests = new Map();
  const requestTimeoutMilliseconds =
    config.requestTimeoutMilliseconds || 90_000;
  const maximumConcurrentRequests =
    config.maximumConcurrentRequests || 2;

  return async function aiGateway(req, res) {
    const userId = req.authUser.id;
    const activeCount = activeRequests.get(userId) || 0;
    if (activeCount >= maximumConcurrentRequests) {
      return res.status(429).json({ error: 'Too many concurrent AI requests' });
    }
    activeRequests.set(userId, activeCount + 1);

    let usageId;
    let promptTokens = 0;
    let completionTokens = 0;
    let responseFinished = false;
    let timedOut = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort(new Error('AI request timed out'));
    }, requestTimeoutMilliseconds);
    res.on('close', () => {
      if (!responseFinished && !controller.signal.aborted) {
        controller.abort(new Error('Client disconnected'));
      }
    });

    try {
      const modelId = String(req.body?.modelId || '');
      const model = await findEnabledAiModel(pool, modelId);
      if (!model) throw requestError('AI model is disabled or unavailable');
      const provider = getAiProvider(model.provider);
      if (!provider) {
        throw requestError('AI provider is unavailable', 503);
      }
      const apiKey = await resolveApiKey(provider.id);
      if (!apiKey) {
        throw requestError('AI service is not configured', 503);
      }
      const messages = normalizeMessages(
        req.body?.messages,
        req.body?.attachments || []
      );
      const requestedMaxTokens = Number(req.body?.maxOutputTokens);
      const maxTokens = Number.isInteger(requestedMaxTokens)
        ? Math.min(Math.max(requestedMaxTokens, 1), model.maxOutputTokens)
        : Math.min(8_192, model.maxOutputTokens);
      const reasoning = model.reasoning && req.body?.reasoning !== false;

      usageId = await startUsage(pool, userId, model.id);
      const upstream = await fetchImpl(
        `${provider.baseUrl}/chat/completions`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            Accept: 'text/event-stream'
          },
          body: JSON.stringify(provider.buildRequestBody({
            model: model.modelId,
            messages,
            maxTokens,
            reasoning,
            userId: pseudonymousUserId(userId)
          })),
          signal: controller.signal
        }
      );
      if (!upstream.ok) {
        const error = new Error('AI provider request failed');
        error.errorCode = `provider_${upstream.status}`;
        throw error;
      }

      res.status(200);
      res.set({
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no'
      });
      res.flushHeaders();

      const providerState = {};
      await parseUpstreamStream(upstream.body, async chunk => {
        const delta = provider.extractDelta(chunk, providerState);
        if (delta.reasoning) {
          await writeEvent(res, 'reasoning', {
            content: delta.reasoning
          });
        }
        if (delta.content) {
          await writeEvent(res, 'token', { content: delta.content });
        }
        if (chunk.usage) {
          promptTokens = Number(chunk.usage.prompt_tokens) || 0;
          completionTokens = Number(chunk.usage.completion_tokens) || 0;
        }
      });

      await finishUsage(pool, usageId, {
        promptTokens,
        completionTokens,
        status: 'success'
      });
      await writeEvent(res, 'done', {
        usage: { promptTokens, completionTokens }
      });
      responseFinished = true;
      res.end();
    } catch (error) {
      const status = timedOut
        ? 'timeout'
        : controller.signal.aborted
          ? 'aborted'
          : 'error';
      if (usageId) {
        try {
          await finishUsage(pool, usageId, {
            promptTokens,
            completionTokens,
            status,
            errorCode: timedOut ? 'timeout' : error.errorCode || null
          });
        } catch {}
      }

      const statusCode = timedOut ? 504 : error.statusCode || 502;
      if (!res.headersSent) {
        res.status(statusCode).json({
          error: statusCode === 504
            ? 'AI request timed out'
            : error.statusCode
              ? error.message
              : 'AI provider request failed'
        });
      } else {
        await writeEvent(res, 'error', {
          error: timedOut
            ? 'AI request timed out'
            : 'AI provider request failed'
        });
        responseFinished = true;
        res.end();
      }
    } finally {
      clearTimeout(timeout);
      activeRequests.set(
        userId,
        Math.max(0, (activeRequests.get(userId) || 1) - 1)
      );
      if (activeRequests.get(userId) === 0) activeRequests.delete(userId);
    }
  };
}
