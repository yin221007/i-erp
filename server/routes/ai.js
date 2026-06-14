import express from 'express';
import { requireAuth } from '../auth/middleware.js';
import {
  createAiModel,
  listEnabledAiModels,
  updateAiModel
} from '../services/ai-models.js';
import { createAiGateway } from '../services/ai-gateway.js';
import {
  deleteSystemSecret,
  maskSecret,
  readSystemSecret,
  writeSystemSecret
} from '../services/system-secrets.js';

const DEEPSEEK_SECRET_NAME = 'deepseek_api_key';

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

export function createAiRouter({
  pool,
  deepseek,
  gateway,
  resolveApiKey,
  secretEncryptionKey
}) {
  if (!pool) throw new Error('pool is required');
  if (!deepseek) throw new Error('deepseek configuration is required');
  const router = express.Router();

  const resolveConfiguredKey = async () => {
    const storedKey = secretEncryptionKey
      ? await readSystemSecret(
          pool,
          DEEPSEEK_SECRET_NAME,
          secretEncryptionKey
        )
      : null;
    if (storedKey) return { apiKey: storedKey, source: 'database' };
    if (deepseek.apiKey) {
      return { apiKey: deepseek.apiKey, source: 'environment' };
    }
    return { apiKey: '', source: 'none' };
  };
  const gatewayApiKeyResolver = resolveApiKey ||
    (async () => (await resolveConfiguredKey()).apiKey);
  const chatGateway = gateway || createAiGateway({
    pool,
    config: deepseek,
    resolveApiKey: gatewayApiKeyResolver
  });

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
        const { apiKey, source } = await resolveConfiguredKey();
        res.json({
          configured: Boolean(apiKey),
          maskedKey: maskSecret(apiKey),
          source
        });
      } catch (error) {
        sendError(res, error);
      }
    }
  );

  router.put(
    '/ai/settings',
    requireAuth,
    requireAdministrator,
    async (req, res) => {
      try {
        const apiKey = String(req.body?.apiKey || '').trim();
        if (
          apiKey.length < 20 ||
          apiKey.length > 256 ||
          /\s/.test(apiKey)
        ) {
          return res.status(400).json({
            error: 'DeepSeek API key is invalid'
          });
        }
        if (!secretEncryptionKey) {
          throw new Error('System secret encryption is not configured');
        }

        await writeSystemSecret(
          pool,
          DEEPSEEK_SECRET_NAME,
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
    '/ai/settings',
    requireAuth,
    requireAdministrator,
    async (_req, res) => {
      try {
        await deleteSystemSecret(pool, DEEPSEEK_SECRET_NAME);
        res.status(204).end();
      } catch (error) {
        sendError(res, error);
      }
    }
  );

  router.post('/ai/chat', requireAuth, async (req, res) => {
    return chatGateway(req, res);
  });

  return router;
}
