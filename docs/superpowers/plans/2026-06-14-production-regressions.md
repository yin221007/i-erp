# Production Regressions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore historical file preview/download and branded images, make payment-card hover feedback visible, and add a secure global DeepSeek API-key setting.

**Architecture:** Preserve all historical database rows and uploaded files by extending the authenticated upload route with a strict legacy filename allowlist and separate inline/download behavior. Add an encrypted server-only secret store and admin API for the shared DeepSeek key, while keeping the environment key as a fallback. Keep frontend changes local to the archive, payment, and settings components.

**Tech Stack:** Node.js 20, Express, MySQL 8, React 18, TypeScript, Tailwind CSS, Node test runner, Supertest, AES-256-GCM.

---

## File Map

- Modify `server/routes/uploads.js`: validate UUID and historical stored names, serve inline by default, and force attachment only for explicit downloads.
- Modify `components/EngineeringArchives.tsx`: generate explicit authenticated download URLs.
- Modify `tests/api/uploads.test.js`: prove historical compatibility, preview headers, download headers, and unsafe-name rejection.
- Modify `components/PaymentDashboard.tsx`: assign static semantic hover classes to each summary card.
- Modify `tests/frontend/api-client.test.js`: assert the visible hover and archive download wiring.
- Create `server/services/system-secrets.js`: encrypt, decrypt, read, write, delete, mask, and resolve the DeepSeek key.
- Create `tests/unit/system-secrets.test.js`: verify encryption round trips and non-plaintext storage.
- Modify `server/migrations.js`: add the `system_secrets` table through an additive migration.
- Modify `tests/integration/migrations.test.js`: support and verify the new migration.
- Modify `server/config.js`: expose the stable encryption secret to the AI router.
- Modify `server/app.js`: pass the encryption secret into the AI router.
- Modify `server/routes/ai.js`: add admin-only DeepSeek settings endpoints and dynamic key resolution.
- Modify `server/services/ai-gateway.js`: resolve the API key for every chat request.
- Create `tests/api/ai-settings.test.js`: verify authorization, masking, replacement, clearing, and environment fallback.
- Modify `tests/api/ai-chat.test.js`: verify a runtime database key reaches the official DeepSeek request.
- Modify `components/SystemSettings.tsx`: add the AI configuration tab and safe save/clear controls.
- Modify `tests/frontend/api-client.test.js`: verify the UI calls only the dedicated AI secret endpoints.

### Task 1: Restore Historical File Preview And Download

**Files:**
- Modify: `tests/api/uploads.test.js`
- Modify: `server/routes/uploads.js`
- Modify: `components/EngineeringArchives.tsx`
- Modify: `tests/frontend/api-client.test.js`

- [ ] **Step 1: Write failing API tests for historical files and response disposition**

Replace the attachment-only assertion with tests that create both stored-name
formats and require inline preview by default:

```js
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';

test('UUID and historical stored files preview inline and download explicitly', async () => {
  await withUploadApp(async (app, uploadDirectory) => {
    const names = [
      '123e4567-e89b-42d3-a456-426614174000.pdf',
      '1769674116177-400514667.pdf'
    ];
    for (const name of names) {
      await writeFile(path.join(uploadDirectory, name), 'pdf-data');

      const preview = await request(app)
        .get(`/uploads/${name}`)
        .set('Cookie', cookie)
        .expect(200);
      assert.match(preview.headers['content-disposition'], /^inline;/);

      const download = await request(app)
        .get(`/uploads/${name}?download=1`)
        .set('Cookie', cookie)
        .expect(200);
      assert.match(download.headers['content-disposition'], /^attachment;/);
    }
  });
});

test('stored-file access rejects arbitrary and traversal-style names', async () => {
  await withUploadApp(async app => {
    await request(app).get('/uploads/customer.pdf').set('Cookie', cookie).expect(404);
    await request(app).get('/uploads/1769674116177-script.js').set('Cookie', cookie).expect(404);
  });
});
```

- [ ] **Step 2: Run the upload tests and verify they fail**

Run: `node --test --test-concurrency=1 tests/api/uploads.test.js`

Expected: FAIL because the historical name is rejected and the UUID response
uses `attachment`.

- [ ] **Step 3: Implement strict dual-format validation and inline delivery**

In `server/routes/uploads.js`, retain the extension allowlist and use:

```js
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
```

Serve an explicit download with `res.download`; otherwise use `res.sendFile`
with an inline content disposition:

```js
const options = req.query.download === '1'
  ? { disposition: 'attachment' }
  : { disposition: 'inline' };
res.set('Content-Disposition', `${options.disposition}; filename="${filename}"`);
return res.sendFile(path.join(directory, filename), error => {
  if (!error) return;
  if (error.code === 'ENOENT') {
    return res.status(404).json({ error: 'File not found' });
  }
  next(error);
});
```

- [ ] **Step 4: Add explicit archive download URL wiring**

In `components/EngineeringArchives.tsx`, add:

```ts
const getDownloadUrl = (url: string) =>
  `${url}${url.includes('?') ? '&' : '?'}download=1`;
```

Use `href={getDownloadUrl(item.url)}` and
`href={getDownloadUrl(previewItem.url)}` for both download buttons. Keep the
plain URL in iframe and image preview sources.

- [ ] **Step 5: Add a frontend source regression assertion**

In `tests/frontend/api-client.test.js`, read `EngineeringArchives.tsx` and
assert:

```js
assert.match(archiveSource, /download=1/);
assert.match(archiveSource, /iframe src=\{previewItem\.url\}/);
```

- [ ] **Step 6: Run focused tests**

Run:
`node --test --test-concurrency=1 tests/api/uploads.test.js tests/frontend/api-client.test.js`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/routes/uploads.js components/EngineeringArchives.tsx tests/api/uploads.test.js tests/frontend/api-client.test.js
git commit -m "fix: restore historical uploaded files"
```

### Task 2: Restore Visible Payment Card Hover Feedback

**Files:**
- Modify: `tests/frontend/api-client.test.js`
- Modify: `components/PaymentDashboard.tsx`

- [ ] **Step 1: Write a failing static regression test**

Read `PaymentDashboard.tsx` and assert all semantic hover tokens are present:

```js
for (const className of [
  'hover:bg-slate-50',
  'hover:bg-emerald-50',
  'hover:bg-orange-50',
  'hover:bg-primary-50'
]) {
  assert.match(paymentSource, new RegExp(className.replace(':', '\\:')));
}
assert.doesNotMatch(paymentSource, /hover:bg-primary-50\/20/);
```

- [ ] **Step 2: Run the frontend test and verify it fails**

Run: `node --test tests/frontend/api-client.test.js`

Expected: FAIL because all four cards currently share the nearly transparent
primary hover.

- [ ] **Step 3: Add static semantic hover classes**

Add a `hover` property to each summary definition:

```ts
{ color: 'border-slate-600', hover: 'hover:bg-slate-50 hover:border-slate-300 dark:hover:bg-slate-700/70' }
{ color: 'border-emerald-500', hover: 'hover:bg-emerald-50 hover:border-emerald-300 dark:hover:bg-emerald-950/40' }
{ color: 'border-orange-500', hover: 'hover:bg-orange-50 hover:border-orange-300 dark:hover:bg-orange-950/40' }
{ color: 'border-primary-500', hover: 'hover:bg-primary-50 hover:border-primary-300 dark:hover:bg-primary-950/40' }
```

Insert `${stat.hover}` into the card class and remove
`hover:bg-primary-50/20 dark:hover:bg-primary-900/10`.

- [ ] **Step 4: Run the frontend test**

Run: `node --test tests/frontend/api-client.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/PaymentDashboard.tsx tests/frontend/api-client.test.js
git commit -m "fix: restore payment card hover feedback"
```

### Task 3: Add Encrypted System Secret Storage

**Files:**
- Create: `server/services/system-secrets.js`
- Create: `tests/unit/system-secrets.test.js`
- Modify: `server/migrations.js`
- Modify: `tests/integration/migrations.test.js`
- Modify: `server/config.js`

- [ ] **Step 1: Write failing secret-service unit tests**

Create an in-memory pool that records SQL parameters, then verify:

```js
const stored = await writeSystemSecret(pool, 'deepseek_api_key', 'sk-example-secret', masterSecret);
assert.equal(JSON.stringify(pool.row).includes('sk-example-secret'), false);
assert.equal(
  await readSystemSecret(pool, 'deepseek_api_key', masterSecret),
  'sk-example-secret'
);
assert.equal(maskSecret('sk-example-secret'), '********cret');
await deleteSystemSecret(pool, 'deepseek_api_key');
assert.equal(await readSystemSecret(pool, 'deepseek_api_key', masterSecret), null);
```

- [ ] **Step 2: Run the unit test and verify it fails**

Run: `node --test tests/unit/system-secrets.test.js`

Expected: FAIL because `server/services/system-secrets.js` does not exist.

- [ ] **Step 3: Implement AES-256-GCM storage**

Create `server/services/system-secrets.js` with:

```js
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes
} from 'node:crypto';

const CONTEXT = 'ierp:system-secrets:v1';

function encryptionKey(masterSecret) {
  return createHash('sha256').update(CONTEXT).update('\0').update(masterSecret).digest();
}

export async function writeSystemSecret(pool, name, plaintext, masterSecret) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(masterSecret), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  await pool.query(
    `INSERT INTO system_secrets (name, ciphertext, iv, auth_tag, updated_at)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP(3))
     ON DUPLICATE KEY UPDATE ciphertext = VALUES(ciphertext), iv = VALUES(iv),
       auth_tag = VALUES(auth_tag), updated_at = CURRENT_TIMESTAMP(3)`,
    [name, ciphertext.toString('base64'), iv.toString('base64'), authTag.toString('base64')]
  );
}
```

Implement matching `readSystemSecret`, `deleteSystemSecret`, and `maskSecret`
exports. Throw if the master secret is absent or shorter than 32 characters.

- [ ] **Step 4: Add the additive secret-table migration**

Append migration `005_create_system_secrets`:

```sql
CREATE TABLE IF NOT EXISTS system_secrets (
  name VARCHAR(64) NOT NULL,
  ciphertext TEXT NOT NULL,
  iv VARCHAR(64) NOT NULL,
  auth_tag VARCHAR(64) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
```

Update the migration test pool to accept this statement and assert
`MIGRATION_VERSIONS.at(-1) === '005_create_system_secrets'`.

- [ ] **Step 5: Expose the encryption secret in loaded configuration**

In `server/config.js`, add:

```js
secretEncryptionKey: sessionSecret,
```

Add a config test asserting the value is supplied only from `SESSION_SECRET`.

- [ ] **Step 6: Run focused tests**

Run:
`node --test --test-concurrency=1 tests/unit/system-secrets.test.js tests/unit/config.test.js tests/integration/migrations.test.js tests/api/health.test.js`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/services/system-secrets.js server/migrations.js server/config.js tests/unit/system-secrets.test.js tests/unit/config.test.js tests/integration/migrations.test.js
git commit -m "feat: add encrypted system secret storage"
```

### Task 4: Add Admin DeepSeek Settings API And Dynamic Key Resolution

**Files:**
- Create: `tests/api/ai-settings.test.js`
- Modify: `tests/api/ai-chat.test.js`
- Modify: `server/routes/ai.js`
- Modify: `server/services/ai-gateway.js`
- Modify: `server/app.js`

- [ ] **Step 1: Write failing API authorization and masking tests**

Use a pool that implements `system_secrets` reads/writes and mount:

```js
app.use(createAiRouter({
  pool,
  deepseek: { apiKey: '', baseUrl: 'https://api.deepseek.com' },
  secretEncryptionKey: 'm'.repeat(32)
}));
```

Verify:

```js
await request(userApp).get('/ai/settings').expect(403);
await request(adminApp).put('/ai/settings')
  .send({ apiKey: 'sk-1234567890abcdefghijklmnop' })
  .expect(200);
const status = await request(adminApp).get('/ai/settings').expect(200);
assert.equal(status.body.configured, true);
assert.equal(status.body.maskedKey.endsWith('mnop'), true);
assert.equal(JSON.stringify(status.body).includes('1234567890abcdef'), false);
await request(adminApp).delete('/ai/settings').expect(204);
```

Also verify whitespace-containing and oversized keys return 400.

- [ ] **Step 2: Write a failing runtime-key chat test**

Pass `resolveApiKey: async () => 'sk-runtime-database-key'` into the gateway
test and assert the upstream Authorization header is:

```js
assert.equal(
  upstreamRequest.options.headers.Authorization,
  'Bearer sk-runtime-database-key'
);
```

- [ ] **Step 3: Run the AI API tests and verify they fail**

Run:
`node --test --test-concurrency=1 tests/api/ai-settings.test.js tests/api/ai-chat.test.js`

Expected: FAIL because the settings endpoints and runtime resolver do not exist.

- [ ] **Step 4: Resolve a fresh key in the gateway**

Extend `createDeepSeekGateway`:

```js
export function createDeepSeekGateway({
  pool,
  config,
  resolveApiKey = async () => config.apiKey,
  fetchImpl = config.fetchImpl || globalThis.fetch
}) {
```

Inside the request `try` block:

```js
const apiKey = await resolveApiKey();
if (!apiKey) throw requestError('AI service is not configured', 503);
```

Use `Bearer ${apiKey}` rather than `config.apiKey`.

- [ ] **Step 5: Add admin-only settings endpoints**

In `server/routes/ai.js`, import the secret service, define
`DEEPSEEK_SECRET_NAME = 'deepseek_api_key'`, and resolve database-first with
environment fallback:

```js
const resolveApiKey = async () =>
  await readSystemSecret(pool, DEEPSEEK_SECRET_NAME, secretEncryptionKey) ||
  deepseek.apiKey;
```

Add authenticated administrator routes:

```js
router.get('/ai/settings', requireAuth, requireAdministrator, async (_req, res) => {
  const apiKey = await resolveApiKey();
  res.json({ configured: Boolean(apiKey), maskedKey: maskSecret(apiKey) });
});

router.put('/ai/settings', requireAuth, requireAdministrator, async (req, res) => {
  const apiKey = String(req.body?.apiKey || '').trim();
  if (apiKey.length < 20 || apiKey.length > 256 || /\s/.test(apiKey)) {
    return res.status(400).json({ error: 'DeepSeek API key is invalid' });
  }
  await writeSystemSecret(pool, DEEPSEEK_SECRET_NAME, apiKey, secretEncryptionKey);
  res.json({ configured: true, maskedKey: maskSecret(apiKey) });
});

router.delete('/ai/settings', requireAuth, requireAdministrator, async (_req, res) => {
  await deleteSystemSecret(pool, DEEPSEEK_SECRET_NAME);
  res.status(204).end();
});
```

Wrap route bodies with the existing generic error handler so plaintext and
cryptographic details never reach clients.

- [ ] **Step 6: Pass the encryption key from the application**

In `server/app.js`:

```js
app.use(createAiRouter({
  pool,
  deepseek: config.deepseek,
  secretEncryptionKey: config.secretEncryptionKey
}));
```

- [ ] **Step 7: Run focused AI tests**

Run:
`node --test --test-concurrency=1 tests/api/ai-settings.test.js tests/api/ai-chat.test.js tests/api/ai-models.test.js`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add server/routes/ai.js server/services/ai-gateway.js server/app.js tests/api/ai-settings.test.js tests/api/ai-chat.test.js
git commit -m "feat: configure DeepSeek through admin settings"
```

### Task 5: Add The DeepSeek System Settings UI

**Files:**
- Modify: `tests/frontend/api-client.test.js`
- Modify: `components/SystemSettings.tsx`

- [ ] **Step 1: Write a failing frontend source test**

Assert the component uses only the protected endpoints:

```js
assert.match(settingsSource, /\/ai\/settings/);
assert.match(settingsSource, /method:\s*'PUT'/);
assert.match(settingsSource, /method:\s*'DELETE'/);
assert.match(settingsSource, /type="password"/);
assert.doesNotMatch(settingsSource, /localSettings.*apiKey/);
```

- [ ] **Step 2: Run the frontend test and verify it fails**

Run: `node --test tests/frontend/api-client.test.js`

Expected: FAIL because the AI tab is absent.

- [ ] **Step 3: Add isolated AI-secret state and loading**

In `components/SystemSettings.tsx`, import `useEffect`, `KeyRound`, and
`apiJson`. Add:

```ts
type AiSettingsStatus = {
  configured: boolean;
  maskedKey: string;
};

const [activeSettingsTab, setActiveSettingsTab] =
  useState<'visual' | 'data' | 'ai'>('visual');
const [aiStatus, setAiStatus] =
  useState<AiSettingsStatus>({ configured: false, maskedKey: '' });
const [deepSeekApiKey, setDeepSeekApiKey] = useState('');
const [isSavingAi, setIsSavingAi] = useState(false);
```

When the dialog opens, call:

```ts
useEffect(() => {
  if (!isOpen) return;
  apiJson<AiSettingsStatus>(`${API_URL}/ai/settings`)
    .then(setAiStatus)
    .catch(() => setAiStatus({ configured: false, maskedKey: '' }));
}, [isOpen]);
```

- [ ] **Step 4: Add save and clear handlers**

Use dedicated calls that never touch `AppSettings`:

```ts
const handleSaveAiKey = async () => {
  if (!deepSeekApiKey.trim()) return;
  setIsSavingAi(true);
  try {
    const status = await apiJson<AiSettingsStatus>(`${API_URL}/ai/settings`, {
      method: 'PUT',
      json: { apiKey: deepSeekApiKey.trim() }
    });
    setAiStatus(status);
    setDeepSeekApiKey('');
  } finally {
    setIsSavingAi(false);
  }
};
```

Implement clear with `method: 'DELETE'`, an explicit browser confirmation, and
status reset after a successful response.

- [ ] **Step 5: Render the AI configuration tab**

Add a third tab button and a panel containing:

- Configured/unconfigured status.
- Masked suffix from the server.
- `type="password"` replacement input with autocomplete disabled.
- A save button disabled for blank input or while saving.
- An explicit clear button shown only when configured.
- Text stating that the key is global, administrator-only, encrypted on the
  server, and never displayed in full.

Keep the existing global settings button for branding settings; AI key save and
clear remain independent actions.

- [ ] **Step 6: Run frontend tests and production type checking**

Run:

```bash
node --test tests/frontend/api-client.test.js
npm run build
```

Expected: both PASS.

- [ ] **Step 7: Commit**

```bash
git add components/SystemSettings.tsx tests/frontend/api-client.test.js
git commit -m "feat: add DeepSeek system settings UI"
```

### Task 6: Full Verification And Synology Upgrade

**Files:**
- Modify only if verification finds a defect.

- [ ] **Step 1: Run the complete automated suite**

Run: `npm test`

Expected: all tests PASS with zero failures.

- [ ] **Step 2: Build production assets from the locked dependency set**

Run: `npm run build`

Expected: TypeScript and Vite complete successfully.

- [ ] **Step 3: Run release qualification**

Run: `npm run verify:release`

Expected: release verification reports success.

- [ ] **Step 4: Inspect the final diff and repository state**

Run:

```bash
git diff HEAD~5 --check
git status --short
git log --oneline -8
```

Expected: no whitespace errors and only intentional release artifacts, if any.

- [ ] **Step 5: Create a final Synology pre-upgrade backup**

Use the existing backup script and verify database dump, upload archive,
manifest, checksums, retention, and the 500 GB cap before replacing containers.

Expected: a new timestamped, checksum-valid snapshot exists and the current
production image/version identifier is recorded.

- [ ] **Step 6: Build and stage the candidate release**

Transfer the committed source archive to the existing releases directory,
verify SHA-256, build the frontend/backend images, and retain the current
`84b9fa3190bf3d0ca7d9308733be9ed2333c1203` image/version for immediate
rollback.

Expected: candidate images build without changing the live database or uploads.

- [ ] **Step 7: Perform the accepted maintenance-window cutover**

Stop the current green application containers, start the candidate with the
same persistent database/uploads and internal port, then wait for health to
report no pending migrations.

Expected: the Lucky upstream remains
`http://127.0.0.1:10667` and the public address remains unchanged.

- [ ] **Step 8: Verify required production behavior**

Check:

```text
GET /api/health
authenticated preview of one historical PDF
authenticated ?download=1 for the same PDF
authenticated load of one historical avatar and the application logo
payment dashboard visible hover feedback
admin AI settings status/save screen
existing account login and core data counts
public URL through Lucky
```

Expected: all checks pass with the original accounts, passwords, records, and
files intact.

- [ ] **Step 9: Roll back automatically if a required check fails**

Recreate the application containers with the recorded prior image/version and
leave the additive `system_secrets` table in place because the prior version
ignores it. Restore the pre-upgrade data snapshot only if a data integrity check
changed.

Expected: the prior production version is reachable through the unchanged
Lucky address.

- [ ] **Step 10: Record deployment evidence**

Record commit SHA, image IDs, backup path/checksum, health output, data counts,
public response, and rollback command in the release log.
