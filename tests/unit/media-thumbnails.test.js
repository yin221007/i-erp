import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {
  DEFAULT_THUMBNAIL_WIDTH,
  getOrCreateThumbnail,
  getThumbnailCacheName,
  isThumbnailImageFile,
  parseThumbnailWidth,
  removeThumbnailsForFile,
  THUMBNAIL_DIRECTORY_NAME
} from '../../server/media-thumbnails.js';

test('thumbnail inputs allow only safe image basenames and fixed widths', () => {
  assert.equal(isThumbnailImageFile('1769674116177-400514667.jpg'), true);
  assert.equal(isThumbnailImageFile('../1769674116177-400514667.jpg'), false);
  assert.equal(isThumbnailImageFile('1769674116177-400514667.mp4'), false);
  assert.equal(parseThumbnailWidth(undefined), DEFAULT_THUMBNAIL_WIDTH);
  assert.equal(parseThumbnailWidth('320'), 320);
  assert.equal(parseThumbnailWidth('641'), null);
});

test('thumbnail cache names are versioned by immutable source state', () => {
  const name = getThumbnailCacheName(
    '1769674116177-400514667.png',
    640,
    { size: 1234, mtimeMs: 5678.9 }
  );
  assert.equal(name, '1769674116177-400514667.1234.5678.w640.webp');
});

test('thumbnails are generated once, cached and removable', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ierp-thumbnail-'));
  const filename = '1769674116177-400514667.png';
  const sourcePath = path.join(directory, filename);
  try {
    await sharp({
      create: {
        width: 1200,
        height: 800,
        channels: 3,
        background: '#336699'
      }
    }).png().toFile(sourcePath);

    const firstPath = await getOrCreateThumbnail(directory, filename, 320);
    const firstStat = await stat(firstPath);
    const firstBuffer = await readFile(firstPath);
    assert.equal(path.extname(firstPath), '.webp');
    assert.ok(firstStat.size > 0);
    const metadata = await sharp(firstBuffer).metadata();
    assert.equal(metadata.format, 'webp');
    assert.equal(metadata.width, 320);

    const secondPath = await getOrCreateThumbnail(directory, filename, 320);
    const secondStat = await stat(secondPath);
    assert.equal(secondPath, firstPath);
    assert.equal(secondStat.mtimeMs, firstStat.mtimeMs);

    await removeThumbnailsForFile(directory, filename);
    assert.deepEqual(
      await readdir(path.join(directory, THUMBNAIL_DIRECTORY_NAME)),
      []
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
