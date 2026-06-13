import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('production HTML has one bundled entry and no runtime CDN loaders', async () => {
  const [html, entry] = await Promise.all([
    source('index.html'),
    source('index.tsx')
  ]);

  assert.equal((html.match(/<script type="module"/g) || []).length, 1);
  assert.doesNotMatch(html, /cdn\.tailwindcss\.com|esm\.sh|type="importmap"/);
  assert.doesNotMatch(html, /href="\/index\.css"/);
  assert.match(entry, /import ['"]\.\/index\.css['"]/);
});

test('large feature views are loaded as separate chunks', async () => {
  const app = await source('App.tsx');

  assert.match(app, /lazy\(\(\) => import\(['"]\.\/components\/AICenter['"]\)\)/);
  assert.match(app, /lazy\(\(\) => import\(['"]\.\/components\/EmailClient['"]\)\)/);
  assert.match(app, /<Suspense/);
});

test('container builds use lockfile-only dependency installation', async () => {
  const [frontend, backend] = await Promise.all([
    source('Dockerfile'),
    source('Dockerfile.backend')
  ]);

  assert.match(frontend, /COPY package\.json package-lock\.json/);
  assert.match(frontend, /RUN npm ci/);
  assert.match(backend, /COPY package\.json package-lock\.json/);
  assert.match(backend, /RUN npm ci --omit=dev/);
  assert.doesNotMatch(`${frontend}\n${backend}`, /npm install/);
});
