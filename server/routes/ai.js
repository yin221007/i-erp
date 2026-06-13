import express from 'express';
import { requireAuth } from '../auth/middleware.js';
import {
  createAiModel,
  listEnabledAiModels,
  updateAiModel
} from '../services/ai-models.js';

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

export function createAiRouter({ pool, deepseek, gateway }) {
  if (!pool) throw new Error('pool is required');
  if (!deepseek) throw new Error('deepseek configuration is required');
  const router = express.Router();

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

  router.post('/ai/chat', requireAuth, async (req, res) => {
    if (!gateway) {
      return res.status(503).json({ error: 'AI gateway is not configured' });
    }
    return gateway(req, res);
  });

  return router;
}
