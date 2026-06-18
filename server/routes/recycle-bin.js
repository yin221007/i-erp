import express from 'express';
import { requireAuth } from '../auth/middleware.js';
import {
  emptyRecycleBin,
  permanentlyDeleteRecycleItem,
  restoreRecycleItem
} from '../services/recycle-bin.js';

function requireAdministrator(req, res, next) {
  if (
    req.authUser?.isDefaultAdmin !== true &&
    req.authUser?.role !== 'Admin'
  ) {
    return res.status(403).json({ error: 'Administrator access required' });
  }
  next();
}

function sendServiceError(res, error) {
  const status = error.statusCode || 500;
  res.status(status).json({
    error: status >= 500 ? 'Recycle operation failed' : error.message
  });
}

export function createRecycleBinRouter({ pool }) {
  const router = express.Router();

  router.post(
    '/recycle_bin/restore/:id',
    requireAuth,
    async (req, res) => {
      try {
        const restored = await restoreRecycleItem(pool, req.params.id);
        res.json({ success: true, record: restored });
      } catch (error) {
        sendServiceError(res, error);
      }
    }
  );

  router.delete(
    '/recycle_bin/empty/all',
    requireAuth,
    requireAdministrator,
    async (_req, res) => {
      try {
        const deleted = await emptyRecycleBin(pool);
        res.json({ success: true, deleted });
      } catch (error) {
        sendServiceError(res, error);
      }
    }
  );

  router.delete(
    '/recycle_bin/:id',
    requireAuth,
    requireAdministrator,
    async (req, res) => {
      try {
        const deleted = await permanentlyDeleteRecycleItem(pool, req.params.id);
        if (!deleted) return res.status(404).json({ error: 'Recycle item not found' });
        res.json({ success: true });
      } catch (error) {
        sendServiceError(res, error);
      }
    }
  );

  return router;
}
