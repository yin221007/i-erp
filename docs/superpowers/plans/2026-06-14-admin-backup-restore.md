# Administrator Backup And Restore Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an administrator-only UI and API for verified backup listing,
manual backup requests, and guarded maintenance restores through a signed
host-executor queue.

**Architecture:** Express reads backup metadata from a read-only mount and
writes HMAC-signed jobs to a dedicated queue after administrator password
re-authentication. A host-side executor validates and consumes only the fixed
job schema, invokes versioned backup/restore scripts, controls only the named
iERP containers, and writes atomic status files. The web container never
receives Docker access.

**Tech Stack:** React 18, TypeScript, Express, Node.js crypto/fs APIs, MariaDB,
Bash, Docker Compose, Synology Task Scheduler.

---

## File Map

- `server/services/maintenance-jobs.js`: canonical job signing, validation,
  queue writes, status reads, and single-job checks.
- `server/services/backup-catalog.js`: contained backup-directory discovery and
  sanitized metadata.
- `server/routes/backup.js`: administrator listing and password-confirmed job
  APIs.
- `server/config.js`: backup root, queue root, and maintenance secret.
- `server/app.js`: inject backup services into the router.
- `server/services/backup.js`: manual and pre-restore retention support.
- `scripts/maintenance-executor.sh`: fixed host executor and phase state
  machine.
- `scripts/maintenance-restore.sh`: validated restore plus automatic rollback.
- `scripts/install-maintenance-executor.sh`: idempotent Synology scheduler
  installation instructions and wrapper.
- `deploy/maintenance/`: static maintenance response image and Compose file.
- `docker-compose.yml`: read-only backup mount and queue mount for backend.
- `components/SystemSettings.tsx`: backup list, manual backup, restore
  confirmation, and job status.
- `types.ts`: backup and maintenance job API shapes.

### Task 1: Backup Catalog

**Files:**
- Create: `server/services/backup-catalog.js`
- Create: `tests/unit/backup-catalog.test.js`

- [ ] **Step 1: Write failing containment and metadata tests**

Cover complete snapshots, missing required files, invalid directory names,
malformed metadata, symlinks, and paths outside the configured root.

```js
const catalog = createBackupCatalog({ backupRoot });
const backups = await catalog.list();
assert.deepEqual(backups[0], {
  id: '20260613T225651Z-upgrade',
  kind: 'upgrade',
  status: 'complete',
  selectable: true,
  sizeBytes: 293203968,
  uploadFileCount: 113,
  restoreDrillVerified: false
});
```

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test tests/unit/backup-catalog.test.js
```

Expected: module-not-found failure.

- [ ] **Step 3: Implement the contained catalog**

Use `realpath`, `lstat`, `readdir({ withFileTypes: true })`, and strict backup
ID validation. Return only sanitized metadata and validation flags.

- [ ] **Step 4: Verify GREEN and commit**

```bash
node --test tests/unit/backup-catalog.test.js
git add server/services/backup-catalog.js tests/unit/backup-catalog.test.js
git commit -m "feat: add verified backup catalog"
```

### Task 2: Signed Maintenance Jobs

**Files:**
- Create: `server/services/maintenance-jobs.js`
- Create: `tests/unit/maintenance-jobs.test.js`

- [ ] **Step 1: Write failing signing and queue tests**

Test canonical serialization, HMAC verification, tamper detection, expiry,
nonce replay rejection, atomic request writes, atomic status reads, and
rejection when a pending or running job exists.

```js
const job = await queue.enqueue({
  operation: 'restore',
  backupId: '20260613T225651Z-upgrade',
  requestedBy: 'u-1'
});
assert.equal(verifyMaintenanceJob(job, secret), true);
```

- [ ] **Step 2: Verify RED**

```bash
node --test tests/unit/maintenance-jobs.test.js
```

- [ ] **Step 3: Implement fixed-schema HMAC jobs**

Allow only `backup` and `restore`, UUID IDs, generated nonces, five-minute
expiry, and validated backup IDs. Write `pending/<id>.json` through a temporary
file and rename.

- [ ] **Step 4: Verify GREEN and commit**

```bash
node --test tests/unit/maintenance-jobs.test.js
git add server/services/maintenance-jobs.js tests/unit/maintenance-jobs.test.js
git commit -m "feat: add signed maintenance job queue"
```

### Task 3: Administrator Backup API

**Files:**
- Modify: `server/routes/backup.js`
- Modify: `server/app.js`
- Modify: `server/config.js`
- Modify: `tests/unit/config.test.js`
- Create: `tests/api/backup-management.test.js`

- [ ] **Step 1: Write failing API tests**

Cover:

- Unauthenticated and normal users cannot list or request jobs.
- Administrators can list sanitized backups.
- Manual backup and restore require the current password.
- Restore requires `confirmation === backupId`.
- Invalid or unselectable backup IDs are rejected.
- A second active job returns `409`.
- Responses never include host paths, signatures, or secrets.

- [ ] **Step 2: Verify RED**

```bash
node --test --test-concurrency=1 tests/api/backup-management.test.js
```

- [ ] **Step 3: Add configuration**

Require:

```text
BACKUP_ROOT
MAINTENANCE_QUEUE_ROOT
MAINTENANCE_JOB_SECRET
```

The secret must contain at least 32 characters. Test startup rejection when it
is missing or weak.

- [ ] **Step 4: Implement routes**

```text
GET  /backup/catalog
GET  /backup/jobs
GET  /backup/jobs/:id
POST /backup/jobs
```

The POST body is:

```json
{
  "operation": "restore",
  "backupId": "20260613T225651Z-upgrade",
  "confirmation": "20260613T225651Z-upgrade",
  "currentPassword": "..."
}
```

Use `verifyPassword` against `req.authUser.password`, never log the body, and
apply an in-memory per-user/IP failure limiter matching the login limiter
pattern.

- [ ] **Step 5: Verify GREEN and commit**

```bash
node --test --test-concurrency=1 tests/api/backup-management.test.js tests/unit/config.test.js
git add server/routes/backup.js server/app.js server/config.js tests/api/backup-management.test.js tests/unit/config.test.js
git commit -m "feat: add administrator backup management API"
```

### Task 4: Retention And Manual Backup

**Files:**
- Modify: `server/services/backup.js`
- Modify: `scripts/backup.sh`
- Modify: `tests/unit/backup-retention.test.js`
- Modify: `tests/scripts/backup-script.test.js`

- [ ] **Step 1: Write failing retention tests**

Add `manual` and `pre-restore` kinds. Retain three manual backups and all
locked pre-restore snapshots while still enforcing the global 500 GB cap.

- [ ] **Step 2: Verify RED**

```bash
node --test tests/unit/backup-retention.test.js tests/scripts/backup-script.test.js
```

- [ ] **Step 3: Extend backup kinds and metadata**

Permit:

```text
daily
upgrade
manual
pre-restore
```

Pre-restore snapshots include a lock marker. Manual backups use the same
streaming dump, uploads archive, checksum, free-space, and single-job lock.

- [ ] **Step 4: Verify GREEN and commit**

```bash
node --test tests/unit/backup-retention.test.js tests/scripts/backup-script.test.js
git add server/services/backup.js scripts/backup.sh tests/unit/backup-retention.test.js tests/scripts/backup-script.test.js
git commit -m "feat: support manual and pre-restore backups"
```

### Task 5: Host Maintenance Executor

**Files:**
- Create: `scripts/maintenance-executor.sh`
- Create: `scripts/maintenance-restore.sh`
- Create: `tests/scripts/maintenance-executor.test.js`
- Create: `tests/scripts/maintenance-restore.test.js`

- [ ] **Step 1: Write failing static and behavior tests**

Assert:

- Strict job-field allowlist and HMAC verification.
- No `eval`, arbitrary shell input, user paths, or user container names.
- Atomic pending-to-running claim.
- Fixed iERP release, database, uploads, backup, and container configuration.
- Restore ordering: verify snapshot, restore drill, pre-restore backup,
  maintenance response, stop app, restore database, restore uploads, start app,
  compare counts, remove maintenance.
- Trap-driven rollback after every destructive phase.
- Status phases are atomically persisted.

- [ ] **Step 2: Verify RED**

```bash
node --test tests/scripts/maintenance-executor.test.js tests/scripts/maintenance-restore.test.js
```

- [ ] **Step 3: Implement executor**

The executor accepts no positional user input. It reads fixed environment from
the release `.env`, claims one pending job, verifies it with a Node helper from
the immutable release, and dispatches only:

```bash
run_manual_backup
run_guarded_restore
```

- [ ] **Step 4: Implement guarded restore**

Reuse `deploy-lib.sh` helpers. Restore into staging and promote uploads
atomically. Preserve the selected and pre-restore snapshots. On failure,
restore the pre-restore snapshot and restart the same pre-job images.

- [ ] **Step 5: Verify syntax, tests, and commit**

```bash
bash -n scripts/maintenance-executor.sh scripts/maintenance-restore.sh
node --test tests/scripts/maintenance-executor.test.js tests/scripts/maintenance-restore.test.js
git add scripts/maintenance-executor.sh scripts/maintenance-restore.sh tests/scripts/maintenance-executor.test.js tests/scripts/maintenance-restore.test.js
git commit -m "feat: add guarded host maintenance executor"
```

### Task 6: Maintenance Response And Compose Isolation

**Files:**
- Create: `deploy/maintenance/Dockerfile`
- Create: `deploy/maintenance/nginx.conf`
- Create: `deploy/maintenance/index.html`
- Create: `deploy/docker-compose.maintenance.yml`
- Modify: `docker-compose.yml`
- Modify: `tests/deploy/compose.test.js`
- Modify: `tests/scripts/maintenance-executor.test.js`

- [ ] **Step 1: Write failing deployment tests**

Require:

- Backend backup mount is read-only.
- Queue mount is separate and writable.
- Backend has no Docker socket.
- Maintenance container binds only `127.0.0.1:10667`.
- Executor stops the frontend before starting maintenance and stops
  maintenance before restarting frontend.

- [ ] **Step 2: Verify RED**

```bash
node --test tests/deploy/compose.test.js tests/scripts/maintenance-executor.test.js
```

- [ ] **Step 3: Implement mounts and maintenance image**

Mount:

```yaml
- "${BACKUP_PATH}:/app/backups:ro"
- "${MAINTENANCE_QUEUE_PATH}:/app/maintenance-queue"
```

The maintenance image returns HTTP 503 with `Retry-After` for application
routes and a static maintenance page for `/`.

- [ ] **Step 4: Verify GREEN and commit**

```bash
node --test tests/deploy/compose.test.js tests/scripts/maintenance-executor.test.js
git add docker-compose.yml deploy/maintenance deploy/docker-compose.maintenance.yml tests/deploy/compose.test.js tests/scripts/maintenance-executor.test.js
git commit -m "feat: isolate maintenance mode deployment"
```

### Task 7: Administrator UI

**Files:**
- Modify: `types.ts`
- Modify: `components/SystemSettings.tsx`
- Create: `tests/frontend/backup-center.test.js`

- [ ] **Step 1: Write failing source-contract tests**

Require catalog loading, manual-backup modal, restore modal, password input,
exact backup-ID confirmation, maintenance acknowledgement, status polling, and
no backup file upload input.

- [ ] **Step 2: Verify RED**

```bash
node --test tests/frontend/backup-center.test.js
```

- [ ] **Step 3: Implement UI**

Show compact backup cards and job progress in `数据维护`. Disable destructive
actions while any job is pending/running. Clear password fields after every
request and when the modal closes.

- [ ] **Step 4: Verify GREEN, build, and commit**

```bash
node --test tests/frontend/backup-center.test.js
npm run build
git add types.ts components/SystemSettings.tsx tests/frontend/backup-center.test.js
git commit -m "feat: add administrator backup restore center"
```

### Task 8: Synology Installation And Qualification

**Files:**
- Create: `scripts/install-maintenance-executor.sh`
- Modify: `docs/runbooks/upgrade.md`
- Modify: `docs/runbooks/rollback.md`
- Create: `docs/runbooks/admin-backup-restore.md`
- Create: `tests/scripts/install-maintenance-executor.test.js`

- [ ] **Step 1: Write failing installer tests**

Require an idempotent wrapper, fixed release path, private queue permissions,
no secret output, and a documented Synology Task Scheduler command.

- [ ] **Step 2: Implement installer and runbook**

The installer prepares queue directories with mode `0700`, generates or
validates `MAINTENANCE_JOB_SECRET`, and prints the exact root-owned scheduler
command without registering a broad or arbitrary command.

- [ ] **Step 3: Run full release gate**

```bash
npm run verify:release
```

Expected: clean install, all tests pass, production build succeeds, audit finds
zero production vulnerabilities, Bash syntax passes, and Compose contracts
pass.

- [ ] **Step 4: Clone restore rehearsal**

On Synology:

1. Create a manual backup through the new UI/API.
2. Verify its manifest.
3. Point executor qualification variables at a cloned database and uploads
   directory.
4. Restore the selected snapshot into the clone.
5. Compare all table counts and upload counts.
6. Inject a post-database-restore failure and prove automatic rollback restores
   the clone's pre-restore state.

- [ ] **Step 5: Deploy with rollback**

Create a final upgrade snapshot, retain the current `0da220d` images, deploy
the new immutable release, verify public health and the backup catalog, then
install the supervised executor. Do not execute a production restore merely as
a smoke test.
