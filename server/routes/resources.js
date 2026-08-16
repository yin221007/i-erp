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
import { moveToRecycleBin, withTransaction } from '../services/recycle-bin.js';

const MAX_ARCHIVE_BATCH_SIZE = 30;
const INVALID_ARCHIVE_TITLE_CHARACTERS = /[\u0000-\u001f\u007f<>:"/\\|?*]/;

function parseJson(value, context) {
  if (value && typeof value === 'object') return structuredClone(value);
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`Invalid JSON data in ${context}`);
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateUserInput(input, { requirePassword }) {
  const nickname = typeof input.nickname === 'string' ? input.nickname.trim() : '';
  if (!nickname || nickname.length > 100) return 'Invalid username';

  if (requirePassword && (typeof input.password !== 'string' || input.password.length === 0)) {
    return 'Password is required';
  }
  if (typeof input.password === 'string' && input.password.length > 1024) {
    return 'Password is too long';
  }
  return null;
}

function normalizeArchiveTitle(value) {
  if (typeof value !== 'string') {
    return { error: 'Archive title must be a string' };
  }
  const title = value.trim();
  if (!title || title.length > 200) {
    return { error: 'Archive title must contain 1-200 characters' };
  }
  if (INVALID_ARCHIVE_TITLE_CHARACTERS.test(title) || /[. ]$/.test(title)) {
    return { error: 'Archive title contains invalid filename characters' };
  }
  return { title };
}

function canRenameArchive(user, archive) {
  if (user?.isDefaultAdmin === true) return true;
  if (archive?.uploaderId) return archive.uploaderId === user?.id;
  return archive?.uploader === user?.nickname;
}

const PROJECT_MEDIA_PHASES = new Set([
  '前期对接 & 设计',
  '生产准备',
  '进场施工',
  '安装调试',
  '验收交付',
  '结算收尾'
]);
const IMAGE_ARCHIVE_EXTENSIONS = new Set(['JPG', 'JPEG', 'PNG', 'GIF', 'WEBP']);
const VIDEO_ARCHIVE_EXTENSIONS = new Set(['MP4', 'MOV', 'WEBM']);

function isValidLocalDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day;
}

function protectedUploadExtension(value) {
  if (typeof value !== 'string') return '';
  const match = value.match(
    /^\/api\/uploads\/(?:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|\d{13}-\d{1,9})\.([a-z0-9]+)$/i
  );
  return match?.[1]?.toUpperCase() || '';
}

function normalizeAndValidateArchive(
  record,
  projects,
  previousRecord = null,
  existingArchives = []
) {
  if (record.category !== 'Media') {
    if (previousRecord?.category === 'Media') {
      return { error: 'Media archive category cannot be changed' };
    }
    return { record };
  }

  const project = projects.find(item => item.id === record.projectId);
  if (!project) return { error: 'Media archive project is invalid' };
  if (!PROJECT_MEDIA_PHASES.has(record.mediaPhase)) {
    return { error: 'Media archive phase is invalid' };
  }
  if (!isValidLocalDate(record.capturedAt)) {
    return { error: 'Media archive captured date is invalid' };
  }
  if (!['image', 'video'].includes(record.mediaType)) {
    return { error: 'Media archive type is invalid' };
  }
  const urlExtension = protectedUploadExtension(record.url);
  if (!urlExtension) {
    return { error: 'Media archive URL is invalid' };
  }

  const fileType = typeof record.fileType === 'string'
    ? record.fileType.trim().toUpperCase()
    : '';
  const expectedExtensions = record.mediaType === 'image'
    ? IMAGE_ARCHIVE_EXTENSIONS
    : VIDEO_ARCHIVE_EXTENSIONS;
  if (!expectedExtensions.has(fileType)) {
    return { error: 'Media archive file type does not match media type' };
  }
  if (urlExtension !== fileType) {
    return { error: 'Media archive URL extension does not match file type' };
  }

  const title = typeof record.title === 'string' ? record.title.trim() : '';
  if (!title || title.length > 200) {
    return { error: 'Media archive title is invalid' };
  }
  const description = typeof record.description === 'string'
    ? record.description.trim()
    : '';
  if (description.length > 2000) {
    return { error: 'Media archive description is too long' };
  }
  const mediaAlbumId = typeof record.mediaAlbumId === 'string'
    ? record.mediaAlbumId.trim()
    : '';
  if (!mediaAlbumId || mediaAlbumId.length > 100 || !/^[A-Za-z0-9._-]+$/.test(mediaAlbumId)) {
    return { error: 'Media archive folder id is invalid' };
  }
  const mediaAlbumTitle = typeof record.mediaAlbumTitle === 'string'
    ? record.mediaAlbumTitle.trim()
    : '';
  if (!mediaAlbumTitle || mediaAlbumTitle.length > 200) {
    return { error: 'Media archive folder title is invalid' };
  }

  let workflowNodeId;
  let workflowNodeTitle;
  if (record.workflowNodeId) {
    const node = Array.isArray(project.nodes)
      ? project.nodes.find(item => item.id === record.workflowNodeId)
      : null;
    if (!node || node.phase !== record.mediaPhase) {
      return { error: 'Media archive workflow node is invalid' };
    }
    workflowNodeId = node.id;
    workflowNodeTitle = node.title;
  }

  const existingFolderItem = existingArchives.find(item =>
    item.id !== record.id &&
    item.category === 'Media' &&
    item.mediaAlbumId === mediaAlbumId
  );
  if (existingFolderItem) {
    const folderFields = [
      ['projectId', project.id],
      ['mediaPhase', record.mediaPhase],
      ['capturedAt', record.capturedAt],
      ['mediaAlbumTitle', mediaAlbumTitle],
      ['workflowNodeId', workflowNodeId]
    ];
    if (folderFields.some(([key, value]) => (existingFolderItem[key] || undefined) !== value)) {
      return { error: 'Media archive folder metadata does not match existing folder' };
    }
  }

  return {
    record: {
      ...record,
      title,
      description,
      projectId: project.id,
      projectName: project.name,
      fileType,
      mediaAlbumId,
      mediaAlbumTitle,
      ...(workflowNodeId ? { workflowNodeId, workflowNodeTitle } : {
        workflowNodeId: undefined,
        workflowNodeTitle: undefined
      })
    }
  };
}

async function hasDuplicateUsername(pool, nickname, excludedId = '') {
  const normalized = nickname.trim().toLowerCase();
  const users = await readJsonTable(pool, 'users');
  return users.some(user =>
    user.id !== excludedId &&
    typeof user.nickname === 'string' &&
    user.nickname.trim().toLowerCase() === normalized
  );
}


async function readJsonTable(pool, resource) {
  const [rows] = await pool.query(
    `SELECT json_data FROM \`${resource}\` ORDER BY created_at ASC`
  );
  return rows.map((row, index) => parseJson(row.json_data, `${resource}/${index}`));
}

async function readJsonRecord(pool, resource, id) {
  const [rows] = await pool.query(
    `SELECT json_data FROM \`${resource}\` WHERE id = ? LIMIT 1`,
    [id]
  );
  return rows.length > 0 ? parseJson(rows[0].json_data, `${resource}/${id}`) : null;
}

async function loadPolicyContext(pool, resource, record = null) {
  const context = {};
  if (['projects', 'clients', 'equipment', 'docs', 'payments', 'production', 'archives', 'schedule', 'channels', 'worklogs'].includes(resource)) {
    context.users = await readJsonTable(pool, 'users');
  }
  if (['projects', 'payments', 'production', 'archives', 'schedule', 'channels'].includes(resource)) {
    context.projects = resource === 'projects' ? [] : await readJsonTable(pool, 'projects');
  }
  if (resource === 'archives') {
    context.archives = await readJsonTable(pool, 'archives');
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
  if (resource === 'archives' && !routeId) {
    record.uploader = user.nickname;
    record.uploaderId = user.id;
  }
  if (resource === 'approvals' && !routeId) {
    record.applicantId = user.id;
    record.applicantName = user.nickname;
    record.department = user.department;
    if (!Array.isArray(record.versions) || record.versions.length === 0) {
      const submittedAt = record.createdAt || new Date().toISOString();
      record.versions = [{
        version: 1,
        content: record.currentContent || '',
        attachments: Array.isArray(record.currentAttachments)
          ? record.currentAttachments
          : [],
        submittedAt,
        outcomes: []
      }];
    }
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

  router.post('/archives/batch', requireAuth, async (req, res, next) => {
    try {
      if (
        !Array.isArray(req.body) ||
        req.body.length === 0 ||
        req.body.length > MAX_ARCHIVE_BATCH_SIZE ||
        req.body.some(item => !isRecord(item))
      ) {
        return res.status(400).json({
          error: `Archive batch must contain 1-${MAX_ARCHIVE_BATCH_SIZE} records`
        });
      }

      const policyContext = await loadPolicyContext(pool, 'archives');
      const existingArchives = policyContext.archives || [];
      const existingIds = new Set(existingArchives.map(record => record.id));
      const requestIds = new Set();
      const records = [];

      for (const input of req.body) {
        let record = await prepareRecord('archives', req.authUser, input);
        if (!record.id) {
          return res.status(400).json({ error: 'Record id is required' });
        }
        if (existingIds.has(record.id) || requestIds.has(record.id)) {
          return res.status(409).json({ error: 'Record id already exists' });
        }
        requestIds.add(record.id);

        const validation = normalizeAndValidateArchive(
          record,
          policyContext.projects || [],
          null,
          [...existingArchives, ...records]
        );
        if (validation.error) {
          return res.status(400).json({ error: validation.error });
        }
        record = validation.record;
        if (!canWriteResource('archives', req.authUser, record, {
          ...policyContext,
          action: 'create'
        })) {
          return res.status(403).json({ error: 'Write access denied' });
        }
        records.push(record);
      }

      await withTransaction(pool, async connection => {
        for (const record of records) {
          await connection.query(
            `INSERT INTO \`archives\`
              (id, json_data, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)`,
            [record.id, JSON.stringify(record)]
          );
        }
      });

      if (onRecordSaved) {
        for (const record of records) {
          await onRecordSaved('archives', record, 'create', {
            actor: req.authUser,
            previousRecord: null
          });
        }
      }

      return res.status(201).json(
        records.map(record => sanitizeResourceRecord('archives', record))
      );
    } catch (error) {
      if (error?.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'Record id already exists' });
      }
      return next(error);
    }
  });

  router.use('/:resource', requireKnownResource, requireAuth);

  router.patch('/archives/:id/name', async (req, res, next) => {
    const { id } = req.params;
    try {
      if (!isRecord(req.body)) {
        return res.status(400).json({ error: 'Record body must be an object' });
      }
      const previousRecord = await readJsonRecord(pool, 'archives', id);
      if (!previousRecord) {
        return res.status(404).json({ error: 'Record not found' });
      }
      if (!canRenameArchive(req.authUser, previousRecord)) {
        return res.status(403).json({ error: 'Archive rename access denied' });
      }
      const normalized = normalizeArchiveTitle(req.body.title);
      if (normalized.error) {
        return res.status(400).json({ error: normalized.error });
      }

      const record = {
        ...previousRecord,
        title: normalized.title,
        ...(!previousRecord.uploaderId && previousRecord.uploader === req.authUser.nickname
          ? { uploaderId: req.authUser.id }
          : {})
      };
      await pool.query(
        `REPLACE INTO \`archives\`
          (id, json_data, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)`,
        [id, JSON.stringify(record)]
      );
      if (onRecordSaved) {
        await onRecordSaved('archives', record, 'update', {
          actor: req.authUser,
          previousRecord
        });
      }
      return res.json(sanitizeResourceRecord('archives', record));
    } catch (error) {
      return next(error);
    }
  });

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
      if (!isRecord(req.body)) {
        return res.status(400).json({ error: 'Record body must be an object' });
      }
      const input = { ...req.body };
      if (resource === 'users') {
        const validationError = validateUserInput(input, { requirePassword: true });
        if (validationError) return res.status(400).json({ error: validationError });
        input.nickname = input.nickname.trim();
        if (await hasDuplicateUsername(pool, input.nickname)) {
          return res.status(409).json({ error: 'Username already exists' });
        }
      }
      let record = await prepareRecord(resource, req.authUser, input);
      if (!record.id) {
        return res.status(400).json({ error: 'Record id is required' });
      }
      if (await readJsonRecord(pool, resource, record.id)) {
        return res.status(409).json({ error: 'Record id already exists' });
      }
      const policyContext = await loadPolicyContext(pool, resource, record);
      if (resource === 'archives') {
        const validation = normalizeAndValidateArchive(
          record,
          policyContext.projects || [],
          null,
          policyContext.archives || []
        );
        if (validation.error) return res.status(400).json({ error: validation.error });
        record = validation.record;
      }
      if (!canWriteResource(resource, req.authUser, record, { ...policyContext, action: 'create' })) {
        return res.status(403).json({ error: 'Write access denied' });
      }

      await pool.query(
        `INSERT INTO \`${resource}\`
          (id, json_data, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)`,
        [record.id, JSON.stringify(record)]
      );
      if (onRecordSaved) {
        await onRecordSaved(resource, record, 'create', {
          actor: req.authUser,
          previousRecord: null
        });
      }
      res.status(201).json(sanitizeResourceRecord(resource, record));
    } catch (error) {
      if (error?.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'Record id already exists' });
      }
      next(error);
    }
  });

  router.put('/:resource/:id', async (req, res, next) => {
    const { resource, id } = req.params;
    try {
      if (!isRecord(req.body)) {
        return res.status(400).json({ error: 'Record body must be an object' });
      }
      const previousRecord = await readJsonRecord(pool, resource, id);
      if (!previousRecord) {
        return res.status(404).json({ error: 'Record not found' });
      }

      let input = req.body;
      if (resource === 'users') {
        // 用户列表会隐藏密码、webhook 等私密字段。编辑基本资料时必须以旧记录
        // 为基线合并，否则一次普通资料修改就会误删偏好、通知配置和已读状态。
        input = { ...previousRecord, ...input };
        if (typeof req.body?.password !== 'string' || req.body.password.length === 0) {
          input.password = previousRecord.password;
        }
        if (previousRecord.preferences || req.body?.preferences) {
          input.preferences = {
            ...(previousRecord.preferences || {}),
            ...(req.body?.preferences || {}),
            ...(previousRecord.preferences?.webhooks
              ? { webhooks: previousRecord.preferences.webhooks }
              : {})
          };
        }
        const validationError = validateUserInput(input, { requirePassword: false });
        if (validationError) return res.status(400).json({ error: validationError });
        input.nickname = input.nickname.trim();
        if (await hasDuplicateUsername(pool, input.nickname, id)) {
          return res.status(409).json({ error: 'Username already exists' });
        }
      }

      let record = await prepareRecord(resource, req.authUser, input, id);
      if (['clients', 'equipment', 'docs'].includes(resource)) {
        record = {
          ...record,
          creatorId: previousRecord.creatorId || record.creatorId || req.authUser.id,
          creatorName: previousRecord.creatorName || record.creatorName || req.authUser.nickname
        };
      }
      const policyContext = await loadPolicyContext(pool, resource, record);
      if (resource === 'archives') {
        record = {
          ...record,
          uploader: previousRecord.uploader || req.authUser.nickname,
          uploaderId: previousRecord.uploaderId || (
            previousRecord.uploader === req.authUser.nickname
              ? req.authUser.id
              : undefined
          ),
          createdAt: previousRecord.createdAt || record.createdAt
        };
        if (
          record.url !== previousRecord.url ||
          record.fileType !== previousRecord.fileType
        ) {
          return res.status(400).json({
            error: 'Archive file reference and extension cannot be changed'
          });
        }
        if (
          record.title !== previousRecord.title &&
          !canRenameArchive(req.authUser, previousRecord)
        ) {
          return res.status(403).json({ error: 'Archive rename access denied' });
        }
        const validation = normalizeAndValidateArchive(
          record,
          policyContext.projects || [],
          previousRecord,
          policyContext.archives || []
        );
        if (validation.error) return res.status(400).json({ error: validation.error });
        record = validation.record;
      }

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
