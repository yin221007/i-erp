import express from 'express';
import {
  authenticateSession,
  enforceOrigin
} from './auth/middleware.js';
import { createAuthRouter } from './routes/auth.js';

export function createApp({ pool, config }) {
  if (!pool) throw new Error('pool is required');
  if (!config) throw new Error('config is required');

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy || 1);
  app.use(express.json({ limit: '2mb' }));
  app.use(authenticateSession({ pool }));
  app.use(enforceOrigin({ publicOrigins: config.publicOrigins }));
  app.get('/health/live', (_req, res) => res.json({ status: 'ok' }));
  app.use('/auth', createAuthRouter({ pool }));
  return app;
}
