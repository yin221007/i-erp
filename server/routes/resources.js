import express from 'express';
import { requireAuth } from '../auth/middleware.js';
import {
  canUpdateResource,
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


async function readJsonTable(pool, resource) {
  const [rows] = await pool.query(
    `SELECT json_data FROM \`${resource}\` ORDER BY created_at ASC`
  );
  return rows.map((row, index) => parseJson(row.json_data, `${resource}/${index}`));
}

async function loadPolicyContext(pool, resource, record = null) {
  const context = {};
  if (['projects', 'clients', 'equipment', 'docs', 'payments', 'production', 'archives', 'schedule', 'channels', 'worklogs'].includes(resource)) {
    context.users = await readJsonTable(pool, 'users');
  }
  if (['projects', 'payments', 'production', 'archives', 'schedule', 'channels'].includes(resource)) {
    context.projects = resource === 'projects' ? [] : await readJsonTable(pool, 'projects');
  }
  if (['messages', 'announcements'].includes(resource)) {
    if (record?.channelId) {
      const [rows] = await pool.query(
        'SELECT json_data FROM channels WHERE id = ? LIMIT 1',
        [record.channelId]
      );
      context.channels = rows.map((row, index) => parseJson(row.json_data, `channels/${record.channelId || index}`));
    } else {
      context.channels = await readJsonTable(pool, 'channels');
    }
    if (context.channels.some(channel => channel.projectId)) {
      context.projects = await readJsonTable(pool, 'projects');
    }
  }
  return context;
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
  if (['clients', 'equipment', 'docs'].includes(resource) && !routeId) {
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
      const records = await readJsonTable(pool, resource);
      const policyContext = await loadPolicyContext(pool, resource);
      const visible = filterReadableRecords(resource, req.authUser, records, policyContext);
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
      const policyContext = await loadPolicyContext(pool, resource, record);
      if (!canWriteResource(resource, req.authUser, record, { ...policyContext, action: 'create' })) {
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

      let record = await prepareRecord(resource, req.authUser, input, id);
      let previousRecord = null;
      if (resource === 'approvals' || ['clients', 'equipment', 'docs'].includes(resource)) {
        const [rows] = await pool.query(
          `SELECT json_data FROM \`${resource}\` WHERE id = ? LIMIT 1`,
          [id]
        );
        if (resource === 'approvals' && rows.length === 0) {
          return res.status(404).json({ error: 'Approval not found' });
        }
        if (rows.length > 0) {
          previousRecord = parseJson(rows[0].json_data, `${resource}/${id}`);
          if (['clients', 'equipment', 'docs'].includes(resource)) {
            record = {
              ...record,
              creatorId: previousRecord.creatorId || record.creatorId || req.authUser.id,
              creatorName: previousRecord.creatorName || record.creatorName || req.authUser.nickname
            };
          }
        } else if (['clients', 'equipment', 'docs'].includes(resource)) {
          record = { ...record, creatorId: req.authUser.id, creatorName: req.authUser.nickname };
        }
      }
      const policyContext = await loadPolicyContext(pool, resource, record);

      if (!canUpdateResource(resource, req.authUser, record, previousRecord, policyContext)) {
        return res.status(403).json({ error: 'Write access denied' });
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
      const policyContext = await loadPolicyContext(pool, resource, record);
      if (!canWriteResource(resource, req.authUser, record, { ...policyContext, action: 'delete' })) {
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
