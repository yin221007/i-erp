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
    throw pushError('Push provider rejected the test message', 502);
  }
}

export function createPushService({ fetchImpl = globalThis.fetch } = {}) {
  return {
    async sendTest(type, config = {}) {
      const title = 'i ERP 推送连接测试';
      const content = `推送通道连接测试成功。\n测试时间：${new Date().toLocaleString('zh-CN')}`;

      if (type === 'PushPlus') {
        const token = requiredString(
          config.pushPlusToken,
          'PushPlus token',
          500
        );
        await sendJson(fetchImpl, 'https://www.pushplus.plus/send', {
          token,
          title,
          content,
          template: 'html'
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
  };
}
