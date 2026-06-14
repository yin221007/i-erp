import express from 'express';
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
import { moveToRecycleBin } from '../services/recycle-bin.js';

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
  if (resource === 'messages') {
    record.userId = user.id;
    record.userName = user.nickname;
    record.userAvatar = user.avatar || '';
  }
  if (resource === 'announcements') {
    record.creatorId = user.id;
    record.creatorName = user.nickname;
  }
  if (resource === 'approvals' && !routeId) {
    record.applicantId = user.id;
    record.applicantName = user.nickname;
    record.department = user.department;
  }

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

      let previousRecord = null;
      if (resource === 'approvals' && onRecordSaved) {
        const [rows] = await pool.query(
          'SELECT json_data FROM approvals WHERE id = ? LIMIT 1',
          [record.id]
        );
        if (rows.length > 0) {
          previousRecord = parseJson(
            rows[0].json_data,
            `approvals/${record.id}`
          );
        }
      }
      await pool.query(
        `REPLACE INTO \`${resource}\`
          (id, json_data, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)`,
        [record.id, JSON.stringify(record)]
      );
      if (onRecordSaved) {
        await onRecordSaved(resource, record, 'create', {
          actor: req.authUser,
          previousRecord
        });
      }
      res.status(201).json(sanitizeResourceRecord(resource, record));
    } catch (error) {
      next(error);
    }
  });

  router.put('/:resource/:id', async (req, res, next) => {
    const { resource, id } = req.params;
    try {
      let input = req.body;
      if (
        resource === 'users' &&
        (typeof input.password !== 'string' || input.password.length === 0)
      ) {
        const [rows] = await pool.query(
          'SELECT json_data FROM users WHERE id = ? LIMIT 1',
          [id]
        );
        if (rows.length > 0) {
          const existing = parseJson(rows[0].json_data, `users/${id}`);
          input = { ...input, password: existing.password };
        }
      }

      const record = await prepareRecord(resource, req.authUser, input, id);
      if (!canWriteResource(resource, req.authUser, record)) {
        return res.status(403).json({ error: 'Write access denied' });
      }

      let previousRecord = null;
      if (resource === 'approvals' && onRecordSaved) {
        const [rows] = await pool.query(
          'SELECT json_data FROM approvals WHERE id = ? LIMIT 1',
          [id]
        );
        if (rows.length > 0) {
          previousRecord = parseJson(rows[0].json_data, `approvals/${id}`);
        }
      }
      await pool.query(
        `REPLACE INTO \`${resource}\`
          (id, json_data, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)`,
        [id, JSON.stringify(record)]
      );
      if (onRecordSaved) {
        await onRecordSaved(resource, record, 'update', {
          actor: req.authUser,
          previousRecord
        });
      }
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

      await moveToRecycleBin(pool, {
        resource,
        id,
        user: req.authUser
      });
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
