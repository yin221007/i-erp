import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import sharp from 'sharp';
import { createApp } from '../../server/app.js';

const token = 'a'.repeat(32);
const cookie = `ierp_session=${token}`;
const origin = 'https://erp.example.test';

class UploadTestPool {
  constructor(logoUrl = '', { user, resources } = {}) {
    this.logoUrl = logoUrl;
    this.user = user || {
      id: 'u-1',
      nickname: 'admin',
      department: '总经办',
      role: 'Admin',
      permission: 'ReadWrite',
      isDefaultAdmin: true
    };
    this.resources = resources || {};
  }

  async query(sql, parameters = []) {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    if (normalized.startsWith('SELECT json_data FROM settings WHERE id = ?')) {
      return [this.logoUrl ? [{
        json_data: JSON.stringify({ logoUrl: this.logoUrl })
      }] : [], []];
    }
    if (normalized.includes('FROM auth_sessions AS sessions')) {
      return [[{
        session_id: 'session-1',
        expires_at: new Date(Date.now() + 60_000),
        absolute_expires_at: new Date(Date.now() + 120_000),
          json_data: JSON.stringify(this.user)
      }], []];
    }
    if (normalized.startsWith('UPDATE auth_sessions SET last_seen_at')) {
      return [{ affectedRows: 1 }, []];
    }
    const referenceMatch = normalized.match(
      /^SELECT json_data FROM `([a-z_]+)` WHERE JSON_SEARCH\(json_data, 'one', \?\) IS NOT NULL$/
    );
    if (referenceMatch) {
      const records = this.resources[referenceMatch[1]] || [];
      return [records
        .filter(record => JSON.stringify(record).includes(parameters[0]))
        .map(record => ({ json_data: JSON.stringify(record) })), []];
    }
    const tableMatch = normalized.match(
      /^SELECT json_data FROM `([a-z_]+)` ORDER BY created_at ASC$/
    );
    if (tableMatch) {
      const records = tableMatch[1] === 'users'
        ? [this.user, ...(this.resources.users || [])]
        : this.resources[tableMatch[1]] || [];
      return [records.map(record => ({ json_data: JSON.stringify(record) })), []];
    }
    const recordByIdMatch = normalized.match(
      /^SELECT json_data FROM `([a-z_]+)` WHERE id = \? LIMIT 1$/
    );
    if (recordByIdMatch) {
      const record = (this.resources[recordByIdMatch[1]] || [])
        .find(item => item.id === parameters[0]);
      return [record ? [{ json_data: JSON.stringify(record) }] : [], []];
    }
    throw new Error(`Unexpected SQL in upload test: ${normalized}`);
  }
}

async function withUploadApp(
  callback,
  { maxFileSize = 100, logoUrl = '', user, resources } = {}
) {
  const uploadDirectory = await mkdtemp(path.join(tmpdir(), 'ierp-upload-'));
  const config = {
    trustProxy: 1,
    publicOrigins: [origin],
    uploads: {
      directory: uploadDirectory,
      maxFileSize
    }
  };
  try {
    const pool = new UploadTestPool(logoUrl, { user, resources });
    await callback(createApp({ pool, config }), uploadDirectory, pool);
  } finally {
    await rm(uploadDirectory, { recursive: true, force: true });
  }
}

test('anonymous uploads are rejected', async () => {
  await withUploadApp(async app => {
    await request(app)
      .post('/upload')
      .set('Origin', origin)
      .attach('file', Buffer.from('hello'), {
        filename: 'note.txt',
        contentType: 'text/plain'
      })
      .expect(401);
  });
});

test('read-only users cannot create raw uploads', async () => {
  await withUploadApp(async app => {
    await request(app)
      .post('/upload')
      .set('Cookie', cookie)
      .set('Origin', origin)
      .attach('file', Buffer.from('hello'), {
        filename: 'note.txt',
        contentType: 'text/plain'
      })
      .expect(403);
  }, {
    user: {
      id: 'u-read',
      nickname: 'reader',
      department: '销售部',
      role: 'User',
      permission: 'Read',
      isDefaultAdmin: false
    }
  });
});

test('authenticated clients can read the effective media upload limit', async () => {
  await withUploadApp(async app => {
    await request(app).get('/upload/config').expect(401);

    const response = await request(app)
      .get('/upload/config')
      .set('Cookie', cookie)
      .expect(200);

    assert.equal(response.body.maxFileSize, 321);
    assert.equal(response.body.videoChunkSize, 4 * 1024 * 1024);
    assert.equal(response.body.uploadConcurrency, 2);
    assert.deepEqual(response.body.mediaExtensions, {
      image: ['png', 'jpg', 'jpeg', 'gif', 'webp'],
      video: ['mp4', 'mov', 'webm']
    });
  }, { maxFileSize: 321 });
});

test('video chunks resume from completed parts and assemble the original file', async () => {
  const chunkSize = 4 * 1024 * 1024;
  const video = Buffer.concat([
    Buffer.alloc(chunkSize, 0x61),
    Buffer.from('resumable-video-tail')
  ]);

  await withUploadApp(async (app, uploadDirectory) => {
    const initialize = () => request(app)
      .post('/upload/chunks/init')
      .set('Cookie', cookie)
      .set('Origin', origin)
      .send({
        fileName: 'training.mp4',
        fileSize: video.length,
        mimeType: 'video/mp4'
      });

    const initial = await initialize().expect(200);
    assert.equal(initial.body.chunkSize, chunkSize);
    assert.equal(initial.body.chunkCount, 2);
    assert.deepEqual(initial.body.uploadedChunks, []);

    await request(app)
      .put(`/upload/chunks/${initial.body.uploadId}/0`)
      .set('Cookie', cookie)
      .set('Origin', origin)
      .set('Content-Type', 'application/octet-stream')
      .send(video.subarray(0, chunkSize))
      .expect(204);

    const resumed = await request(app)
      .post('/upload/chunks/init')
      .set('Cookie', cookie)
      .set('Origin', origin)
      .send({
        uploadId: initial.body.uploadId,
        fileName: 'training.mp4',
        fileSize: video.length,
        mimeType: 'video/mp4'
      })
      .expect(200);
    assert.deepEqual(resumed.body.uploadedChunks, [0]);

    await request(app)
      .put(`/upload/chunks/${initial.body.uploadId}/1`)
      .set('Cookie', cookie)
      .set('Origin', origin)
      .set('Content-Type', 'application/octet-stream')
      .send(video.subarray(chunkSize))
      .expect(204);

    const completed = await request(app)
      .post(`/upload/chunks/${initial.body.uploadId}/complete`)
      .set('Cookie', cookie)
      .set('Origin', origin)
      .send({})
      .expect(200);

    assert.match(completed.body.filename, /^[0-9a-f-]+\.mp4$/i);
    const repeatedCompletion = await request(app)
      .post(`/upload/chunks/${initial.body.uploadId}/complete`)
      .set('Cookie', cookie)
      .set('Origin', origin)
      .send({})
      .expect(200);
    assert.equal(repeatedCompletion.body.filename, completed.body.filename);

    const resumedAfterCompletion = await request(app)
      .post('/upload/chunks/init')
      .set('Cookie', cookie)
      .set('Origin', origin)
      .send({
        uploadId: initial.body.uploadId,
        fileName: 'training.mp4',
        fileSize: video.length,
        mimeType: 'video/mp4'
      })
      .expect(200);
    assert.equal(
      resumedAfterCompletion.body.completedUpload.filename,
      completed.body.filename
    );
    assert.deepEqual(
      await readFile(path.join(uploadDirectory, completed.body.filename)),
      video
    );
    assert.deepEqual(await readdir(
      path.join(
        uploadDirectory,
        '.ierp-upload-chunks',
        initial.body.uploadId
      )
    ), ['manifest.json']);
  }, { maxFileSize: 10 * 1024 * 1024 });
});

test('video chunk endpoints reject invalid sizes and file types', async () => {
  await withUploadApp(async app => {
    await request(app)
      .post('/upload/chunks/init')
      .set('Cookie', cookie)
      .set('Origin', origin)
      .send({
        fileName: 'unsafe.txt',
        fileSize: 10,
        mimeType: 'text/plain'
      })
      .expect(400);

    const initial = await request(app)
      .post('/upload/chunks/init')
      .set('Cookie', cookie)
      .set('Origin', origin)
      .send({
        fileName: 'short.mp4',
        fileSize: 10,
        mimeType: 'video/mp4'
      })
      .expect(200);

    await request(app)
      .put(`/upload/chunks/${initial.body.uploadId}/0`)
      .set('Cookie', cookie)
      .set('Origin', origin)
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.alloc(9))
      .expect(400);
  }, { maxFileSize: 1024 });
});

test('an owned unfinished video session can be discarded', async () => {
  await withUploadApp(async (app, uploadDirectory) => {
    const initial = await request(app)
      .post('/upload/chunks/init')
      .set('Cookie', cookie)
      .set('Origin', origin)
      .send({
        fileName: 'discard.mp4',
        fileSize: 10,
        mimeType: 'video/mp4'
      })
      .expect(200);

    await request(app)
      .delete(`/upload/chunks/${initial.body.uploadId}`)
      .set('Cookie', cookie)
      .set('Origin', origin)
      .expect(204);

    assert.deepEqual(
      await readdir(path.join(uploadDirectory, '.ierp-upload-chunks')),
      []
    );
  }, { maxFileSize: 1024 });
});

test('stored files require visibility of the record that references the URL', async () => {
  const visibleFilename = '1769674116177-400514667.pdf';
  const hiddenFilename = '1769674116178-400514668.pdf';
  const visibleImageFilename = '1769674116179-400514669.png';
  const hiddenImageFilename = '1769674116180-400514670.png';
  const visibleUrl = `/api/uploads/${visibleFilename}`;
  const hiddenUrl = `/api/uploads/${hiddenFilename}`;
  const visibleImageUrl = `/api/uploads/${visibleImageFilename}`;
  const hiddenImageUrl = `/api/uploads/${hiddenImageFilename}`;
  const image = await sharp({
    create: {
      width: 16,
      height: 16,
      channels: 3,
      background: '#336699'
    }
  }).png().toBuffer();
  await withUploadApp(async (app, uploadDirectory) => {
    await writeFile(path.join(uploadDirectory, visibleFilename), 'visible');
    await writeFile(path.join(uploadDirectory, hiddenFilename), 'hidden');
    await writeFile(path.join(uploadDirectory, visibleImageFilename), image);
    await writeFile(path.join(uploadDirectory, hiddenImageFilename), image);

    await request(app)
      .get(`/uploads/${visibleFilename}`)
      .set('Cookie', cookie)
      .expect(200);
    await request(app)
      .get(`/uploads/${hiddenFilename}`)
      .set('Cookie', cookie)
      .expect(404);
    await request(app)
      .get(`/uploads/${visibleImageFilename}/thumbnail`)
      .set('Cookie', cookie)
      .expect(200);
    await request(app)
      .get(`/uploads/${hiddenImageFilename}/thumbnail`)
      .set('Cookie', cookie)
      .expect(404);
  }, {
    user: {
      id: 'u-1',
      nickname: 'Alice',
      department: '销售部',
      role: 'User',
      permission: 'ReadWrite',
      isDefaultAdmin: false
    },
    resources: {
      users: [{ id: 'u-2', nickname: 'Bob', department: '工程部' }],
      projects: [
        { id: 'p-visible', name: 'Visible', manager: 'Alice' },
        { id: 'p-hidden', name: 'Hidden', manager: 'Bob' }
      ],
      archives: [
        { id: 'a-visible', projectId: 'p-visible', projectName: 'Visible', url: visibleUrl },
        { id: 'a-hidden', projectId: 'p-hidden', projectName: 'Hidden', url: hiddenUrl },
        { id: 'i-visible', projectId: 'p-visible', projectName: 'Visible', url: visibleImageUrl },
        { id: 'i-hidden', projectId: 'p-hidden', projectName: 'Hidden', url: hiddenImageUrl }
      ]
    }
  });
});

test('protected image thumbnails are generated lazily, cached and cleaned up', async () => {
  const image = await sharp({
    create: {
      width: 1200,
      height: 800,
      channels: 3,
      background: '#336699'
    }
  }).png().toBuffer();

  await withUploadApp(async (app, uploadDirectory) => {
    const uploadResponse = await request(app)
      .post('/upload')
      .set('Cookie', cookie)
      .set('Origin', origin)
      .attach('file', image, {
        filename: 'site-photo.png',
        contentType: 'image/png'
      })
      .expect(200);
    const thumbnailUrl = `/uploads/${uploadResponse.body.filename}/thumbnail?width=320`;

    await request(app)
      .get(thumbnailUrl)
      .expect(401);
    await request(app)
      .get(`/uploads/${uploadResponse.body.filename}/thumbnail?width=123`)
      .set('Cookie', cookie)
      .expect(400);

    const first = await request(app)
      .get(thumbnailUrl)
      .set('Cookie', cookie)
      .expect(200);
    assert.match(first.headers['content-type'], /^image\/webp/);
    assert.equal(
      first.headers['cache-control'],
      'private, max-age=31536000, immutable'
    );
    assert.equal(first.headers['x-content-type-options'], 'nosniff');

    const cacheDirectory = path.join(uploadDirectory, '.ierp-thumbnails');
    const cacheEntries = await readdir(cacheDirectory);
    assert.equal(cacheEntries.length, 1);
    const firstCache = await readFile(path.join(cacheDirectory, cacheEntries[0]));

    const second = await request(app)
      .get(thumbnailUrl)
      .set('Cookie', cookie)
      .expect(200);
    assert.deepEqual(second.body, first.body);
    assert.deepEqual(
      await readFile(path.join(cacheDirectory, cacheEntries[0])),
      firstCache
    );

    await request(app)
      .delete(`/uploads/${uploadResponse.body.filename}`)
      .set('Cookie', cookie)
      .set('Origin', origin)
      .set('X-Upload-Cleanup-Token', uploadResponse.body.cleanupToken)
      .expect(204);
    assert.deepEqual(await readdir(cacheDirectory), []);
  }, { maxFileSize: image.length + 1024 });
});

test('thumbnail routes reject non-image uploads', async () => {
  await withUploadApp(async (app, uploadDirectory) => {
    const filename = '1769674116177-400514667.mp4';
    await writeFile(path.join(uploadDirectory, filename), 'video');
    await request(app)
      .get(`/uploads/${filename}/thumbnail`)
      .set('Cookie', cookie)
      .expect(404);
  });
});

test('uploads over the configured limit return 413 without retaining a partial file', async () => {
  await withUploadApp(async (app, uploadDirectory) => {
    await request(app)
      .post('/upload')
      .set('Cookie', cookie)
      .set('Origin', origin)
      .attach('file', Buffer.alloc(101), {
        filename: 'note.txt',
        contentType: 'text/plain'
      })
      .expect(413);

    assert.deepEqual(await readdir(uploadDirectory), []);
  });
});

test('CAD and BIM drawing uploads accept common browser MIME variants', async () => {
  await withUploadApp(async app => {
    const cases = [
      ['plan.dwg', 'application/x-dwg'],
      ['plan.dwg', 'image/x-dwg'],
      ['plan.dxf', 'application/x-dxf'],
      ['model.rvt', 'application/octet-stream'],
      ['family.rfa', 'application/octet-stream'],
      ['kitchen.skp', 'application/vnd.sketchup.skp'],
      ['building.ifc', 'text/plain']
    ];

    for (const [filename, contentType] of cases) {
      const response = await request(app)
        .post('/upload')
        .set('Cookie', cookie)
        .set('Origin', origin)
        .attach('file', Buffer.from('drawing-data'), {
          filename,
          contentType
        })
        .expect(200);

      assert.match(response.body.url, /^\/api\/uploads\/[0-9a-f-]+\.[a-z0-9]+$/);
    }
  });
});

test('unsafe extensions and extension MIME mismatches return 415', async () => {
  await withUploadApp(async app => {
    for (const filename of ['page.html', 'icon.svg', 'script.js']) {
      await request(app)
        .post('/upload')
        .set('Cookie', cookie)
        .set('Origin', origin)
        .attach('file', Buffer.from('unsafe'), {
          filename,
          contentType: 'text/plain'
        })
        .expect(415);
    }

    await request(app)
      .post('/upload')
      .set('Cookie', cookie)
      .set('Origin', origin)
      .attach('file', Buffer.from('not an image'), {
        filename: 'image.png',
        contentType: 'text/plain'
      })
      .expect(415);
  });
});

test('stored names are generated and preview inline by default', async () => {
  await withUploadApp(async (app, uploadDirectory) => {
    const uploadResponse = await request(app)
      .post('/upload')
      .set('Cookie', cookie)
      .set('Origin', origin)
      .attach('file', Buffer.from('hello'), {
        filename: '../customer-note.txt',
        contentType: 'text/plain'
      })
      .expect(200);

    assert.match(
      uploadResponse.body.filename,
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.txt$/i
    );
    assert.equal(uploadResponse.body.filename.includes('..'), false);
    assert.deepEqual(await readdir(uploadDirectory), [uploadResponse.body.filename]);

    const previewResponse = await request(app)
      .get(`/uploads/${uploadResponse.body.filename}`)
      .set('Cookie', cookie)
      .expect(200);

    assert.match(previewResponse.headers['content-disposition'], /^inline;/);
    assert.equal(previewResponse.headers['x-content-type-options'], 'nosniff');
    assert.equal(previewResponse.text, 'hello');

    const downloadResponse = await request(app)
      .get(`/uploads/${uploadResponse.body.filename}?download=1`)
      .set('Cookie', cookie)
      .expect(200);

    assert.match(downloadResponse.headers['content-disposition'], /^attachment;/);
    assert.equal(downloadResponse.text, 'hello');
  });
});

test('an unreferenced upload can be removed only with its cleanup token', async () => {
  await withUploadApp(async (app, uploadDirectory) => {
    const uploadResponse = await request(app)
      .post('/upload')
      .set('Cookie', cookie)
      .set('Origin', origin)
      .attach('file', Buffer.from('temporary'), {
        filename: 'temporary.txt',
        contentType: 'text/plain'
      })
      .expect(200);

    await request(app)
      .delete(`/uploads/${uploadResponse.body.filename}`)
      .set('Cookie', cookie)
      .set('Origin', origin)
      .set('X-Upload-Cleanup-Token', 'invalid')
      .expect(404);
    assert.deepEqual(await readdir(uploadDirectory), [uploadResponse.body.filename]);

    await request(app)
      .delete(`/uploads/${uploadResponse.body.filename}`)
      .set('Cookie', cookie)
      .set('Origin', origin)
      .set('X-Upload-Cleanup-Token', uploadResponse.body.cleanupToken)
      .expect(204);
    assert.deepEqual(await readdir(uploadDirectory), []);
  });
});

test('historical timestamp filenames preview inline and download explicitly', async () => {
  await withUploadApp(async (app, uploadDirectory) => {
    const filename = '1769674116177-400514667.pdf';
    await writeFile(path.join(uploadDirectory, filename), 'pdf-data');

    const previewResponse = await request(app)
      .get(`/uploads/${filename}`)
      .set('Cookie', cookie)
      .expect(200);
    assert.match(previewResponse.headers['content-disposition'], /^inline;/);

    const downloadResponse = await request(app)
      .get(`/uploads/${filename}?download=1`)
      .set('Cookie', cookie)
      .expect(200);
    assert.match(downloadResponse.headers['content-disposition'], /^attachment;/);
  });
});

test('archive downloads use the current archive title and preserve the stored extension', async () => {
  const filename = '1769674116177-400514667.pdf';
  const url = `/api/uploads/${filename}`;
  await withUploadApp(async (app, uploadDirectory) => {
    await writeFile(path.join(uploadDirectory, filename), 'pdf-data');

    const renamedDownload = await request(app)
      .get(`/uploads/${filename}?download=1&archiveId=archive-1`)
      .set('Cookie', cookie)
      .expect(200);
    assert.match(
      renamedDownload.headers['content-disposition'],
      /filename="renamed-material\.pdf"/
    );

    const existingExtension = await request(app)
      .get(`/uploads/${filename}?download=1&archiveId=archive-2`)
      .set('Cookie', cookie)
      .expect(200);
    assert.match(
      existingExtension.headers['content-disposition'],
      /filename="already-named\.pdf"/
    );

    await request(app)
      .get(`/uploads/${filename}?download=1&archiveId=missing`)
      .set('Cookie', cookie)
      .expect(404);
    await request(app)
      .get(`/uploads/${filename}?download=1&archiveId=other-file`)
      .set('Cookie', cookie)
      .expect(404);
  }, {
    resources: {
      archives: [
        { id: 'archive-1', title: 'renamed-material', url },
        { id: 'archive-2', title: 'already-named.pdf', url },
        {
          id: 'other-file',
          title: 'wrong-reference',
          url: '/api/uploads/1769674116178-400514668.pdf'
        }
      ]
    }
  });
});

test('stored-file access rejects arbitrary and unsupported filenames', async () => {
  await withUploadApp(async app => {
    await request(app)
      .get('/uploads/customer.pdf')
      .set('Cookie', cookie)
      .expect(404);
    await request(app)
      .get('/uploads/1769674116177-400514667.js')
      .set('Cookie', cookie)
      .expect(404);
  });
});

test('only the configured application logo is publicly readable', async () => {
  const filename = '1767161533189-876402811.png';
  await withUploadApp(async (app, uploadDirectory) => {
    await writeFile(path.join(uploadDirectory, filename), 'png-data');

    const response = await request(app)
      .get('/branding/logo')
      .expect(200);

    assert.match(response.headers['content-disposition'], /^inline;/);
    assert.equal(response.headers['x-content-type-options'], 'nosniff');

    await request(app)
      .get(`/uploads/${filename}`)
      .expect(401);
  }, {
    logoUrl: `/api/uploads/${filename}`
  });
});
