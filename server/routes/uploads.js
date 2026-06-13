import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import express from 'express';
import multer from 'multer';
import { requireAuth } from '../auth/middleware.js';

export const DEFAULT_UPLOAD_MAX_BYTES = 100 * 1024 * 1024;

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
    'application/x-acad',
    'application/octet-stream',
    'image/vnd.dwg'
  ])],
  ['.dxf', new Set([
    'application/dxf',
    'application/x-dxf',
    'application/octet-stream',
    'image/vnd.dxf'
  ])],
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

export function createUploadsRouter({
  directory,
  maxFileSize = DEFAULT_UPLOAD_MAX_BYTES
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

  router.post('/upload', requireAuth, (req, res) => {
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
        filename: req.file.filename
      });
    });
  });

  router.get('/uploads/:filename', requireAuth, (req, res, next) => {
    const { filename } = req.params;
    if (!isStoredFileName(filename)) {
      return res.status(404).json({ error: 'File not found' });
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

  return router;
}
