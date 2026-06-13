import express from 'express';
import { requireAuth } from '../auth/middleware.js';

function requireAdministrator(req, res, next) {
  if (
    req.authUser?.isDefaultAdmin !== true &&
    req.authUser?.role !== 'Admin'
  ) {
    return res.status(403).json({ error: 'Administrator access required' });
  }
  next();
}

function maintenanceOnly(_req, res) {
  res.status(410).json({
    error: 'Browser backup operations are disabled',
    backupProcedure: 'scripts/backup.sh',
    restoreProcedure: 'scripts/restore-drill.sh'
  });
}

export function createBackupRouter() {
  const router = express.Router();
  router.get('/backup/export', requireAuth, requireAdministrator, maintenanceOnly);
  router.post('/backup/import', requireAuth, requireAdministrator, maintenanceOnly);
  return router;
}
