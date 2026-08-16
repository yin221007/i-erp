import path from 'node:path';
import { chmod, mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';

export const THUMBNAIL_DIRECTORY_NAME = '.ierp-thumbnails';
export const THUMBNAIL_WIDTHS = Object.freeze([320, 640, 960]);
export const DEFAULT_THUMBNAIL_WIDTH = 640;

const IMAGE_EXTENSIONS = new Set(['.gif', '.jpeg', '.jpg', '.png', '.webp']);
const MAX_INPUT_PIXELS = 40_000_000;
const MAX_CONCURRENT_GENERATIONS = 2;
const inFlightGenerations = new Map();
const generationQueue = [];
let activeGenerations = 0;

export function isThumbnailImageFile(filename) {
  const normalized = String(filename || '');
  return path.basename(normalized) === normalized &&
    IMAGE_EXTENSIONS.has(path.extname(normalized).toLowerCase());
}

export function parseThumbnailWidth(value) {
  if (value === undefined || value === null || value === '') {
    return DEFAULT_THUMBNAIL_WIDTH;
  }
  const width = Number(value);
  return THUMBNAIL_WIDTHS.includes(width) ? width : null;
}

export function getThumbnailCachePrefix(filename) {
  const extension = path.extname(filename);
  return `${path.basename(filename, extension)}.`;
}

export function getThumbnailCacheName(filename, width, sourceStat) {
  if (!isThumbnailImageFile(filename)) {
    throw new Error('Thumbnail source type is not supported');
  }
  if (!THUMBNAIL_WIDTHS.includes(width)) {
    throw new Error('Thumbnail width is not supported');
  }
  const sourceVersion = `${sourceStat.size}.${Math.trunc(sourceStat.mtimeMs)}`;
  return `${getThumbnailCachePrefix(filename)}${sourceVersion}.w${width}.webp`;
}

function scheduleGeneration(generate) {
  return new Promise((resolve, reject) => {
    const run = async () => {
      activeGenerations += 1;
      try {
        resolve(await generate());
      } catch (error) {
        reject(error);
      } finally {
        activeGenerations -= 1;
        generationQueue.shift()?.();
      }
    };
    if (activeGenerations < MAX_CONCURRENT_GENERATIONS) {
      void run();
    } else {
      generationQueue.push(() => void run());
    }
  });
}

async function generateThumbnail(sourcePath, cachePath, width) {
  const temporaryPath = `${cachePath}.${randomUUID()}.tmp`;
  try {
    await sharp(sourcePath, {
      failOn: 'error',
      limitInputPixels: MAX_INPUT_PIXELS,
      sequentialRead: true
    })
      .rotate()
      .resize({
        width,
        height: width,
        fit: 'inside',
        withoutEnlargement: true
      })
      .webp({ quality: 76, effort: 4 })
      .toFile(temporaryPath);
    await chmod(temporaryPath, 0o640);
    await rename(temporaryPath, cachePath);
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}

export async function getOrCreateThumbnail(directory, filename, width) {
  if (!isThumbnailImageFile(filename)) {
    const error = new Error('Thumbnail source type is not supported');
    error.statusCode = 415;
    throw error;
  }
  if (!THUMBNAIL_WIDTHS.includes(width)) {
    const error = new Error('Thumbnail width is not supported');
    error.statusCode = 400;
    throw error;
  }

  const sourcePath = path.join(directory, filename);
  const sourceStat = await stat(sourcePath);
  if (!sourceStat.isFile()) {
    const error = new Error('Thumbnail source is not a file');
    error.code = 'ENOENT';
    throw error;
  }

  const cacheDirectory = path.join(directory, THUMBNAIL_DIRECTORY_NAME);
  await mkdir(cacheDirectory, { recursive: true, mode: 0o750 });
  const cachePath = path.join(
    cacheDirectory,
    getThumbnailCacheName(filename, width, sourceStat)
  );
  const cachedStat = await stat(cachePath).catch(() => null);
  if (cachedStat?.isFile() && cachedStat.size > 0) return cachePath;

  const existingGeneration = inFlightGenerations.get(cachePath);
  if (existingGeneration) return existingGeneration;

  const generation = scheduleGeneration(async () => {
    const currentStat = await stat(cachePath).catch(() => null);
    if (!currentStat?.isFile() || currentStat.size === 0) {
      await generateThumbnail(sourcePath, cachePath, width);
    }
    return cachePath;
  }).finally(() => {
    inFlightGenerations.delete(cachePath);
  });
  inFlightGenerations.set(cachePath, generation);
  return generation;
}

export async function removeThumbnailsForFile(directory, filename) {
  const cacheDirectory = path.join(directory, THUMBNAIL_DIRECTORY_NAME);
  const prefix = getThumbnailCachePrefix(filename);
  const entries = await readdir(cacheDirectory, { withFileTypes: true })
    .catch(error => {
      if (error?.code === 'ENOENT') return [];
      throw error;
    });
  await Promise.all(entries
    .filter(entry => entry.isFile() && entry.name.startsWith(prefix))
    .map(entry => rm(path.join(cacheDirectory, entry.name), { force: true })));
}
