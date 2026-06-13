import express from 'express';
import { requireAuth } from '../auth/middleware.js';
import { verifyPassword } from '../auth/passwords.js';

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
    error: 'Browser backup file operations are disabled'
  });
}

function createFailureLimiter({
  maximumFailures = 5,
  windowMilliseconds = 15 * 60 * 1000
} = {}) {
  const attempts = new Map();

  function entryFor(key, now) {
    const current = attempts.get(key);
    if (!current || current.resetAt <= now) {
      const fresh = { failures: 0, resetAt: now + windowMilliseconds };
      attempts.set(key, fresh);
      return fresh;
    }
    return current;
  }

  return {
    isBlocked(key, now = Date.now()) {
      return entryFor(key, now).failures >= maximumFailures;
    },
    recordFailure(key, now = Date.now()) {
      entryFor(key, now).failures += 1;
    },
    clear(key) {
      attempts.delete(key);
    }
  };
}

function unavailable(_req, res) {
  res.status(503).json({ error: 'Maintenance service is not configured' });
}

function sendOperationError(res, error) {
  if (error?.code === 'MAINTENANCE_JOB_ACTIVE') {
    return res.status(409).json({ error: 'Another maintenance job is active' });
  }
  if (error?.code === 'ENOENT') {
    return res.status(404).json({ error: 'Maintenance job not found' });
  }
  return res.status(500).json({ error: 'Maintenance operation failed' });
}

async function recordAcceptedJob(pool, job) {
  if (!pool) return;
  await pool.query(
    `INSERT INTO maintenance_jobs (
      id,
      requested_by,
      operation,
      backup_id,
      status,
      phase,
      message,
      requested_at,
      updated_at
    ) VALUES (?, ?, ?, ?, 'pending', 'queued', 'Waiting for host executor', ?, ?)
    ON DUPLICATE KEY UPDATE
      status = VALUES(status),
      phase = VALUES(phase),
      message = VALUES(message),
      updated_at = VALUES(updated_at)`,
    [
      job.id,
      job.requestedBy,
      job.operation,
      job.backupId,
      new Date(job.requestedAt),
      new Date(job.requestedAt)
    ]
  );
}

async function synchronizeJobStatuses(pool, jobs) {
  if (!pool) return;
  await Promise.all(
    jobs.map(job =>
      pool.query(
        `UPDATE maintenance_jobs
        SET status = ?, phase = ?, message = ?, updated_at = ?
        WHERE id = ?`,
        [
          job.state,
          job.phase,
          job.message,
          new Date(job.updatedAt),
          job.id
        ]
      )
    )
  );
}

export function createBackupRouter({
  backupCatalog = null,
  maintenanceQueue = null,
  pool = null,
  failureLimiter = createFailureLimiter()
} = {}) {
  const router = express.Router();
  const managementAvailable = backupCatalog && maintenanceQueue;

  router.get(
    '/backup/catalog',
    requireAuth,
    requireAdministrator,
    managementAvailable
      ? async (_req, res) => {
          try {
            res.json({ backups: await backupCatalog.list() });
          } catch {
            res.status(500).json({ error: 'Backup catalog is unavailable' });
          }
        }
      : unavailable
  );

  router.get(
    '/backup/jobs',
    requireAuth,
    requireAdministrator,
    managementAvailable
      ? async (_req, res) => {
          try {
            const jobs = await maintenanceQueue.listStatuses();
            await synchronizeJobStatuses(pool, jobs).catch(() => {});
            res.json({ jobs });
          } catch {
            res.status(500).json({ error: 'Maintenance jobs are unavailable' });
          }
        }
      : unavailable
  );

  router.get(
    '/backup/jobs/:id',
    requireAuth,
    requireAdministrator,
    managementAvailable
      ? async (req, res) => {
          try {
            const job = await maintenanceQueue.getStatus(req.params.id);
            if (!job) {
              return res.status(404).json({ error: 'Maintenance job not found' });
            }
            res.json({ job });
          } catch (error) {
            sendOperationError(res, error);
          }
        }
      : unavailable
  );

  router.post(
    '/backup/jobs',
    requireAuth,
    requireAdministrator,
    managementAvailable
      ? async (req, res) => {
          try {
            const operation = req.body?.operation;
            if (!['backup', 'restore'].includes(operation)) {
              return res.status(400).json({ error: 'Invalid maintenance operation' });
            }

            let selectedBackup = null;
            if (operation === 'restore') {
              const backupId = String(req.body?.backupId || '');
              if (
                req.body?.confirmation !== backupId ||
                req.body?.maintenanceAcknowledged !== true
              ) {
                return res.status(400).json({
                  error: 'Restore confirmation and maintenance acknowledgement are required'
                });
              }
              selectedBackup = (await backupCatalog.list()).find(
                backup => backup.id === backupId
              );
              if (!selectedBackup) {
                return res.status(404).json({ error: 'Backup not found' });
              }
              if (!selectedBackup.selectable) {
                return res.status(409).json({
                  error: 'Backup is not eligible for restore'
                });
              }
            }

            const limiterKey = `${req.ip}:${req.authUser.id}`;
            if (failureLimiter.isBlocked(limiterKey)) {
              return res.status(429).json({
                error: 'Too many password confirmation failures'
              });
            }
            const currentPassword =
              typeof req.body?.currentPassword === 'string'
                ? req.body.currentPassword
                : '';
            if (
              !currentPassword ||
              !(await verifyPassword(currentPassword, req.authUser.password))
            ) {
              failureLimiter.recordFailure(limiterKey);
              return res.status(401).json({
                error: 'Current administrator password is incorrect'
              });
            }
            failureLimiter.clear(limiterKey);

            const job = await maintenanceQueue.enqueue({
              operation,
              backupId: selectedBackup?.id || null,
              requestedBy: req.authUser.id
            });
            await recordAcceptedJob(pool, job).catch(() => {});
            res.status(202).json({ job });
          } catch (error) {
            sendOperationError(res, error);
          }
        }
      : unavailable
  );

  router.get('/backup/export', requireAuth, requireAdministrator, maintenanceOnly);
  router.post('/backup/import', requireAuth, requireAdministrator, maintenanceOnly);
  return router;
}
