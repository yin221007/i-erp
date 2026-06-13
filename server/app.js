import express from 'express';

export function createApp({ pool, config }) {
  if (!pool) throw new Error('pool is required');
  if (!config) throw new Error('config is required');

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '2mb' }));
  app.get('/health/live', (_req, res) => res.json({ status: 'ok' }));
  return app;
}
