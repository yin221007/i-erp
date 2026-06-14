import express from 'express';
import { requireAuth } from '../auth/middleware.js';
import {
  createAiModel,
  listEnabledAiModels,
  updateAiModel
} from '../services/ai-models.js';
import { createAiGateway } from '../services/ai-gateway.js';
import {
  AI_PROVIDER_IDS,
  getAiProvider
} from '../services/ai-providers.js';
import {
  deleteSystemSecret,
  maskSecret,
  readSystemSecret,
  writeSystemSecret
} from '../services/system-secrets.js';

function requireAdministrator(req, res, next) {
  if (
    req.authUser?.isDefaultAdmin !== true &&
    req.authUser?.role !== 'Admin'
  ) {
    return res.status(403).json({ error: 'Administrator access required' });
  }
  next();
}

function sendError(res, error) {
  res.status(error.statusCode || 500).json({
    error: error.statusCode ? error.message : 'AI operation failed'
  });
}

function routeError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function validateApiKey(value, provider) {
  const apiKey = String(value || '').trim();
  if (
    apiKey.length < 20 ||
    apiKey.length > 256 ||
    /\s/.test(apiKey)
  ) {
    throw routeError(`${provider.displayName} API key is invalid`, 400);
  }
  return apiKey;
}

export function createAiRouter({
  pool,
  providers,
  gatewayConfig,
  deepseek,
  gateway,
  resolveApiKey,
  secretEncryptionKey,
  fetchImpl
}) {
  if (!pool) throw new Error('pool is required');
  const router = express.Router();
  const providerConfigs = {
    deepseek: providers?.deepseek || deepseek || {},
    minimax: providers?.minimax || {}
  };
  const effectiveGatewayConfig = gatewayConfig || deepseek || {};
  const effectiveFetch = fetchImpl ||
    effectiveGatewayConfig.fetchImpl ||
    globalThis.fetch;

  const resolveConfiguredKey = async providerId => {
    const provider = getAiProvider(providerId);
    if (!provider) throw routeError('AI provider not found', 404);
    const storedKey = secretEncryptionKey
      ? await readSystemSecret(
          pool,
          provider.secretName,
          secretEncryptionKey
        )
      : null;
    if (storedKey) return { apiKey: storedKey, source: 'database' };
    const environmentKey =
      String(providerConfigs[provider.id]?.apiKey || '').trim();
    if (environmentKey) {
      return { apiKey: environmentKey, source: 'environment' };
    }
    return { apiKey: '', source: 'none' };
  };
  const gatewayApiKeyResolver = resolveApiKey ||
    (async providerId => (await resolveConfiguredKey(providerId)).apiKey);
  const chatGateway = gateway || createAiGateway({
    pool,
    config: effectiveGatewayConfig,
    resolveApiKey: gatewayApiKeyResolver,
    fetchImpl: effectiveFetch
  });

  const providerFromRequest = req => {
    const provider = getAiProvider(req.params.provider);
    if (!provider) throw routeError('AI provider not found', 404);
    return provider;
  };

  const providerStatus = async providerId => {
    const { apiKey, source } = await resolveConfiguredKey(providerId);
    return {
      configured: Boolean(apiKey),
      maskedKey: maskSecret(apiKey),
      source
    };
  };

  router.get('/ai/models', requireAuth, async (_req, res) => {
    try {
      res.json(await listEnabledAiModels(pool));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post(
    '/ai/models',
    requireAuth,
    requireAdministrator,
    async (req, res) => {
      try {
        res.status(201).json(await createAiModel(pool, req.body));
      } catch (error) {
        sendError(res, error);
      }
    }
  );

  router.put(
    '/ai/models/:id',
    requireAuth,
    requireAdministrator,
    async (req, res) => {
      try {
        res.json(await updateAiModel(pool, req.params.id, req.body));
      } catch (error) {
        sendError(res, error);
      }
    }
  );

  router.get(
    '/ai/settings',
    requireAuth,
    requireAdministrator,
    async (_req, res) => {
      try {
        const statuses = await Promise.all(
          AI_PROVIDER_IDS.map(async providerId => [
            providerId,
            await providerStatus(providerId)
          ])
        );
        res.json({ providers: Object.fromEntries(statuses) });
      } catch (error) {
        sendError(res, error);
      }
    }
  );

  router.put(
    '/ai/settings/:provider',
    requireAuth,
    requireAdministrator,
    async (req, res) => {
      try {
        const provider = providerFromRequest(req);
        const apiKey = validateApiKey(req.body?.apiKey, provider);
        if (!secretEncryptionKey) {
          throw new Error('System secret encryption is not configured');
        }

        await writeSystemSecret(
          pool,
          provider.secretName,
          apiKey,
          secretEncryptionKey
        );
        res.json({
          configured: true,
          maskedKey: maskSecret(apiKey),
          source: 'database'
        });
      } catch (error) {
        sendError(res, error);
      }
    }
  );

  router.delete(
    '/ai/settings/:provider',
    requireAuth,
    requireAdministrator,
    async (req, res) => {
      try {
        const provider = providerFromRequest(req);
        await deleteSystemSecret(pool, provider.secretName);
        res.status(204).end();
      } catch (error) {
        sendError(res, error);
      }
    }
  );

  router.post(
    '/ai/settings/:provider/test',
    requireAuth,
    requireAdministrator,
    async (req, res) => {
      let timeout;
      try {
        const provider = providerFromRequest(req);
        const suppliedKey = String(req.body?.apiKey || '').trim();
        const apiKey = suppliedKey
          ? validateApiKey(suppliedKey, provider)
          : (await resolveConfiguredKey(provider.id)).apiKey;
        if (!apiKey) {
          throw routeError('AI service is not configured', 503);
        }

        const controller = new AbortController();
        const timeoutMilliseconds = Math.min(
          Number(effectiveGatewayConfig.requestTimeoutMilliseconds) || 10_000,
          10_000
        );
        timeout = setTimeout(() => {
          controller.abort(new Error('AI connection test timed out'));
        }, timeoutMilliseconds);
        const upstream = await effectiveFetch(
          `${provider.baseUrl}/chat/completions`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(provider.buildConnectionTestBody()),
            signal: controller.signal
          }
        );
        if (!upstream.ok) {
          throw routeError('AI provider rejected the connection test', 502);
        }
        res.json({ ok: true });
      } catch (error) {
        if (error?.name === 'AbortError') {
          sendError(res, routeError('AI connection test timed out', 504));
        } else {
          sendError(res, error);
        }
      } finally {
        clearTimeout(timeout);
      }
    }
  );

  router.post('/ai/chat', requireAuth, async (req, res) => {
    return chatGateway(req, res);
  });

  return router;
}
