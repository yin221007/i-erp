import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
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
    assert.deepEqual(response.body.mediaExtensions, {
      image: ['png', 'jpg', 'jpeg', 'gif', 'webp'],
      video: ['mp4', 'mov', 'webm']
    });
  }, { maxFileSize: 321 });
});

test('stored files require visibility of the record that references the URL', async () => {
  const visibleFilename = '1769674116177-400514667.pdf';
  const hiddenFilename = '1769674116178-400514668.pdf';
  const visibleUrl = `/api/uploads/${visibleFilename}`;
  const hiddenUrl = `/api/uploads/${hiddenFilename}`;
  await withUploadApp(async (app, uploadDirectory) => {
    await writeFile(path.join(uploadDirectory, visibleFilename), 'visible');
    await writeFile(path.join(uploadDirectory, hiddenFilename), 'hidden');

    await request(app)
      .get(`/uploads/${visibleFilename}`)
      .set('Cookie', cookie)
      .expect(200);
    await request(app)
      .get(`/uploads/${hiddenFilename}`)
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
        { id: 'a-hidden', projectId: 'p-hidden', projectName: 'Hidden', url: hiddenUrl }
      ]
    }
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
