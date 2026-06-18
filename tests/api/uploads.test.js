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
  constructor(logoUrl = '') {
    this.logoUrl = logoUrl;
  }

  async query(sql) {
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
        json_data: JSON.stringify({
          id: 'u-1',
          nickname: 'admin',
          role: 'Admin',
          isDefaultAdmin: true
        })
      }], []];
    }
    if (normalized.startsWith('UPDATE auth_sessions SET last_seen_at')) {
      return [{ affectedRows: 1 }, []];
    }
    throw new Error(`Unexpected SQL in upload test: ${normalized}`);
  }
}

async function withUploadApp(
  callback,
  { maxFileSize = 100, logoUrl = '' } = {}
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
    await callback(
      createApp({ pool: new UploadTestPool(logoUrl), config }),
      uploadDirectory
    );
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
