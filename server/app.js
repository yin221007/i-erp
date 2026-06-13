import express from 'express';
import {
  authenticateSession,
  enforceOrigin
} from './auth/middleware.js';
import { createAuthRouter } from './routes/auth.js';
import { createAiRouter } from './routes/ai.js';
import { createBackupRouter } from './routes/backup.js';
import { createEmailRouter } from './routes/email.js';
import { createHealthRouter } from './routes/health.js';
import { createPushRouter } from './routes/push.js';
import { createRecycleBinRouter } from './routes/recycle-bin.js';
import { createResourceRouter } from './routes/resources.js';
import { createUploadsRouter } from './routes/uploads.js';
import { createMailService } from './services/mail.js';
import { createPushService } from './services/push.js';

export function createApp({ pool, config, pushService = createPushService() }) {
  if (!pool) throw new Error('pool is required');
  if (!config) throw new Error('config is required');

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy || 1);
  app.use(express.json({ limit: '2mb' }));
  app.use(createHealthRouter({ pool }));
  app.use(authenticateSession({ pool }));
  app.use(enforceOrigin({ publicOrigins: config.publicOrigins }));
  app.use('/auth', createAuthRouter({ pool }));
  if (config.deepseek) {
    app.use(createAiRouter({
      pool,
      deepseek: config.deepseek,
      secretEncryptionKey: config.secretEncryptionKey
    }));
  }
  if (config.uploads) {
    app.use(createUploadsRouter({
      ...config.uploads,
      pool
    }));
  }
  if (config.mail) {
    app.use(createEmailRouter({
      pool,
      mailService: createMailService(config.mail)
    }));
  }
  app.use(createPushRouter({ pushService }));
  app.use(createBackupRouter());
  app.use(createRecycleBinRouter({ pool }));
  app.use(createResourceRouter({ pool }));
  return app;
}
