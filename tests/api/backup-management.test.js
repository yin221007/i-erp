import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { hashPassword } from '../../server/auth/passwords.js';
import { createBackupRouter } from '../../server/routes/backup.js';

const BACKUP_ID = '20260613T225651Z-upgrade';

async function createTestApp({
  role = 'Admin',
  authenticated = true,
  queueOverrides = {}
} = {}) {
  const password = await hashPassword('current-password');
  const user = authenticated
    ? {
        id: 'u-1',
        nickname: 'admin',
        password,
        role,
        isDefaultAdmin: role === 'Admin'
      }
    : null;
  const backups = [
    {
      id: BACKUP_ID,
      kind: 'upgrade',
      status: 'complete',
      createdAt: '2026-06-13T22:56:51.000Z',
      sizeBytes: 100,
      uploadFileCount: 2,
      locked: false,
      restoreDrillVerified: true,
      selectable: true,
      issues: []
    },
    {
      id: '20260612T225651Z-daily',
      kind: 'daily',
      status: 'invalid',
      createdAt: null,
      sizeBytes: 0,
      uploadFileCount: 0,
      locked: false,
      restoreDrillVerified: false,
      selectable: false,
      issues: ['missing:uploads.tar.gz']
    }
  ];
  const jobs = [];
  const auditQueries = [];
  const pool = {
    async query(sql, parameters) {
      auditQueries.push({
        sql: sql.replace(/\s+/g, ' ').trim(),
        parameters
      });
      return [{ affectedRows: 1 }, []];
    }
  };
  const maintenanceQueue = {
    async enqueue(input) {
      const job = {
        id: '11111111-1111-4111-8111-111111111111',
        ...input,
        requestedAt: '2026-06-14T01:00:00.000Z',
        expiresAt: '2026-06-14T01:05:00.000Z',
        state: 'pending'
      };
      jobs.push(job);
      return job;
    },
    async listStatuses() {
      return jobs;
    },
    async getStatus(id) {
      return jobs.find(job => job.id === id) || null;
    },
    ...queueOverrides
  };
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use((req, _res, next) => {
    req.authUser = user;
    next();
  });
  app.use(
    createBackupRouter({
      backupCatalog: { list: async () => backups },
      maintenanceQueue,
      pool
    })
  );
  return { app, jobs, auditQueries };
}

test('backup management requires authentication and administrator access', async () => {
  const anonymous = await createTestApp({ authenticated: false });
  await request(anonymous.app).get('/backup/catalog').expect(401);
  await request(anonymous.app).post('/backup/jobs').send({}).expect(401);

  const member = await createTestApp({ role: 'User' });
  await request(member.app).get('/backup/catalog').expect(403);
  await request(member.app).get('/backup/jobs').expect(403);
  await request(member.app).post('/backup/jobs').send({}).expect(403);
});

test('administrator can list sanitized backups and maintenance jobs', async () => {
  const { app } = await createTestApp();

  const catalog = await request(app).get('/backup/catalog').expect(200);
  const jobs = await request(app).get('/backup/jobs').expect(200);

  assert.equal(catalog.body.backups.length, 2);
  assert.deepEqual(jobs.body.jobs, []);
  assert.equal(JSON.stringify(catalog.body).includes('/volume2'), false);
  assert.equal(JSON.stringify(catalog.body).includes('signature'), false);
  assert.equal(JSON.stringify(jobs.body).includes('secret'), false);
});

test('job polling synchronizes final executor status into the audit table', async () => {
  const status = {
    id: '11111111-1111-4111-8111-111111111111',
    operation: 'restore',
    backupId: BACKUP_ID,
    state: 'completed',
    phase: 'complete',
    message: 'Restore completed',
    updatedAt: '2026-06-14T01:10:00.000Z'
  };
  const { app, auditQueries } = await createTestApp({
    queueOverrides: {
      async listStatuses() {
        return [status];
      }
    }
  });

  await request(app).get('/backup/jobs').expect(200);

  const update = auditQueries.find(query =>
    query.sql.startsWith('UPDATE maintenance_jobs')
  );
  assert.ok(update);
  assert.equal(update.parameters.includes('completed'), true);
  assert.equal(JSON.stringify(update).includes('/volume2'), false);
});

test('manual backup requires the current administrator password', async () => {
  const { app, jobs, auditQueries } = await createTestApp();

  await request(app)
    .post('/backup/jobs')
    .send({ operation: 'backup', currentPassword: 'wrong' })
    .expect(401);
  await request(app)
    .post('/backup/jobs')
    .send({ operation: 'backup', currentPassword: 'current-password' })
    .expect(202);

  assert.equal(jobs.length, 1);
  assert.deepEqual(
    {
      operation: jobs[0].operation,
      backupId: jobs[0].backupId,
      requestedBy: jobs[0].requestedBy
    },
    { operation: 'backup', backupId: null, requestedBy: 'u-1' }
  );
  assert.equal(
    auditQueries.some(query =>
      query.sql.startsWith('INSERT INTO maintenance_jobs')
    ),
    true
  );
  assert.equal(JSON.stringify(auditQueries).includes('current-password'), false);
});

test('restore requires exact backup confirmation and maintenance acknowledgement', async () => {
  const { app, jobs } = await createTestApp();
  const base = {
    operation: 'restore',
    backupId: BACKUP_ID,
    currentPassword: 'current-password'
  };

  await request(app)
    .post('/backup/jobs')
    .send({ ...base, confirmation: 'wrong', maintenanceAcknowledged: true })
    .expect(400);
  await request(app)
    .post('/backup/jobs')
    .send({ ...base, confirmation: BACKUP_ID })
    .expect(400);
  const response = await request(app)
    .post('/backup/jobs')
    .send({
      ...base,
      confirmation: BACKUP_ID,
      maintenanceAcknowledged: true
    })
    .expect(202);

  assert.equal(jobs.length, 1);
  assert.equal(response.body.job.backupId, BACKUP_ID);
  assert.equal(JSON.stringify(response.body).includes('signature'), false);
});

test('restore rejects unknown and unselectable backups', async () => {
  const { app } = await createTestApp();
  const body = {
    operation: 'restore',
    currentPassword: 'current-password',
    maintenanceAcknowledged: true
  };

  await request(app)
    .post('/backup/jobs')
    .send({
      ...body,
      backupId: '20260611T225651Z-daily',
      confirmation: '20260611T225651Z-daily'
    })
    .expect(404);
  await request(app)
    .post('/backup/jobs')
    .send({
      ...body,
      backupId: '20260612T225651Z-daily',
      confirmation: '20260612T225651Z-daily'
    })
    .expect(409);
});

test('active queue conflicts are returned as 409', async () => {
  const conflict = new Error('active');
  conflict.code = 'MAINTENANCE_JOB_ACTIVE';
  const { app } = await createTestApp({
    queueOverrides: {
      async enqueue() {
        throw conflict;
      }
    }
  });

  await request(app)
    .post('/backup/jobs')
    .send({ operation: 'backup', currentPassword: 'current-password' })
    .expect(409);
});

test('repeated password failures are rate limited per administrator and address', async () => {
  const { app } = await createTestApp();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await request(app)
      .post('/backup/jobs')
      .send({ operation: 'backup', currentPassword: 'wrong' })
      .expect(401);
  }
  await request(app)
    .post('/backup/jobs')
    .send({ operation: 'backup', currentPassword: 'wrong' })
    .expect(429);
});
