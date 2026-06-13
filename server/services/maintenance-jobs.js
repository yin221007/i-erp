import {
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rmdir,
  writeFile
} from 'node:fs/promises';
import path from 'node:path';
import {
  createHmac,
  randomUUID as defaultRandomUUID,
  timingSafeEqual
} from 'node:crypto';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BACKUP_ID_PATTERN =
  /^\d{8}T\d{6}Z-(daily|upgrade|manual|pre-restore)$/;
const SIGNED_FIELDS = [
  'schemaVersion',
  'id',
  'operation',
  'backupId',
  'requestedBy',
  'requestedAt',
  'expiresAt',
  'nonce'
];
const JOB_FIELDS = new Set([...SIGNED_FIELDS, 'signature']);
const STATUS_STATES = new Set(['pending', 'running', 'completed', 'failed']);

function maintenanceError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function requireSecret(secret) {
  if (typeof secret !== 'string' || secret.length < 32) {
    throw new Error('Maintenance job secret must contain at least 32 characters');
  }
}

function isValidDate(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function hasExactFields(value, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  return keys.length === fields.size && keys.every(key => fields.has(key));
}

function hasValidJobSchema(job, now) {
  if (!hasExactFields(job, JOB_FIELDS)) return false;
  if (job.schemaVersion !== 1 || !UUID_PATTERN.test(job.id)) return false;
  if (!UUID_PATTERN.test(job.nonce)) return false;
  if (!['backup', 'restore'].includes(job.operation)) return false;
  if (
    typeof job.requestedBy !== 'string' ||
    job.requestedBy.length < 1 ||
    job.requestedBy.length > 128 ||
    /[\u0000-\u001f\u007f]/.test(job.requestedBy)
  ) {
    return false;
  }
  if (!isValidDate(job.requestedAt) || !isValidDate(job.expiresAt)) return false;
  if (typeof job.signature !== 'string' || !/^[a-f0-9]{64}$/.test(job.signature)) {
    return false;
  }

  if (job.operation === 'backup' && job.backupId !== null) return false;
  if (
    job.operation === 'restore' &&
    (typeof job.backupId !== 'string' ||
      !BACKUP_ID_PATTERN.test(job.backupId))
  ) {
    return false;
  }

  const requestedAt = Date.parse(job.requestedAt);
  const expiresAt = Date.parse(job.expiresAt);
  const nowTime = now.getTime();
  return (
    expiresAt > nowTime &&
    requestedAt <= nowTime + 30_000 &&
    expiresAt > requestedAt &&
    expiresAt - requestedAt <= 5 * 60_000
  );
}

function safeJob(job, state = 'pending') {
  return {
    id: job.id,
    operation: job.operation,
    backupId: job.backupId,
    requestedBy: job.requestedBy,
    requestedAt: job.requestedAt,
    expiresAt: job.expiresAt,
    state
  };
}

async function regularJsonFiles(directory) {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return entries.filter(
      entry =>
        entry.isFile() &&
        entry.name.endsWith('.json') &&
        UUID_PATTERN.test(entry.name.slice(0, -5))
    );
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function atomicJsonWrite(directory, id, value) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const target = path.join(directory, `${id}.json`);
  const temporary = path.join(directory, `.${id}.${process.pid}.tmp`);
  await writeFile(temporary, `${JSON.stringify(value)}\n`, {
    mode: 0o600,
    flag: 'wx'
  });
  await rename(temporary, target);
}

function sanitizeStatus(value, expectedId) {
  if (
    !value ||
    value.id !== expectedId ||
    !UUID_PATTERN.test(value.id) ||
    !['backup', 'restore'].includes(value.operation) ||
    !STATUS_STATES.has(value.state) ||
    typeof value.phase !== 'string' ||
    value.phase.length > 80 ||
    typeof value.message !== 'string' ||
    value.message.length > 500 ||
    !isValidDate(value.updatedAt)
  ) {
    throw new Error('Invalid status file');
  }
  if (
    value.backupId !== null &&
    (typeof value.backupId !== 'string' ||
      !BACKUP_ID_PATTERN.test(value.backupId))
  ) {
    throw new Error('Invalid status file');
  }

  return {
    id: value.id,
    operation: value.operation,
    backupId: value.backupId,
    state: value.state,
    phase: value.phase,
    message: value.message,
    updatedAt: new Date(value.updatedAt).toISOString()
  };
}

export function canonicalizeMaintenanceJob(job) {
  return JSON.stringify({
    schemaVersion: job.schemaVersion,
    id: job.id,
    operation: job.operation,
    backupId: job.backupId ?? null,
    requestedBy: job.requestedBy,
    requestedAt: job.requestedAt,
    expiresAt: job.expiresAt,
    nonce: job.nonce
  });
}

export function signMaintenanceJob(job, secret) {
  requireSecret(secret);
  return {
    ...job,
    backupId: job.backupId ?? null,
    signature: createHmac('sha256', secret)
      .update(canonicalizeMaintenanceJob(job))
      .digest('hex')
  };
}

export function verifyMaintenanceJob(job, secret, { now = new Date() } = {}) {
  try {
    requireSecret(secret);
    if (!hasValidJobSchema(job, now)) return false;
    const expected = createHmac('sha256', secret)
      .update(canonicalizeMaintenanceJob(job))
      .digest();
    const actual = Buffer.from(job.signature, 'hex');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function createMaintenanceQueue({
  queueRoot,
  secret,
  now = () => new Date(),
  randomUUID = defaultRandomUUID
}) {
  if (!path.isAbsolute(queueRoot || '')) {
    throw new Error('queueRoot must be an absolute path');
  }
  requireSecret(secret);

  const directories = {
    pending: path.join(queueRoot, 'pending'),
    running: path.join(queueRoot, 'running'),
    status: path.join(queueRoot, 'status'),
    nonces: path.join(queueRoot, 'nonces'),
    enqueueLock: path.join(queueRoot, '.enqueue.lock')
  };

  return {
    async hasActiveJob() {
      const [pending, running] = await Promise.all([
        regularJsonFiles(directories.pending),
        regularJsonFiles(directories.running)
      ]);
      return pending.length > 0 || running.length > 0;
    },

    async enqueue({ operation, backupId = null, requestedBy }) {
      await mkdir(queueRoot, { recursive: true, mode: 0o700 });
      try {
        await mkdir(directories.enqueueLock, { mode: 0o700 });
      } catch (error) {
        if (error.code === 'EEXIST') {
          throw maintenanceError(
            'Another maintenance job is already active',
            'MAINTENANCE_JOB_ACTIVE'
          );
        }
        throw error;
      }

      try {
        if (await this.hasActiveJob()) {
          throw maintenanceError(
            'Another maintenance job is already active',
            'MAINTENANCE_JOB_ACTIVE'
          );
        }

        const requestedAt = now();
        const unsigned = {
          schemaVersion: 1,
          id: randomUUID(),
          operation,
          backupId: operation === 'backup' ? null : backupId,
          requestedBy,
          requestedAt: requestedAt.toISOString(),
          expiresAt: new Date(requestedAt.getTime() + 5 * 60_000).toISOString(),
          nonce: randomUUID()
        };
        const job = signMaintenanceJob(unsigned, secret);
        if (!verifyMaintenanceJob(job, secret, { now: requestedAt })) {
          throw maintenanceError(
            'Maintenance job input is invalid',
            'MAINTENANCE_JOB_INVALID'
          );
        }

        await atomicJsonWrite(directories.pending, job.id, job);
        return safeJob(job);
      } finally {
        await rmdir(directories.enqueueLock).catch(() => {});
      }
    },

    async verifyAndConsume(job) {
      if (!verifyMaintenanceJob(job, secret, { now: now() })) {
        throw maintenanceError(
          'Maintenance job signature or schema is invalid',
          'MAINTENANCE_JOB_INVALID'
        );
      }

      await mkdir(directories.nonces, { recursive: true, mode: 0o700 });
      try {
        await writeFile(
          path.join(directories.nonces, job.nonce),
          `${job.id}\n`,
          { flag: 'wx', mode: 0o600 }
        );
      } catch (error) {
        if (error.code === 'EEXIST') {
          throw maintenanceError(
            'Maintenance job nonce was already consumed',
            'MAINTENANCE_JOB_REPLAY'
          );
        }
        throw error;
      }
      return safeJob(job, 'running');
    },

    async getStatus(id) {
      if (!UUID_PATTERN.test(id || '')) {
        throw new Error('Invalid maintenance job id');
      }
      const filePath = path.join(directories.status, `${id}.json`);
      const fileStat = await lstat(filePath);
      if (!fileStat.isFile() || fileStat.isSymbolicLink()) {
        throw new Error('Invalid status file');
      }
      const value = JSON.parse(await readFile(filePath, 'utf8'));
      return sanitizeStatus(value, id);
    }
  };
}
