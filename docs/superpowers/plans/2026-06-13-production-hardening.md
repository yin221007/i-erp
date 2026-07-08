# iERP Production Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a tested, data-compatible iERP release with server-side
authentication, reliable backup and rollback, repaired data operations, and a
secure configurable DeepSeek integration.

**Architecture:** Preserve the current React UI and MariaDB JSON resource data
while extracting the backend into focused modules. Deploy the result beside the
old version and switch Lucky only after a production-data-clone rehearsal.

**Tech Stack:** Node.js 20, Express, MariaDB/mysql2, React 18, TypeScript,
Vite, Node test runner, Supertest, Docker Compose, Nginx, Lucky.

---

## File Map

Create these focused backend modules:

- `server/app.js`: Express application factory and middleware ordering.
- `server/index.js`: startup, migrations, scheduler, and listener.
- `server/config.js`: validated environment configuration.
- `server/db.js`: pool and transaction helpers.
- `server/migrations.js`: ordered schema and data migrations.
- `server/auth/passwords.js`: versioned scrypt hashing and verification.
- `server/auth/sessions.js`: session creation, lookup, expiry, and revocation.
- `server/auth/middleware.js`: cookie authentication, origin checks, and roles.
- `server/policies.js`: explicit resource read/write policy.
- `server/routes/auth.js`: login, logout, current-user, and session routes.
- `server/routes/resources.js`: validated resource CRUD.
- `server/routes/recycle-bin.js`: restore, permanent delete, empty, cleanup.
- `server/routes/uploads.js`: authenticated upload and safe download.
- `server/routes/email.js`: authenticated email operations.
- `server/routes/ai.js`: DeepSeek proxy, streaming, limits, and usage.
- `server/services/backup.js`: backup metadata, retention, and status.
- `server/services/ai-models.js`: administrator-managed provider models.
- `scripts/backup.sh`: streaming host-side backup.
- `scripts/restore-drill.sh`: isolated restore verification.
- `scripts/deploy-blue-green.sh`: versioned deployment and health checks.
- `scripts/rollback.sh`: snapshot restore and Lucky rollback instructions.
- `tests/`: unit and API integration tests.

Modify:

- `server.js`: compatibility entrypoint that imports `server/index.js`.
- `App.tsx`: cookie-authenticated API client and stable error handling.
- `components/Login.tsx`: server login form.
- `components/AICenter.tsx`: backend AI gateway and dynamic models.
- `components/EmailClient.tsx`: sanitized content and no sensitive cache.
- `components/ProductionProgress.tsx`: stable record IDs.
- `types.ts`: safe user, session, AI model, and production record types.
- `package.json`, `package-lock.json`: tests and reproducible dependencies.
- `Dockerfile`, `Dockerfile.backend`, `docker-compose.yml`, `nginx.conf`.

## Phase 0: Protected Working Baseline

### Task 1: Create A Local Git Working Copy

**Files:**
- Source: `synology-ierp-production-2025-12-31/`
- Create: `ierp-hardening/`

- [ ] **Step 1: Copy the verified production snapshot**

Run:

```bash
cp -R synology-ierp-production-2025-12-31 ierp-hardening
cd ierp-hardening
```

Expected: the production snapshot remains unchanged and all edits happen in
`ierp-hardening`.

- [ ] **Step 2: Remove documentation-only snapshot metadata from the work copy**

Run:

```bash
find . -name '.DS_Store' -delete
```

Expected: no application source is removed.

- [ ] **Step 3: Initialize local-only version control**

Run:

```bash
git init
git add .
git commit -m "chore: baseline Synology production snapshot"
```

Expected: one root commit exists. Do not configure or add a remote while the
baseline still contains production-derived secrets.

- [ ] **Step 4: Verify the baseline build**

Run:

```bash
npm ci || npm install
npm run build
```

Expected: build succeeds with the already recorded missing CSS and large-chunk
warnings only.

## Phase 1: Test Harness And Backend Boundaries

### Task 2: Add The Test Harness

**Files:**
- Modify: `package.json`
- Create: `tests/helpers/test-db.js`
- Create: `tests/smoke/app-start.test.js`

- [ ] **Step 1: Add a failing application-factory test**

```js
// tests/smoke/app-start.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../server/app.js';

test('createApp returns an Express application without opening a port', () => {
  const app = createApp({
    pool: { execute: async () => [[]] },
    config: { publicOrigins: ['https://erp.example.test'] }
  });
  assert.equal(typeof app, 'function');
  assert.equal(typeof app.listen, 'function');
});
```

- [ ] **Step 2: Install test dependencies and verify RED**

Run:

```bash
npm install --save-dev supertest
node --test tests/smoke/app-start.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `server/app.js`.

- [ ] **Step 3: Add scripts**

```json
{
  "scripts": {
    "test": "node --test --test-concurrency=1",
    "test:unit": "node --test tests/unit",
    "test:api": "node --test --test-concurrency=1 tests/api",
    "build": "tsc && vite build"
  }
}
```

- [ ] **Step 4: Create the minimal application factory**

```js
// server/app.js
import express from 'express';

export function createApp({ pool, config }) {
  if (!pool) throw new Error('pool is required');
  if (!config) throw new Error('config is required');

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '2mb' }));
  app.get('/health/live', (_req, res) => res.json({ status: 'ok' }));
  return app;
}
```

- [ ] **Step 5: Verify GREEN and commit**

Run:

```bash
npm test
git add package.json package-lock.json server tests
git commit -m "test: add backend application harness"
```

Expected: all tests pass.

### Task 3: Add Validated Configuration And Startup

**Files:**
- Create: `server/config.js`
- Create: `server/db.js`
- Create: `server/index.js`
- Modify: `server.js`
- Test: `tests/unit/config.test.js`

- [ ] **Step 1: Write failing environment-validation tests**

```js
// tests/unit/config.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../../server/config.js';

test('production rejects missing database password', () => {
  assert.throws(
    () => loadConfig({ NODE_ENV: 'production', DB_HOST: 'db', DB_USER: 'u' }),
    /DB_PASSWORD/
  );
});

test('configuration never supplies a hardcoded database password', () => {
  const config = loadConfig({
    NODE_ENV: 'test',
    DB_HOST: 'db',
    DB_USER: 'u',
    DB_PASSWORD: 'secret',
    DB_NAME: 'ierp',
    SESSION_SECRET: 'a'.repeat(32),
    PUBLIC_ORIGINS: 'https://erp.example.test'
  });
  assert.equal(config.db.password, 'secret');
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test tests/unit/config.test.js`

Expected: FAIL because `server/config.js` does not exist.

- [ ] **Step 3: Implement strict configuration**

```js
// server/config.js
function required(env, name) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function loadConfig(env = process.env) {
  return {
    env: env.NODE_ENV || 'development',
    port: Number(env.PORT || 3000),
    trustProxy: Number(env.TRUST_PROXY || 1),
    publicOrigins: required(env, 'PUBLIC_ORIGINS')
      .split(',')
      .map(value => value.trim())
      .filter(Boolean),
    db: {
      host: required(env, 'DB_HOST'),
      port: Number(env.DB_PORT || 3306),
      user: required(env, 'DB_USER'),
      password: required(env, 'DB_PASSWORD'),
      database: required(env, 'DB_NAME')
    },
    session: {
      secret: required(env, 'SESSION_SECRET')
    },
    deepseek: {
      apiKey: env.DEEPSEEK_API_KEY?.trim() || ''
    }
  };
}
```

- [ ] **Step 4: Move startup behind migrations**

`server/index.js` must load config, create the pool, run migrations, create the
app, then listen. `server.js` must contain only:

```js
import './server/index.js';
```

- [ ] **Step 5: Verify and commit**

Run:

```bash
npm test
npm run build
git add server.js server tests
git commit -m "refactor: validate configuration and isolate startup"
```

Expected: tests and build pass; no literal production database password remains.

## Phase 2: Password Migration, Sessions, And Authorization

### Task 4: Implement Versioned Password Hashes

**Files:**
- Create: `server/auth/passwords.js`
- Test: `tests/unit/passwords.test.js`

- [ ] **Step 1: Write failing compatibility tests**

```js
// tests/unit/passwords.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hashPassword,
  verifyPassword,
  isPasswordHash
} from '../../server/auth/passwords.js';

test('scrypt hash verifies the original password', async () => {
  const stored = await hashPassword('原密码123');
  assert.equal(isPasswordHash(stored), true);
  assert.equal(await verifyPassword('原密码123', stored), true);
  assert.equal(await verifyPassword('wrong', stored), false);
});

test('two equal passwords receive different salts', async () => {
  assert.notEqual(await hashPassword('same'), await hashPassword('same'));
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test tests/unit/passwords.test.js`

Expected: FAIL because the password module does not exist.

- [ ] **Step 3: Implement scrypt**

Use `node:crypto` `randomBytes`, `scrypt`, and `timingSafeEqual`. Store values as:

```text
scrypt$v1$16384$8$1$<base64-salt>$<base64-derived-key>
```

Reject malformed values and cap parsed work factors before invoking scrypt.

- [ ] **Step 4: Verify GREEN and commit**

Run:

```bash
node --test tests/unit/passwords.test.js
git add server/auth/passwords.js tests/unit/passwords.test.js
git commit -m "feat: add versioned password hashing"
```

### Task 5: Add Idempotent Schema And Password Migration

**Files:**
- Create: `server/migrations.js`
- Test: `tests/integration/migrations.test.js`

- [ ] **Step 1: Write a failing migration test**

The test database must contain a legacy user JSON record:

```js
const legacyUser = {
  id: 'u-1',
  username: 'admin',
  password: 'password',
  isDefaultAdmin: true
};
```

After `runMigrations(pool)`:

```js
assert.match(migratedUser.password, /^scrypt\$v1\$/);
assert.equal(await verifyPassword('password', migratedUser.password), true);
assert.equal(await countMigrations(pool, '002_hash_user_passwords'), 1);
```

Run the migration twice and assert the password hash is unchanged on the second
run.

- [ ] **Step 2: Verify RED**

Run: `node --test --test-concurrency=1 tests/integration/migrations.test.js`

Expected: FAIL because migration tables and code do not exist.

- [ ] **Step 3: Implement ordered migrations**

Create:

```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(100) PRIMARY KEY,
  applied_at DATETIME(3) NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id CHAR(36) PRIMARY KEY,
  token_hash CHAR(64) NOT NULL UNIQUE,
  user_id VARCHAR(191) NOT NULL,
  user_agent VARCHAR(512) NOT NULL,
  ip_address VARCHAR(64) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  last_seen_at DATETIME(3) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  absolute_expires_at DATETIME(3) NOT NULL,
  revoked_at DATETIME(3) NULL,
  INDEX idx_auth_sessions_user (user_id),
  INDEX idx_auth_sessions_expiry (expires_at)
);
```

Migration `002_hash_user_passwords` must lock and scan users in bounded batches,
hash only non-versioned password values, update each JSON document by ID, and
record the migration only after all users succeed.

- [ ] **Step 4: Add production-ID migration**

For each production JSON document with no `id`, set:

```js
record.id = record.projectId;
```

Reject a migration if two records would produce the same ID.

- [ ] **Step 5: Verify, build, and commit**

Run:

```bash
npm test
npm run build
git add server/migrations.js tests
git commit -m "feat: add data-compatible schema migrations"
```

### Task 6: Add Cookie Sessions And Login

**Files:**
- Create: `server/auth/sessions.js`
- Create: `server/auth/middleware.js`
- Create: `server/routes/auth.js`
- Test: `tests/api/auth.test.js`

- [ ] **Step 1: Write failing API tests**

Cover:

```js
await request(app)
  .post('/api/auth/login')
  .send({ username: 'admin', password: 'password' })
  .expect(200)
  .expect('set-cookie', /ierp_session=.*HttpOnly.*Secure.*SameSite=Lax/);

await request(app)
  .get('/api/auth/me')
  .set('x-user-id', 'u-1')
  .expect(401);

await request(app)
  .get('/api/auth/me')
  .set('Cookie', loginCookie)
  .expect(200);
```

Also verify two logins create two sessions and revoking one does not revoke the
other.

- [ ] **Step 2: Verify RED**

Run: `node --test --test-concurrency=1 tests/api/auth.test.js`

Expected: login route is missing and forged headers are not rejected.

- [ ] **Step 3: Implement opaque sessions**

Generate 32 random bytes for the cookie token and store only:

```js
createHash('sha256').update(token).digest('hex')
```

Cookie settings:

```js
{
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/',
  maxAge: 30 * 24 * 60 * 60 * 1000
}
```

- [ ] **Step 4: Add login throttling and origin checking**

Limit failed logins to five attempts in 15 minutes per normalized username and
client IP. State-changing authenticated requests must reject an `Origin` not in
`config.publicOrigins`.

- [ ] **Step 5: Verify and commit**

Run:

```bash
npm test
git add server/auth server/routes/auth.js tests/api/auth.test.js
git commit -m "feat: replace client identity with secure sessions"
```

### Task 7: Enforce Resource Policies

**Files:**
- Create: `server/policies.js`
- Create: `server/routes/resources.js`
- Test: `tests/unit/policies.test.js`
- Test: `tests/api/resources-auth.test.js`

- [ ] **Step 1: Write failing policy tests**

Test at minimum:

- Anonymous reads return 401.
- Forged `x-user-id` cannot read users or backups.
- Normal users cannot update users, settings, or email configuration.
- AI messages are filtered to `record.userId === authenticatedUser.id`.
- User responses contain no `password`, `authCode`, or webhook secrets.
- Unknown resource names return 404 before SQL is constructed.

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test tests/unit/policies.test.js
node --test --test-concurrency=1 tests/api/resources-auth.test.js
```

Expected: current generic routes permit unauthorized access.

- [ ] **Step 3: Define an explicit immutable resource registry**

```js
export const RESOURCE_POLICIES = Object.freeze({
  projects: { read: 'authenticated', write: 'project-write' },
  clients: { read: 'authenticated', write: 'client-write' },
  users: { read: 'authenticated', write: 'admin' },
  settings: { read: 'authenticated', write: 'admin' },
  ai_messages: { read: 'owner', write: 'owner' },
  email_configs: { read: 'owner', write: 'owner' }
});
```

Include every existing resource explicitly. Never interpolate an unregistered
resource into SQL.

- [ ] **Step 4: Sanitize response shapes**

Create a `toSafeUser` function that copies only approved fields. Do not delete
properties from the original object because later middleware may reuse it.

- [ ] **Step 5: Verify and commit**

Run:

```bash
npm test
git add server/policies.js server/routes/resources.js tests
git commit -m "feat: enforce server-side resource authorization"
```

## Phase 3: Transactional Data Operations

### Task 8: Repair Production Record Persistence

**Files:**
- Modify: `types.ts`
- Modify: `App.tsx`
- Modify: `components/ProductionProgress.tsx`
- Test: `tests/unit/production-records.test.js`

- [ ] **Step 1: Write the failing normalization test**

```js
test('legacy production record receives projectId as stable id', () => {
  assert.deepEqual(
    normalizeProductionRecord({ projectId: 'p-7', projectName: 'A' }),
    { id: 'p-7', projectId: 'p-7', projectName: 'A' }
  );
});
```

- [ ] **Step 2: Verify RED**

Expected: `normalizeProductionRecord` does not exist.

- [ ] **Step 3: Require stable IDs**

Change `ProjectProduction.id` from optional to required. Normalize legacy data
on API input and migration. Create, update, local filtering, and delete must all
use `id`; `projectId` remains the business relation.

- [ ] **Step 4: Verify and commit**

Run:

```bash
npm test
npm run build
git add App.tsx components/ProductionProgress.tsx types.ts server tests
git commit -m "fix: persist production records by stable id"
```

### Task 9: Implement Transactional Recycle Bin

**Files:**
- Create: `server/routes/recycle-bin.js`
- Create: `server/services/recycle-bin.js`
- Test: `tests/api/recycle-bin.test.js`

- [ ] **Step 1: Write failing API tests**

Cover:

- Delete inserts one recycle entry and removes the live record atomically.
- Failed recycle insertion leaves the live record intact.
- Restore recreates the original resource and removes the recycle entry.
- Restore conflict returns 409 without overwriting.
- Permanent deletion removes only the recycle entry.
- Empty all requires administrator role.
- Cleanup deletes at most 500 expired entries per run.

- [ ] **Step 2: Verify RED**

Run: `node --test --test-concurrency=1 tests/api/recycle-bin.test.js`

Expected: restore and empty routes return 404.

- [ ] **Step 3: Implement transaction helper**

```js
export async function withTransaction(pool, operation) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await operation(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
```

- [ ] **Step 4: Implement explicit recycle routes**

Use:

```text
POST   /api/recycle-bin/:id/restore
DELETE /api/recycle-bin/:id
DELETE /api/recycle-bin
```

Do not route recycle-bin permanent deletion through generic resource deletion.

- [ ] **Step 5: Verify and commit**

Run:

```bash
npm test
git add server/routes/recycle-bin.js server/services/recycle-bin.js tests
git commit -m "fix: make recycle operations transactional"
```

## Phase 4: Bounded Backup And Restore

### Task 10: Add Backup Metadata And Retention Logic

**Files:**
- Create: `server/services/backup.js`
- Test: `tests/unit/backup-retention.test.js`

- [ ] **Step 1: Write failing retention tests**

Represent backup metadata as:

```js
{
  id: '20260613T120000Z-upgrade',
  kind: 'upgrade',
  status: 'complete',
  sizeBytes: 1234,
  locked: false,
  createdAt: '2026-06-13T12:00:00.000Z'
}
```

Assert:

- Seven newest daily backups remain.
- Three newest unlocked upgrade snapshots remain.
- Locked snapshots remain but count toward 500 GB.
- Oldest complete unlocked backups are selected before refusing a new backup.
- Incomplete backups are never considered a valid restore source.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/unit/backup-retention.test.js`

Expected: backup service does not exist.

- [ ] **Step 3: Implement pure retention selection**

Expose:

```js
selectBackupsToDelete(backups, {
  dailyRetention: 7,
  upgradeRetention: 3,
  capacityBytes: 500 * 1024 ** 3,
  requiredBytes
})
```

The function must return either `{ deleteIds }` or
`{ refused: true, reason }`; it must not delete files itself.

- [ ] **Step 4: Verify and commit**

Run:

```bash
npm test
git add server/services/backup.js tests/unit/backup-retention.test.js
git commit -m "feat: add bounded backup retention policy"
```

### Task 11: Add Streaming Backup Script

**Files:**
- Create: `scripts/backup.sh`
- Create: `tests/scripts/backup.bats`
- Modify: `docker-compose.yml`

- [ ] **Step 1: Write failing shell tests**

Tests must substitute fake `mariadb-dump`, `tar`, `sha256sum`, and `df` commands
and verify:

- The SQL stream is piped directly into gzip.
- A lock prevents concurrent jobs.
- Low disk space exits before creating a generation.
- Failure leaves no `complete` marker.
- Success writes `manifest.sha256` and `metadata.json`.

- [ ] **Step 2: Verify RED**

Run: `bats tests/scripts/backup.bats`

Expected: FAIL because `scripts/backup.sh` does not exist.

- [ ] **Step 3: Implement the bounded streaming pipeline**

Required structure:

```bash
set -euo pipefail
exec 9>"$BACKUP_ROOT/.backup.lock"
flock -n 9 || exit 75

umask 077
generation="$BACKUP_ROOT/.incomplete-$BACKUP_ID"
mkdir -p "$generation"

mariadb-dump \
  --single-transaction \
  --quick \
  --routines \
  --events \
  --host="$DB_HOST" \
  --user="$DB_USER" \
  --password="$DB_PASSWORD" \
  "$DB_NAME" | gzip -1 > "$generation/database.sql.gz"

tar --create --gzip --file="$generation/uploads.tar.gz" \
  --directory="$UPLOADS_ROOT" .
```

Calculate metadata and checksums, then atomically rename the incomplete
directory and create the `complete` marker.

- [ ] **Step 4: Add scheduler container limits**

Add a backup service with:

```yaml
mem_limit: 512m
cpus: 1.0
restart: unless-stopped
```

Mount backup, uploads, and deployment configuration paths explicitly. Do not
mount the Docker socket.

- [ ] **Step 5: Verify and commit**

Run:

```bash
bats tests/scripts/backup.bats
shellcheck scripts/backup.sh
git add scripts tests/scripts docker-compose.yml
git commit -m "feat: add streaming scheduled backups"
```

### Task 12: Add Restore Drill And Maintenance Restore

**Files:**
- Create: `scripts/restore-drill.sh`
- Create: `tests/scripts/restore-drill.bats`
- Remove behavior: browser JSON overwrite import

- [ ] **Step 1: Write failing restore tests**

Verify that restore:

- Rejects missing `complete` marker or failed checksum.
- Creates a new temporary database name.
- Imports SQL into that database.
- Verifies expected tables and row counts.
- Never issues `TRUNCATE TABLE` against the live database.

- [ ] **Step 2: Verify RED**

Run: `bats tests/scripts/restore-drill.bats`

- [ ] **Step 3: Implement isolated restore**

The script must generate a database name matching:

```text
ierp_restore_YYYYMMDD_HHMMSS
```

It imports there, compares `metadata.json`, reports success, and removes the
temporary database unless `KEEP_RESTORE_DB=1`.

- [ ] **Step 4: Remove unsafe import endpoint**

`POST /api/backup/import` must return `410 Gone` with instructions to use the
maintenance restore procedure. The frontend restore button must be removed or
replaced with a status link.

- [ ] **Step 5: Verify and commit**

Run:

```bash
npm test
bats tests/scripts/restore-drill.bats
git add scripts tests App.tsx server
git commit -m "fix: replace destructive browser restore with restore drill"
```

## Phase 5: Upload And Email Hardening

### Task 13: Restrict Uploads

**Files:**
- Create: `server/routes/uploads.js`
- Test: `tests/api/uploads.test.js`

- [ ] **Step 1: Write failing upload tests**

Assert:

- Anonymous upload returns 401.
- A 101 MB file returns 413 under the default 100 MB limit.
- `.html`, `.svg`, `.js`, and extension/MIME mismatches return 415.
- Stored names are generated and cannot contain `..`.
- Downloads include `Content-Disposition: attachment` and
  `X-Content-Type-Options: nosniff`.

- [ ] **Step 2: Verify RED**

Run: `node --test --test-concurrency=1 tests/api/uploads.test.js`

- [ ] **Step 3: Upgrade Multer and implement validation**

Run:

```bash
npm install multer@^2
```

Use a generated UUID file name, a fixed extension map, authenticated routes,
and cleanup of partially written files on error.

- [ ] **Step 4: Verify and commit**

Run:

```bash
npm test
npm audit --omit=dev --registry=https://registry.npmjs.org
git add package.json package-lock.json server/routes/uploads.js tests
git commit -m "fix: authenticate and constrain file uploads"
```

### Task 14: Secure Email Operations

**Files:**
- Create: `server/routes/email.js`
- Modify: `components/EmailClient.tsx`
- Test: `tests/api/email.test.js`

- [ ] **Step 1: Write failing tests**

Assert unauthenticated access is rejected, TLS verification remains enabled,
unapproved hosts are rejected, and raw email HTML containing scripts or event
attributes is sanitized.

- [ ] **Step 2: Verify RED**

Run: `node --test --test-concurrency=1 tests/api/email.test.js`

- [ ] **Step 3: Upgrade the mail stack**

Upgrade Nodemailer to the audited safe major and replace the unmaintained
`imap-simple` dependency with a maintained IMAP client. Adapt the route behind
an internal mail-service interface so provider changes do not affect the
frontend contract.

- [ ] **Step 4: Sanitize and stop localStorage caching**

Render sanitized HTML only. Persist message IDs and lightweight list metadata
in component state; fetch bodies on demand.

- [ ] **Step 5: Verify and commit**

Run:

```bash
npm test
npm run build
npm audit --omit=dev --registry=https://registry.npmjs.org
git add package.json package-lock.json server components/EmailClient.tsx tests
git commit -m "fix: secure mail transport and rendering"
```

## Phase 6: Configurable DeepSeek Gateway

### Task 15: Add AI Model Configuration

**Files:**
- Create: `server/services/ai-models.js`
- Create: `server/routes/ai.js`
- Test: `tests/api/ai-models.test.js`

- [ ] **Step 1: Write failing model tests**

Model records must support:

```js
{
  id: 'deepseek-model-1',
  provider: 'deepseek',
  modelId: 'provider-model-id',
  displayName: 'DeepSeek Model',
  enabled: true,
  reasoning: false,
  contextLimit: 64000,
  maxOutputTokens: 8192,
  sortOrder: 10
}
```

Verify administrators can add a new model ID without rebuilding the frontend,
normal users can list enabled safe fields only, and non-DeepSeek base URLs
cannot be configured.

- [ ] **Step 2: Verify RED**

Run: `node --test --test-concurrency=1 tests/api/ai-models.test.js`

- [ ] **Step 3: Implement model configuration**

Store model configuration in a dedicated resource or table. The API key remains
only in `DEEPSEEK_API_KEY`. Never return it from any route.

- [ ] **Step 4: Verify and commit**

Run:

```bash
npm test
git add server/services/ai-models.js server/routes/ai.js tests
git commit -m "feat: add configurable DeepSeek model registry"
```

### Task 16: Add Streaming DeepSeek Chat

**Files:**
- Modify: `server/routes/ai.js`
- Modify: `components/AICenter.tsx`
- Modify: `types.ts`
- Test: `tests/api/ai-chat.test.js`

- [ ] **Step 1: Write failing gateway tests**

Use a local fake upstream server and verify:

- The official DeepSeek host is used in production configuration.
- Browser requests never contain the provider API key.
- Unauthorized users receive 401.
- Disabled models receive 400.
- Requests time out and abort upstream.
- Concurrent requests per user are limited.
- AI message reads return only the authenticated user's messages.
- Usage records contain user, model, input tokens, output tokens, and status.

- [ ] **Step 2: Verify RED**

Run: `node --test --test-concurrency=1 tests/api/ai-chat.test.js`

- [ ] **Step 3: Implement the server stream**

The backend sends:

```http
Content-Type: text/event-stream
Cache-Control: no-cache
X-Accel-Buffering: no
```

Forward normalized token events only. Do not forward upstream headers or error
bodies containing credentials.

- [ ] **Step 4: Replace browser provider calls**

`AICenter.tsx` must:

- Fetch enabled models from `/api/ai/models`.
- POST conversations to `/api/ai/chat`.
- Render streamed tokens.
- Store uploaded file references, not Base64.
- Remove local API-key modal and `localStorage` key handling.

- [ ] **Step 5: Verify and commit**

Run:

```bash
npm test
npm run build
git add server/routes/ai.js components/AICenter.tsx types.ts tests
git commit -m "feat: proxy DeepSeek through the authenticated backend"
```

## Phase 7: Frontend Authentication And Build Cleanup

### Task 17: Convert Frontend To Cookie Authentication

**Files:**
- Create: `lib/api.ts`
- Modify: `App.tsx`
- Modify: `components/Login.tsx`
- Modify: `types.ts`
- Test: `tests/frontend/api-client.test.js`

- [ ] **Step 1: Write failing API client tests**

Verify every request uses:

```js
{ credentials: 'include' }
```

and never writes `x-user-id`. Verify 401 clears local user state and displays
the login screen.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/frontend/api-client.test.js`

- [ ] **Step 3: Implement one API client**

All frontend requests go through `apiFetch`. It sets JSON headers when needed,
includes credentials, parses structured errors, and handles 401 consistently.

- [ ] **Step 4: Replace client-side password comparison**

`Login.tsx` posts username and password to `/api/auth/login`. `App.tsx` restores
the session through `/api/auth/me`; it does not fetch all users before login.

- [ ] **Step 5: Verify and commit**

Run:

```bash
npm test
npm run build
rg -n "x-user-id|user\\.password ===|localStorage.*ai_key" .
git add lib App.tsx components/Login.tsx types.ts tests
git commit -m "fix: use server sessions throughout the frontend"
```

Expected: the final `rg` command returns no active authentication or AI-key
usage.

### Task 18: Make Builds Reproducible And Smaller

**Files:**
- Modify: `package.json`
- Create: `package-lock.json`
- Modify: `index.html`
- Modify: `App.tsx`
- Modify: `Dockerfile`
- Modify: `Dockerfile.backend`

- [ ] **Step 1: Record current build artifact size**

Run:

```bash
npm run build
find dist/assets -type f -maxdepth 1 -exec du -h {} +
```

Expected baseline: the main JavaScript bundle is approximately 1.58 MB.

- [ ] **Step 2: Upgrade build dependencies**

Upgrade Vite, its React plugin, and compatible TypeScript/esbuild versions as a
single change. Use Node 20 for all checks.

- [ ] **Step 3: Remove conflicting HTML loaders**

Keep one Vite module entry. Remove the missing `/index.css` reference, CDN
Tailwind, duplicate `index.tsx`, and the import map after confirming bundled
imports.

- [ ] **Step 4: Add route-level lazy imports**

Lazy-load AI center, email client, charts, and other large feature modules with
`React.lazy` and `Suspense`.

- [ ] **Step 5: Require lockfile installs**

Both Dockerfiles must copy `package.json` and `package-lock.json`, then use:

```dockerfile
RUN npm ci
```

The backend stage uses:

```dockerfile
RUN npm ci --omit=dev
```

- [ ] **Step 6: Verify and commit**

Run:

```bash
npm ci
npm test
npm run build
npm audit --registry=https://registry.npmjs.org
git add package.json package-lock.json index.html App.tsx Dockerfile*
git commit -m "build: make production artifacts reproducible"
```

Expected: no high or critical audit findings remain, build warnings are
resolved, and initial JavaScript is materially smaller than the baseline.

## Phase 8: Blue-Green Deployment And Rollback

### Task 19: Add Health Checks And Versioned Compose

**Files:**
- Modify: `docker-compose.yml`
- Modify: `nginx.conf`
- Create: `deploy/docker-compose.blue.yml`
- Create: `deploy/docker-compose.green.yml`
- Test: `tests/deploy/compose.test.js`

- [ ] **Step 1: Write failing deployment-config tests**

Parse Compose YAML and assert:

- Blue and green projects use different container names and host ports.
- Images use explicit immutable version tags.
- Both backend and frontend have health checks.
- Database and uploads paths are configurable.
- No service uses `latest`.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/deploy/compose.test.js`

- [ ] **Step 3: Add health checks**

Backend readiness checks database connectivity and completed migrations at
`/health/ready`. Frontend checks Nginx and proxies backend readiness.

- [ ] **Step 4: Verify and commit**

Run:

```bash
npm test
docker compose -f deploy/docker-compose.green.yml config
git add docker-compose.yml nginx.conf deploy tests/deploy
git commit -m "deploy: add isolated blue-green stacks"
```

### Task 20: Implement Rehearsal And Rollback Scripts

**Files:**
- Create: `scripts/deploy-blue-green.sh`
- Create: `scripts/rollback.sh`
- Create: `docs/runbooks/upgrade.md`
- Create: `docs/runbooks/rollback.md`
- Test: `tests/scripts/deploy-blue-green.bats`

- [ ] **Step 1: Write failing script tests**

Verify deployment refuses to continue unless:

- A complete upgrade snapshot exists.
- Restore drill status is successful.
- Green health checks pass.
- Migration and row-count comparison pass.
- The operator supplies an explicit Lucky cutover confirmation.

Verify rollback restores the pre-migration database and uploads before old
containers start.

- [ ] **Step 2: Verify RED**

Run: `bats tests/scripts/deploy-blue-green.bats`

- [ ] **Step 3: Implement deployment gates**

The script sequence is fixed:

```text
build tagged images
start green against cloned data
run automated tests
run business smoke checklist
enter maintenance mode
create upgrade snapshot
run final migration
verify counts and manifests
request explicit cutover confirmation
print Lucky target change
monitor health
```

The script must not modify Lucky automatically unless a separately reviewed
Lucky API integration is added later.

- [ ] **Step 4: Implement rollback gates**

Rollback requires a named complete upgrade snapshot and performs:

```text
maintenance mode
stop green writes
restore database snapshot
restore uploads snapshot
verify manifests
start old stack
print Lucky old target
verify old health
```

- [ ] **Step 5: Verify and commit**

Run:

```bash
bats tests/scripts/deploy-blue-green.bats
shellcheck scripts/deploy-blue-green.sh scripts/rollback.sh
git add scripts docs/runbooks tests/scripts
git commit -m "deploy: add guarded upgrade and rollback runbooks"
```

## Phase 9: Final Qualification

### Task 21: Run The Complete Release Gate

**Files:**
- Create: `scripts/verify-release.sh`
- Create: `docs/release/qualification-template.md`

- [ ] **Step 1: Implement one release command**

`scripts/verify-release.sh` must execute:

```bash
npm ci
npm test
npm run build
npm audit --registry=https://registry.npmjs.org
shellcheck scripts/*.sh
bats tests/scripts
docker compose -f deploy/docker-compose.green.yml config
```

It exits immediately on any failure.

- [ ] **Step 2: Run against a production-data clone**

Verify and record:

- Table row counts before and after migration.
- Upload file count, total bytes, and SHA-256 manifest.
- Login with every active original account using its original password.
- Multi-device login and administrator revocation.
- Role and cross-user isolation tests.
- Recycle-bin, production progress, upload, email, AI, backup, restore, and
  rollback smoke tests.

- [ ] **Step 3: Verify old-version recovery**

Perform one complete rollback rehearsal. The old version must start with the
restored pre-migration database and uploads and pass its existing business smoke
tests.

- [ ] **Step 4: Create the release commit and tag**

Run:

```bash
git add .
git commit -m "release: qualify hardened iERP deployment"
git tag -a ierp-hardened-v1 -m "Qualified hardened iERP release"
```

- [ ] **Step 5: Cut over and preserve rollback**

Switch Lucky to green only after approval. Keep the old stack, old images, and
upgrade snapshot for at least seven stable days. Cleanup requires a separate
human-approved operation.

## Self-review

- Spec coverage: authentication, original-password compatibility, multi-device
  sessions, authorization, 500 GB bounded backup, restore drill, recycle bin,
  production IDs, upload/email hardening, configurable DeepSeek models,
  reproducible dependencies, blue-green deployment, and rollback are mapped to
  tasks.
- Data safety: no task modifies the live Synology deployment before a complete
  snapshot and restore rehearsal.
- Rollback safety: old code is paired with restored pre-migration data.
- Secret safety: no provider or database secret is stored in frontend source,
  Git-tracked Compose files, API responses, or logs.

