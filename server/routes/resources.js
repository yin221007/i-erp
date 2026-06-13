import express from 'express';
import { randomUUID } from 'node:crypto';
import { requireAuth } from '../auth/middleware.js';
import {
  canWriteResource,
  filterReadableRecords,
  getResourceDefinition,
  sanitizeResourceRecord
} from '../policies.js';
import {
  hashPassword,
  isPasswordHash
} from '../auth/passwords.js';

function parseJson(value, context) {
  if (value && typeof value === 'object') return structuredClone(value);
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`Invalid JSON data in ${context}`);
  }
}

function requireKnownResource(req, res, next) {
  const definition = getResourceDefinition(req.params.resource);
  if (!definition) return res.status(404).json({ error: 'Resource not found' });
  req.resourceDefinition = definition;
  next();
}

async function prepareRecord(resource, user, input, routeId) {
  const record = { ...input };

  if (resource === 'production') {
    record.id = routeId || record.id || record.projectId;
  } else if (resource === 'email_configs') {
    record.id = user.id;
  } else {
    record.id = routeId || record.id;
  }

  if (resource === 'ai_messages') record.userId = user.id;

  if (
    resource === 'users' &&
    typeof record.password === 'string' &&
    !isPasswordHash(record.password)
  ) {
    record.password = await hashPassword(record.password);
  }

  return record;
}

export function createResourceRouter({ pool, onRecordSaved }) {
  const router = express.Router();

  router.use('/:resource', requireKnownResource, requireAuth);

  router.get('/:resource', async (req, res, next) => {
    const { resource } = req.params;
    try {
      const [rows] = await pool.query(
        `SELECT json_data FROM \`${resource}\` ORDER BY created_at ASC`
      );
      const records = rows.map((row, index) =>
        parseJson(row.json_data, `${resource}/${index}`)
      );
      const visible = filterReadableRecords(resource, req.authUser, records);
      res.json(visible.map(record => sanitizeResourceRecord(resource, record)));
    } catch (error) {
      next(error);
    }
  });

  router.post('/:resource', async (req, res, next) => {
    const { resource } = req.params;
    try {
      const record = await prepareRecord(resource, req.authUser, req.body);
      if (!record.id) {
        return res.status(400).json({ error: 'Record id is required' });
      }
      if (!canWriteResource(resource, req.authUser, record)) {
        return res.status(403).json({ error: 'Write access denied' });
      }

      await pool.query(
        `REPLACE INTO \`${resource}\`
          (id, json_data, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)`,
        [record.id, JSON.stringify(record)]
      );
      if (onRecordSaved) await onRecordSaved(resource, record, 'create');
      res.status(201).json(sanitizeResourceRecord(resource, record));
    } catch (error) {
      next(error);
    }
  });

  router.put('/:resource/:id', async (req, res, next) => {
    const { resource, id } = req.params;
    try {
      const record = await prepareRecord(resource, req.authUser, req.body, id);
      if (!canWriteResource(resource, req.authUser, record)) {
        return res.status(403).json({ error: 'Write access denied' });
      }

      await pool.query(
        `REPLACE INTO \`${resource}\`
          (id, json_data, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)`,
        [id, JSON.stringify(record)]
      );
      if (onRecordSaved) await onRecordSaved(resource, record, 'update');
      res.json(sanitizeResourceRecord(resource, record));
    } catch (error) {
      next(error);
    }
  });

  router.delete('/:resource/:id', async (req, res, next) => {
    const { resource, id } = req.params;
    try {
      const [rows] = await pool.query(
        `SELECT json_data FROM \`${resource}\` WHERE id = ?`,
        [id]
      );
      if (rows.length === 0) return res.status(204).end();

      const record = parseJson(rows[0].json_data, `${resource}/${id}`);
      if (!canWriteResource(resource, req.authUser, record)) {
        return res.status(403).json({ error: 'Write access denied' });
      }

      const recycleRecord = {
        id: randomUUID(),
        originalId: id,
        resourceType: resource,
        name: record.name || record.title || record.nickname || '未知',
        deletedAt: new Date().toISOString(),
        deletedBy: req.authUser.nickname,
        data: record
      };
      await pool.query(
        'INSERT INTO recycle_bin (id, json_data) VALUES (?, ?)',
        [recycleRecord.id, JSON.stringify(recycleRecord)]
      );
      await pool.query(`DELETE FROM \`${resource}\` WHERE id = ?`, [id]);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
