import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import {
  appendFile,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  unlink,
  writeFile
} from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import multer from 'multer';
import { requireAuth } from '../auth/middleware.js';
import {
  getOrCreateThumbnail,
  isThumbnailImageFile,
  parseThumbnailWidth,
  removeThumbnailsForFile
} from '../media-thumbnails.js';
import { filterReadableRecords } from '../policies.js';

export const DEFAULT_UPLOAD_MAX_BYTES = 100 * 1024 * 1024;
export const VIDEO_UPLOAD_CHUNK_BYTES = 4 * 1024 * 1024;
const CHUNK_UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.webm']);

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

function isChunkUploadId(value) {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(value);
}

function validateVideoUploadMetadata({ fileName, fileSize, mimeType }, maxFileSize) {
  const normalizedFileName = String(fileName || '');
  const normalizedMimeType = String(mimeType || '').toLowerCase();
  if (
    normalizedFileName.length === 0 ||
    normalizedFileName.length > 255 ||
    normalizedMimeType.length === 0 ||
    normalizedMimeType.length > 100
  ) {
    return { error: 'Video metadata is invalid' };
  }
  const extension = path.extname(normalizedFileName).toLowerCase();
  const allowedMimeTypes = allowedTypes.get(extension);
  if (
    !VIDEO_EXTENSIONS.has(extension) ||
    !allowedMimeTypes?.has(normalizedMimeType)
  ) {
    return { error: 'Video type is not allowed' };
  }
  if (!Number.isInteger(fileSize) || fileSize <= 0 || fileSize > maxFileSize) {
    return { error: 'Video size is invalid' };
  }
  return { extension };
}

async function readChunkManifest(chunkDirectory, uploadId) {
  try {
    return JSON.parse(
      await readFile(path.join(chunkDirectory, uploadId, 'manifest.json'), 'utf8')
    );
  } catch (error) {
    if (error?.code === 'ENOENT' || error instanceof SyntaxError) return null;
    throw error;
  }
}

function expectedChunkSize(manifest, index) {
  if (index < manifest.chunkCount - 1) return manifest.chunkSize;
  return manifest.fileSize - (manifest.chunkCount - 1) * manifest.chunkSize;
}

async function listUploadedChunks(chunkDirectory, manifest) {
  const uploadedChunks = [];
  for (let index = 0; index < manifest.chunkCount; index += 1) {
    try {
      const chunkPath = path.join(chunkDirectory, manifest.uploadId, `${index}.part`);
      const chunkStat = await stat(chunkPath);
      if (chunkStat.size === expectedChunkSize(manifest, index)) {
        uploadedChunks.push(index);
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  return uploadedChunks;
}

async function pruneExpiredChunkUploads(chunkDirectory) {
  const entries = await readdir(chunkDirectory, { withFileTypes: true }).catch(() => []);
  await Promise.all(entries
    .filter(entry => entry.isDirectory() && isChunkUploadId(entry.name))
    .map(async entry => {
      const uploadPath = path.join(chunkDirectory, entry.name);
      const manifestPath = path.join(uploadPath, 'manifest.json');
      const manifestStat = await stat(manifestPath).catch(() => null);
      if (!manifestStat || Date.now() - manifestStat.mtimeMs > CHUNK_UPLOAD_TTL_MS) {
        await rm(uploadPath, { recursive: true, force: true });
      }
    }));
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

async function getArchiveDownloadName(pool, user, archiveId, url, filename) {
  if (typeof archiveId !== 'string' || !archiveId.trim()) return filename;
  const [rows] = await pool.query(
    'SELECT json_data FROM `archives` WHERE id = ? LIMIT 1',
    [archiveId.trim()]
  );
  if (rows.length === 0) return null;

  const archive = parseRecord(rows[0].json_data);
  if (archive.url !== url) return null;
  if (!isAdministrator(user)) {
    const [users, projects, channels] = await Promise.all([
      readJsonTable(pool, 'users'),
      readJsonTable(pool, 'projects'),
      readJsonTable(pool, 'channels')
    ]);
    const readable = filterReadableRecords(
      'archives',
      user,
      [archive],
      { users, projects, channels }
    );
    if (readable.length !== 1) return null;
  }

  const title = typeof archive.title === 'string' ? archive.title.trim() : '';
  if (!title) return filename;
  const extension = path.extname(filename);
  const baseTitle = extension && title.toLowerCase().endsWith(extension.toLowerCase())
    ? title.slice(0, -extension.length)
    : title;
  const safeTitle = baseTitle
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, '_')
    .replace(/[. ]+$/g, '')
    .slice(0, 200);
  return `${safeTitle || path.parse(filename).name}${extension}`;
}

export function createUploadsRouter({
  directory,
  maxFileSize = DEFAULT_UPLOAD_MAX_BYTES,
  pool
}) {
  if (!directory) throw new Error('upload directory is required');
  mkdirSync(directory, { recursive: true, mode: 0o750 });
  const chunkDirectory = path.join(directory, '.ierp-upload-chunks');

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
    void pruneExpiredChunkUploads(chunkDirectory).catch(() => undefined);
    res.json({
      maxFileSize,
      videoChunkSize: VIDEO_UPLOAD_CHUNK_BYTES,
      uploadConcurrency: 2,
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

  router.post('/upload/chunks/init', requireAuth, async (req, res, next) => {
    if (!canCreateUpload(req.authUser)) {
      return res.status(403).json({ error: 'Write access denied' });
    }

    try {
      const metadata = validateVideoUploadMetadata(req.body || {}, maxFileSize);
      if (metadata.error) return res.status(400).json({ error: metadata.error });

      await mkdir(chunkDirectory, { recursive: true, mode: 0o750 });
      await pruneExpiredChunkUploads(chunkDirectory);
      const requestedUploadId = req.body?.uploadId;
      const uploadId = requestedUploadId || randomUUID();
      if (!isChunkUploadId(uploadId)) {
        return res.status(400).json({ error: 'Upload id is invalid' });
      }

      let manifest = await readChunkManifest(chunkDirectory, uploadId);
      if (manifest) {
        if (manifest.ownerId !== req.authUser.id) {
          return res.status(404).json({ error: 'Upload session not found' });
        }
        const matchesExistingUpload =
          manifest.fileName === req.body.fileName &&
          manifest.fileSize === req.body.fileSize &&
          manifest.mimeType === req.body.mimeType;
        if (!matchesExistingUpload) {
          return res.status(409).json({ error: 'Upload session does not match this file' });
        }
        if (manifest.completedFilename) {
          const completedPath = path.join(directory, manifest.completedFilename);
          const completedStat = await stat(completedPath).catch(() => null);
          if (completedStat?.size === manifest.fileSize) {
            return res.json({
              uploadId,
              chunkSize: manifest.chunkSize,
              chunkCount: manifest.chunkCount,
              uploadedChunks: [],
              completedUpload: {
                url: `/api/uploads/${manifest.completedFilename}`,
                filename: manifest.completedFilename,
                cleanupToken: createCleanupToken(
                  req.sessionToken,
                  manifest.completedFilename
                )
              }
            });
          }
          await rm(path.join(chunkDirectory, uploadId), {
            recursive: true,
            force: true
          });
          manifest = null;
        }
      }
      if (!manifest) {
        manifest = {
          uploadId,
          ownerId: req.authUser.id,
          fileName: req.body.fileName,
          fileSize: req.body.fileSize,
          mimeType: req.body.mimeType,
          extension: metadata.extension,
          chunkSize: VIDEO_UPLOAD_CHUNK_BYTES,
          chunkCount: Math.ceil(req.body.fileSize / VIDEO_UPLOAD_CHUNK_BYTES),
          createdAt: new Date().toISOString()
        };
        const uploadPath = path.join(chunkDirectory, uploadId);
        await mkdir(uploadPath, { recursive: false, mode: 0o750 });
        await writeFile(
          path.join(uploadPath, 'manifest.json'),
          JSON.stringify(manifest),
          { flag: 'wx', mode: 0o640 }
        );
      }

      return res.json({
        uploadId,
        chunkSize: manifest.chunkSize,
        chunkCount: manifest.chunkCount,
        uploadedChunks: await listUploadedChunks(chunkDirectory, manifest)
      });
    } catch (error) {
      if (error?.code === 'EEXIST') {
        return res.status(409).json({ error: 'Upload session already exists' });
      }
      return next(error);
    }
  });

  router.put(
    '/upload/chunks/:uploadId/:index',
    requireAuth,
    express.raw({
      type: 'application/octet-stream',
      limit: VIDEO_UPLOAD_CHUNK_BYTES
    }),
    async (req, res, next) => {
      if (!canCreateUpload(req.authUser)) {
        return res.status(403).json({ error: 'Write access denied' });
      }

      const { uploadId } = req.params;
      const index = Number(req.params.index);
      if (!isChunkUploadId(uploadId) || !Number.isInteger(index)) {
        return res.status(400).json({ error: 'Chunk position is invalid' });
      }

      try {
        const manifest = await readChunkManifest(chunkDirectory, uploadId);
        if (!manifest || manifest.ownerId !== req.authUser.id) {
          return res.status(404).json({ error: 'Upload session not found' });
        }
        if (manifest.completedFilename) {
          return res.status(409).json({ error: 'Upload is already complete' });
        }
        if (index < 0 || index >= manifest.chunkCount) {
          return res.status(400).json({ error: 'Chunk position is invalid' });
        }
        if (!Buffer.isBuffer(req.body) || req.body.length !== expectedChunkSize(manifest, index)) {
          return res.status(400).json({ error: 'Chunk size is invalid' });
        }

        const uploadPath = path.join(chunkDirectory, uploadId);
        const temporaryPath = path.join(uploadPath, `${index}.${randomUUID()}.tmp`);
        const chunkPath = path.join(uploadPath, `${index}.part`);
        await writeFile(temporaryPath, req.body, { flag: 'wx', mode: 0o640 });
        await rename(temporaryPath, chunkPath);
        return res.status(204).end();
      } catch (error) {
        return next(error);
      }
    }
  );

  router.post('/upload/chunks/:uploadId/complete', requireAuth, async (req, res, next) => {
    if (!canCreateUpload(req.authUser)) {
      return res.status(403).json({ error: 'Write access denied' });
    }

    const { uploadId } = req.params;
    if (!isChunkUploadId(uploadId)) {
      return res.status(400).json({ error: 'Upload id is invalid' });
    }

    let temporaryPath = '';
    let uncommittedFinalPath = '';
    try {
      const manifest = await readChunkManifest(chunkDirectory, uploadId);
      if (!manifest || manifest.ownerId !== req.authUser.id) {
        return res.status(404).json({ error: 'Upload session not found' });
      }
      if (manifest.completedFilename) {
        const completedPath = path.join(directory, manifest.completedFilename);
        const completedStat = await stat(completedPath).catch(() => null);
        if (completedStat?.size === manifest.fileSize) {
          return res.json({
            url: `/api/uploads/${manifest.completedFilename}`,
            filename: manifest.completedFilename,
            cleanupToken: createCleanupToken(
              req.sessionToken,
              manifest.completedFilename
            )
          });
        }
        return res.status(409).json({ error: 'Completed video file is missing' });
      }
      const uploadedChunks = await listUploadedChunks(chunkDirectory, manifest);
      if (uploadedChunks.length !== manifest.chunkCount) {
        return res.status(409).json({
          error: 'Upload is incomplete',
          uploadedChunks
        });
      }

      const filename = `${randomUUID()}${manifest.extension}`;
      temporaryPath = path.join(directory, `.${filename}.${randomUUID()}.assembling`);
      const finalPath = path.join(directory, filename);
      await writeFile(temporaryPath, Buffer.alloc(0), { flag: 'wx', mode: 0o640 });
      for (let index = 0; index < manifest.chunkCount; index += 1) {
        const chunk = await readFile(
          path.join(chunkDirectory, uploadId, `${index}.part`)
        );
        await appendFile(temporaryPath, chunk);
      }
      const assembledStat = await stat(temporaryPath);
      if (assembledStat.size !== manifest.fileSize) {
        await rm(temporaryPath, { force: true });
        return res.status(409).json({ error: 'Assembled video size is invalid' });
      }

      await rename(temporaryPath, finalPath);
      temporaryPath = '';
      uncommittedFinalPath = finalPath;
      const uploadPath = path.join(chunkDirectory, uploadId);
      const completedManifest = {
        ...manifest,
        completedFilename: filename,
        completedAt: new Date().toISOString()
      };
      const completedManifestPath = path.join(
        uploadPath,
        `manifest.${randomUUID()}.tmp`
      );
      await writeFile(
        completedManifestPath,
        JSON.stringify(completedManifest),
        { flag: 'wx', mode: 0o640 }
      );
      await rename(completedManifestPath, path.join(uploadPath, 'manifest.json'));
      uncommittedFinalPath = '';
      await Promise.all(Array.from(
        { length: manifest.chunkCount },
        (_, index) => rm(path.join(uploadPath, `${index}.part`), { force: true })
      )).catch(() => undefined);
      return res.json({
        url: `/api/uploads/${filename}`,
        filename,
        cleanupToken: createCleanupToken(req.sessionToken, filename)
      });
    } catch (error) {
      if (temporaryPath) await rm(temporaryPath, { force: true }).catch(() => undefined);
      if (uncommittedFinalPath) {
        await rm(uncommittedFinalPath, { force: true }).catch(() => undefined);
      }
      return next(error);
    }
  });

  router.delete('/upload/chunks/:uploadId', requireAuth, async (req, res, next) => {
    if (!canCreateUpload(req.authUser)) {
      return res.status(403).json({ error: 'Write access denied' });
    }
    const { uploadId } = req.params;
    if (!isChunkUploadId(uploadId)) {
      return res.status(404).json({ error: 'Upload session not found' });
    }

    try {
      const manifest = await readChunkManifest(chunkDirectory, uploadId);
      if (!manifest) return res.status(204).end();
      if (manifest.ownerId !== req.authUser.id) {
        return res.status(404).json({ error: 'Upload session not found' });
      }
      await rm(path.join(chunkDirectory, uploadId), {
        recursive: true,
        force: true
      });
      return res.status(204).end();
    } catch (error) {
      return next(error);
    }
  });

  router.get('/uploads/:filename/thumbnail', requireAuth, async (req, res, next) => {
    const { filename } = req.params;
    if (!isStoredFileName(filename) || !isThumbnailImageFile(filename)) {
      return res.status(404).json({ error: 'Thumbnail not found' });
    }
    const width = parseThumbnailWidth(req.query.width);
    if (width === null) {
      return res.status(400).json({ error: 'Thumbnail width is invalid' });
    }

    try {
      const url = `/api/uploads/${filename}`;
      if (!(await canReadUpload(pool, req.authUser, url))) {
        return res.status(404).json({ error: 'Thumbnail not found' });
      }
      const thumbnailPath = await getOrCreateThumbnail(directory, filename, width);
      res.set({
        'Cache-Control': 'private, max-age=31536000, immutable',
        'Content-Disposition': `inline; filename="${path.basename(thumbnailPath)}"`,
        'Content-Type': 'image/webp',
        'X-Content-Type-Options': 'nosniff'
      });
      return res.sendFile(thumbnailPath, error => {
        if (!error) return;
        if (error.code === 'ENOENT') {
          return res.status(404).json({ error: 'Thumbnail not found' });
        }
        next(error);
      });
    } catch (error) {
      if (error?.code === 'ENOENT') {
        return res.status(404).json({ error: 'Thumbnail not found' });
      }
      if (error?.statusCode) {
        return res.status(error.statusCode).json({ error: error.message });
      }
      return next(error);
    }
  });

  router.get('/uploads/:filename', requireAuth, async (req, res, next) => {
    const { filename } = req.params;
    if (!isStoredFileName(filename)) {
      return res.status(404).json({ error: 'File not found' });
    }
    const url = `/api/uploads/${filename}`;

    try {
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
      let downloadName = filename;
      try {
        downloadName = await getArchiveDownloadName(
          pool,
          req.authUser,
          req.query.archiveId,
          url,
          filename
        );
      } catch (error) {
        return next(error);
      }
      if (!downloadName) {
        return res.status(404).json({ error: 'File not found' });
      }
      return res.download(filePath, downloadName, handleFileError);
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
      await removeThumbnailsForFile(directory, filename);
      return res.status(204).end();
    } catch (error) {
      if (error?.code === 'ENOENT') {
        await removeThumbnailsForFile(directory, filename).catch(() => undefined);
        return res.status(204).end();
      }
      return next(error);
    }
  });

  return router;
}
