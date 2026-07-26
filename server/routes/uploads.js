import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import multer from 'multer';
import { requireAuth } from '../auth/middleware.js';
import { filterReadableRecords } from '../policies.js';

export const DEFAULT_UPLOAD_MAX_BYTES = 100 * 1024 * 1024;

const FILE_REFERENCE_RESOURCES = [
  'projects',
  'equipment',
  'docs',
  'archives',
  'users',
  'settings',
  'approvals',
  'messages',
  'channels',
  'announcements',
  'ai_messages',
  'worklogs'
];

const allowedTypes = new Map([
  ['.txt', new Set(['text/plain'])],
  ['.csv', new Set(['text/csv', 'application/vnd.ms-excel'])],
  ['.json', new Set(['application/json'])],
  ['.pdf', new Set(['application/pdf'])],
  ['.png', new Set(['image/png'])],
  ['.jpg', new Set(['image/jpeg'])],
  ['.jpeg', new Set(['image/jpeg'])],
  ['.gif', new Set(['image/gif'])],
  ['.webp', new Set(['image/webp'])],
  ['.doc', new Set(['application/msword'])],
  ['.docx', new Set([
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ])],
  ['.xls', new Set(['application/vnd.ms-excel'])],
  ['.xlsx', new Set([
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ])],
  ['.ppt', new Set(['application/vnd.ms-powerpoint'])],
  ['.pptx', new Set([
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ])],
  ['.zip', new Set(['application/zip', 'application/x-zip-compressed'])],
  ['.rar', new Set(['application/vnd.rar', 'application/x-rar-compressed'])],
  ['.7z', new Set(['application/x-7z-compressed'])],
  ['.dwg', new Set([
    'application/acad',
    'application/dwg',
    'application/x-acad',
    'application/x-autocad',
    'application/x-dwg',
    'application/octet-stream',
    'application/vnd.dwg',
    'drawing/dwg',
    'drawing/x-dwg',
    'image/vnd.dwg',
    'image/x-dwg'
  ])],
  ['.dxf', new Set([
    'application/dxf',
    'application/x-dxf',
    'application/x-autocad',
    'application/octet-stream',
    'image/vnd.dxf',
    'image/x-dxf'
  ])],
  ['.rvt', new Set(['application/octet-stream'])],
  ['.rfa', new Set(['application/octet-stream'])],
  ['.skp', new Set(['application/octet-stream', 'application/vnd.sketchup.skp'])],
  ['.ifc', new Set(['application/octet-stream', 'application/x-step', 'text/plain'])],
  ['.mp4', new Set(['video/mp4'])],
  ['.mov', new Set(['video/quicktime'])],
  ['.webm', new Set(['video/webm'])],
  ['.mp3', new Set(['audio/mpeg'])],
  ['.wav', new Set(['audio/wav', 'audio/x-wav'])]
]);

function uploadTypeError() {
  const error = new Error('File type is not allowed');
  error.statusCode = 415;
  return error;
}

function isStoredFileName(filename) {
  const extension = path.extname(filename).toLowerCase();
  const stem = path.basename(filename, extension);
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(stem);
  const isHistorical = /^\d{13}-\d{1,9}$/.test(stem);
  return path.basename(filename) === filename &&
    allowedTypes.has(extension) &&
    (isUuid || isHistorical);
}

function parseRecord(value) {
  return typeof value === 'string' ? JSON.parse(value) : structuredClone(value);
}

function isAdministrator(user) {
  return user?.isDefaultAdmin === true || user?.role === 'Admin';
}

function canCreateUpload(user) {
  return isAdministrator(user) || user?.permission === 'ReadWrite';
}

function createCleanupToken(sessionToken, filename) {
  return createHmac('sha256', sessionToken).update(filename).digest('base64url');
}

function isValidCleanupToken(sessionToken, filename, suppliedToken) {
  if (!sessionToken || typeof suppliedToken !== 'string') return false;
  const expected = Buffer.from(createCleanupToken(sessionToken, filename));
  const supplied = Buffer.from(suppliedToken);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

async function readJsonTable(pool, resource) {
  const [rows] = await pool.query(
    `SELECT json_data FROM \`${resource}\` ORDER BY created_at ASC`
  );
  return rows.map(row => parseRecord(row.json_data));
}

async function findUploadReferences(pool, url) {
  const matches = await Promise.all(FILE_REFERENCE_RESOURCES.map(async resource => {
    const [rows] = await pool.query(
      `SELECT json_data FROM \`${resource}\` WHERE JSON_SEARCH(json_data, 'one', ?) IS NOT NULL`,
      [url]
    );
    return rows.map(row => ({ resource, record: parseRecord(row.json_data) }));
  }));
  return matches.flat();
}

async function canReadUpload(pool, user, url) {
  if (isAdministrator(user)) return true;
  const references = await findUploadReferences(pool, url);
  if (references.length === 0) return false;

  const [users, projects, channels] = await Promise.all([
    readJsonTable(pool, 'users'),
    readJsonTable(pool, 'projects'),
    readJsonTable(pool, 'channels')
  ]);
  const context = { users, projects, channels };
  return references.some(({ resource, record }) =>
    filterReadableRecords(resource, user, [record], context).length === 1
  );
}

export function createUploadsRouter({
  directory,
  maxFileSize = DEFAULT_UPLOAD_MAX_BYTES,
  pool
}) {
  if (!directory) throw new Error('upload directory is required');
  mkdirSync(directory, { recursive: true, mode: 0o750 });

  const storage = multer.diskStorage({
    destination: directory,
    filename(_req, file, callback) {
      const extension = path.extname(file.originalname).toLowerCase();
      callback(null, `${randomUUID()}${extension}`);
    }
  });

  const upload = multer({
    storage,
    limits: {
      fileSize: maxFileSize,
      files: 1,
      fields: 0
    },
    fileFilter(_req, file, callback) {
      const extension = path.extname(file.originalname).toLowerCase();
      const mimeTypes = allowedTypes.get(extension);
      if (!mimeTypes?.has(file.mimetype.toLowerCase())) {
        return callback(uploadTypeError());
      }
      callback(null, true);
    }
  });

  const router = express.Router();

  router.get('/upload/config', requireAuth, (_req, res) => {
    res.json({
      maxFileSize,
      mediaExtensions: {
        image: ['png', 'jpg', 'jpeg', 'gif', 'webp'],
        video: ['mp4', 'mov', 'webm']
      }
    });
  });

  router.get('/branding/logo', async (_req, res, next) => {
    if (!pool) return res.status(404).json({ error: 'Logo not found' });

    try {
      const [rows] = await pool.query(
        'SELECT json_data FROM settings WHERE id = ? LIMIT 1',
        ['global_config']
      );
      if (rows.length === 0) {
        return res.status(404).json({ error: 'Logo not found' });
      }

      const settings = typeof rows[0].json_data === 'string'
        ? JSON.parse(rows[0].json_data)
        : rows[0].json_data;
      const prefix = '/api/uploads/';
      const logoUrl = String(settings?.logoUrl || '');
      const filename = logoUrl.startsWith(prefix)
        ? logoUrl.slice(prefix.length)
        : '';
      const extension = path.extname(filename).toLowerCase();
      if (
        !isStoredFileName(filename) ||
        !['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(extension)
      ) {
        return res.status(404).json({ error: 'Logo not found' });
      }

      res.set({
        'Cache-Control': 'no-cache',
        'Content-Disposition': `inline; filename="${filename}"`,
        'X-Content-Type-Options': 'nosniff'
      });
      return res.sendFile(path.join(directory, filename), error => {
        if (!error) return;
        if (error.code === 'ENOENT') {
          return res.status(404).json({ error: 'Logo not found' });
        }
        next(error);
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/upload', requireAuth, (req, res) => {
    if (!canCreateUpload(req.authUser)) {
      return res.status(403).json({ error: 'Write access denied' });
    }
    upload.single('file')(req, res, error => {
      if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'File exceeds upload limit' });
      }
      if (error) {
        return res
          .status(error.statusCode || 400)
          .json({ error: error.message || 'Upload failed' });
      }
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }
      return res.json({
        url: `/api/uploads/${req.file.filename}`,
        filename: req.file.filename,
        cleanupToken: createCleanupToken(req.sessionToken, req.file.filename)
      });
    });
  });

  router.get('/uploads/:filename', requireAuth, async (req, res, next) => {
    const { filename } = req.params;
    if (!isStoredFileName(filename)) {
      return res.status(404).json({ error: 'File not found' });
    }

    try {
      const url = `/api/uploads/${filename}`;
      if (!(await canReadUpload(pool, req.authUser, url))) {
        return res.status(404).json({ error: 'File not found' });
      }
    } catch (error) {
      return next(error);
    }

    res.set('X-Content-Type-Options', 'nosniff');
    const filePath = path.join(directory, filename);
    const handleFileError = error => {
      if (!error) return;
      if (error.code === 'ENOENT') {
        return res.status(404).json({ error: 'File not found' });
      }
      next(error);
    };

    if (req.query.download === '1') {
      return res.download(filePath, filename, handleFileError);
    }

    res.set('Content-Disposition', `inline; filename="${filename}"`);
    return res.sendFile(filePath, handleFileError);
  });

  router.delete('/uploads/:filename', requireAuth, async (req, res, next) => {
    const { filename } = req.params;
    if (!canCreateUpload(req.authUser)) {
      return res.status(403).json({ error: 'Write access denied' });
    }
    if (
      !isStoredFileName(filename) ||
      !isValidCleanupToken(
        req.sessionToken,
        filename,
        req.get('x-upload-cleanup-token')
      )
    ) {
      return res.status(404).json({ error: 'File not found' });
    }

    try {
      const references = await findUploadReferences(pool, `/api/uploads/${filename}`);
      if (references.length > 0) {
        return res.status(409).json({ error: 'File is already in use' });
      }
      await unlink(path.join(directory, filename));
      return res.status(204).end();
    } catch (error) {
      if (error?.code === 'ENOENT') return res.status(204).end();
      return next(error);
    }
  });

  return router;
}
