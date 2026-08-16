import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatProjectMediaSize,
  getFileExtension,
  getProjectMediaThumbnailUrl,
  getProjectMediaType,
  groupProjectMediaAlbums,
  projectMediaTitle,
  sortProjectMedia
} from '../../lib/project-media.js';

test('project media helpers classify only supported image and video extensions', () => {
  assert.equal(getProjectMediaType('现场.JPG'), 'image');
  assert.equal(getProjectMediaType('调试.webm'), 'video');
  assert.equal(getProjectMediaType('手机照片.heic'), null);
  assert.equal(getProjectMediaType('说明.pdf'), null);
  assert.equal(getFileExtension('../现场.photo.JPEG'), 'jpeg');
});

test('project media helpers format names and sizes for upload records', () => {
  assert.equal(projectMediaTitle('安装现场.mp4'), '安装现场');
  assert.equal(projectMediaTitle('无扩展名'), '无扩展名');
  assert.equal(formatProjectMediaSize(0), '0 B');
  assert.equal(formatProjectMediaSize(1024), '1.0 KB');
  assert.equal(formatProjectMediaSize(3 * 1024 * 1024), '3.0 MB');
});

test('project media thumbnails use protected fixed-width URLs only', () => {
  assert.equal(
    getProjectMediaThumbnailUrl('/api/uploads/1769674116177-400514667.jpg'),
    '/api/uploads/1769674116177-400514667.jpg/thumbnail?width=640'
  );
  assert.equal(
    getProjectMediaThumbnailUrl('/api/uploads/1769674116177-400514667.jpg', 320),
    '/api/uploads/1769674116177-400514667.jpg/thumbnail?width=320'
  );
  assert.equal(
    getProjectMediaThumbnailUrl('https://example.test/photo.jpg'),
    'https://example.test/photo.jpg'
  );
  assert.equal(
    getProjectMediaThumbnailUrl('/api/uploads/photo.jpg', 123),
    '/api/uploads/photo.jpg'
  );
});

test('project media records sort by captured date and then upload time descending', () => {
  const sorted = sortProjectMedia([
    { id: 'a', capturedAt: '2026-07-25', uploadDate: '2026-07-25T10:00:00Z' },
    { id: 'b', capturedAt: '2026-07-26', uploadDate: '2026-07-26T09:00:00Z' },
    { id: 'c', capturedAt: '2026-07-26', uploadDate: '2026-07-26T11:00:00Z' }
  ]);
  assert.deepEqual(sorted.map(item => item.id), ['c', 'b', 'a']);
});

test('project media records group by stable folder id and preserve legacy singles', () => {
  const albums = groupProjectMediaAlbums([
    {
      id: 'a',
      title: '照片一',
      mediaAlbumId: 'folder-1',
      mediaAlbumTitle: '设备定位',
      capturedAt: '2026-07-26',
      uploadDate: '2026-07-26T09:00:00Z'
    },
    {
      id: 'b',
      title: '照片二',
      mediaAlbumId: 'folder-1',
      mediaAlbumTitle: '设备定位',
      capturedAt: '2026-07-26',
      uploadDate: '2026-07-26T10:00:00Z'
    },
    {
      id: 'legacy',
      title: '旧记录',
      capturedAt: '2026-07-25',
      uploadDate: '2026-07-25T10:00:00Z'
    }
  ]);

  assert.equal(albums.length, 2);
  assert.equal(albums[0].id, 'folder-1');
  assert.deepEqual(albums[0].items.map(item => item.id), ['b', 'a']);
  assert.equal(albums[1].id, 'single-legacy');
});
