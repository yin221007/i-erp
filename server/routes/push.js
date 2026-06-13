import express from 'express';
import { requireAuth } from '../auth/middleware.js';

export function createPushRouter({ pushService }) {
  const router = express.Router();

  router.post('/push/test', requireAuth, async (req, res) => {
    try {
      await pushService.sendTest(req.body?.type, req.body?.config);
      res.json({ success: true });
    } catch (error) {
      res.status(error.statusCode || 502).json({
        error: error.statusCode ? error.message : 'Push test failed'
      });
    }
  });

  return router;
}
