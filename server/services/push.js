import { createHmac } from 'node:crypto';

function pushError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function requiredString(value, name, maximumLength = 2_000) {
  const normalized = String(value || '').trim();
  if (!normalized || normalized.length > maximumLength) {
    throw pushError(`${name} is invalid`);
  }
  return normalized;
}

function officialWebhook(value, { hostname, pathPrefix, label }) {
  let url;
  try {
    url = new URL(requiredString(value, `${label} webhook`));
  } catch (error) {
    if (error.statusCode) throw error;
    throw pushError(`${label} webhook is invalid`);
  }
  if (
    url.protocol !== 'https:' ||
    url.hostname !== hostname ||
    !url.pathname.startsWith(pathPrefix)
  ) {
    throw pushError(`Only the official ${label} webhook is allowed`);
  }
  return url;
}

async function sendJson(fetchImpl, url, body) {
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) {
    throw pushError('Push provider rejected the message', 502);
  }
  return response;
}

async function sendPushPlus(fetchImpl, body) {
  const response = await sendJson(
    fetchImpl,
    'https://www.pushplus.plus/send',
    body
  );
  let result;
  try {
    result = await response.json();
  } catch {
    throw pushError('PushPlus returned an invalid response', 502);
  }
  if (result?.code !== 200) {
    const message = String(result?.msg || 'PushPlus rejected the message')
      .trim()
      .slice(0, 200);
    throw pushError(message || 'PushPlus rejected the message', 502);
  }
  return result;
}

export function createPushService({ fetchImpl = globalThis.fetch } = {}) {
  async function send(type, config = {}, message = {}) {
    const title = requiredString(message.title, 'Push title', 200);
    const content = requiredString(message.content, 'Push content', 20_000);
    if (type === 'PushPlus') {
      const token = requiredString(
        config.pushPlusToken,
        'PushPlus token',
        500
      );
      await sendPushPlus(fetchImpl, {
        token,
        title,
        content,
        template: 'txt'
      });
      return;
    }

    if (type === 'WeCom') {
      const url = officialWebhook(config.wecomWebhook, {
        hostname: 'qyapi.weixin.qq.com',
        pathPrefix: '/cgi-bin/webhook/send',
        label: 'WeCom'
      });
      await sendJson(fetchImpl, url, {
        msgtype: 'markdown',
        markdown: { content: `### ${title}\n${content}` }
      });
      return;
    }

    if (type === 'DingTalk') {
      const url = officialWebhook(config.dingtalkWebhook, {
        hostname: 'oapi.dingtalk.com',
        pathPrefix: '/robot/send',
        label: 'DingTalk'
      });
      const secret = String(config.dingtalkSecret || '').trim();
      if (secret) {
        const timestamp = Date.now();
        const signature = createHmac('sha256', secret)
          .update(`${timestamp}\n${secret}`)
          .digest('base64');
        url.searchParams.set('timestamp', String(timestamp));
        url.searchParams.set('sign', signature);
      }
      await sendJson(fetchImpl, url, {
        msgtype: 'markdown',
        markdown: { title, text: `### ${title}\n${content}` }
      });
      return;
    }

    throw pushError('Unsupported push provider');
  }

  return {
    async sendTest(type, config = {}) {
      await send(type, config, {
        title: 'i ERP 推送连接测试',
        content: `推送通道连接测试成功。\n测试时间：${new Date().toLocaleString('zh-CN')}`
      });
    },

    async sendConfigured(config = {}, message = {}) {
      const providers = [];
      if (String(config.pushPlusToken || '').trim()) providers.push('PushPlus');
      if (String(config.wecomWebhook || '').trim()) providers.push('WeCom');
      if (String(config.dingtalkWebhook || '').trim()) providers.push('DingTalk');
      await Promise.all(
        providers.map(type => send(type, config, message))
      );
    }
  };
}
