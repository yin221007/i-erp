# Administrator Backup And Restore Center Design

**Date:** 2026-06-14

**Status:** Approved

## Goal

Add an administrator-only backup and restore center that can list verified
server backups, request an immediate backup, and restore a selected generation
without granting the web application Docker control or allowing an unsafe
in-process database overwrite.

## Safety Boundary

The Express backend does not receive the Docker socket, database restore
privileges, or direct control of application containers.

The backend may:

- Read sanitized backup metadata from a read-only backup mount.
- Re-authenticate the current administrator with their existing password.
- Create a narrowly structured, HMAC-signed maintenance job in a dedicated
  queue directory.
- Read status files produced by the maintenance executor.

A host-side Synology maintenance executor may:

- Validate the signed job schema, timestamp, nonce, and allowed operation.
- Run only the versioned iERP backup and restore scripts.
- Control only the named iERP frontend, backend, and backup scheduler
  containers.
- Read the configured iERP backup root and restore only the configured iERP
  database and uploads path.

No user-supplied shell command, path, Compose project, database name, or
container name is passed to the executor.

## User Interface

The administrator's `系统设置 > 数据维护` tab becomes the backup and restore
center.

It displays:

- Automatic-backup health and current 500 GB capacity policy.
- Backup ID, kind, creation time, size, upload count, verification state, and
  restore-drill state.
- Active or recent maintenance jobs with phase, progress, result, and error
  summary.
- An `立即备份` action.
- A `恢复此备份` action only for complete backups with a valid manifest.

The restore confirmation requires:

1. The current administrator password.
2. Exact entry of the selected backup ID.
3. An acknowledgement that active users will be disconnected during the
   maintenance window.

The browser never uploads a backup archive and cannot provide an arbitrary
filesystem path.

## Backup Listing

The backend scans only direct children of the configured backup root.

A backup is selectable only when all required files exist:

```text
complete
metadata.json
database.sql.gz
uploads.tar.gz
table-counts.tsv
manifest.sha256
```

The API returns metadata and validation state, never file contents or host
paths. Directory names must match the existing generated backup-ID pattern.
Symlinks and paths outside the configured root are rejected.

## Manual Backup Flow

1. Administrator enters their current password.
2. Backend verifies the password hash and applies a rate limit.
3. Backend creates a signed `backup` job with a server-generated UUID and
   nonce.
4. Executor takes the single maintenance lock.
5. Executor runs the existing bounded backup service with kind `manual`.
6. Existing checksum, free-space, single-job, retention, and 500 GB rules
   remain mandatory.
7. Executor writes the final job result atomically.

Manual backups are retained under the same capacity limit. A small dedicated
manual retention count is used so repeated UI requests cannot exhaust storage.

## Restore Flow

1. Backend verifies administrator role, current password, exact backup-ID
   confirmation, CSRF origin, and that the backup is currently selectable.
2. Backend creates a signed `restore` job. Only one pending or running
   maintenance job may exist.
3. Executor validates the signature and reacquires the global maintenance
   lock.
4. Executor verifies the selected snapshot manifest.
5. Executor runs an isolated restore drill against a temporary database.
6. Executor creates and verifies a new `pre-restore` snapshot of the current
   production database and uploads.
7. Executor enables a maintenance response and stops the iERP frontend,
   backend, and backup scheduler.
8. Executor restores the selected database and uploads using staging paths and
   atomic promotion.
9. Executor starts the same deployed application version and waits for backend
   and public readiness.
10. Executor compares restored table counts and upload count with the selected
    snapshot.
11. On success it removes maintenance mode and records completion.
12. On any failure after shutdown it restores the `pre-restore` snapshot,
    restarts the prior containers, verifies readiness, and records that
    automatic rollback occurred.

The selected snapshot and `pre-restore` snapshot remain retained after the job
for incident review.

## Job Protocol

Job request files contain only:

```json
{
  "schemaVersion": 1,
  "id": "uuid",
  "operation": "backup",
  "backupId": null,
  "requestedBy": "user-id",
  "requestedAt": "ISO-8601",
  "expiresAt": "ISO-8601",
  "nonce": "random-base64url",
  "signature": "hex-hmac"
}
```

Restore requests set `operation` to `restore` and include a validated backup
ID. The signature covers a canonical serialization of every unsigned field.
The HMAC key is a separate maintenance secret, not the session secret.

The executor atomically moves accepted jobs from `pending` to `running`.
Status updates are written through temporary files and atomic rename:

```text
queued
validating
restore_drill
pre_restore_backup
maintenance
restoring_database
restoring_uploads
starting_services
verifying
completed
rolling_back
rolled_back
failed
```

Completed job files contain no passwords, tokens, database credentials, or
full command output.

## Authentication And Abuse Controls

- Only administrators may access backup APIs.
- Listing does not require password re-entry; backup and restore requests do.
- Password verification uses the existing server-side password verifier.
- Failed re-authentication is rate-limited per administrator and source IP.
- Requests expire after five minutes and nonces cannot be replayed.
- A database-backed audit record stores requester, operation, selected backup,
  timestamps, and final result.
- Restore requests are rejected while another maintenance job is pending or
  running.
- The executor refuses unknown operations, malformed IDs, stale requests,
  invalid signatures, symlinks, and paths outside configured roots.

## Failure Handling

- Provider or browser disconnects do not cancel an accepted maintenance job.
- A lost executor leaves the job in a visible stale-running state and does not
  cause the backend to retry destructive steps.
- Startup recovery checks the maintenance lock and persisted phase before any
  retry.
- Backups are never deleted as part of a restore.
- The application remains in maintenance mode if both restore and rollback
  fail, and the status identifies the last successful phase.

## Deployment

The new release adds:

- A read-only backup mount for the backend.
- A dedicated read-write maintenance queue mount.
- A separate `MAINTENANCE_JOB_SECRET`.
- A host-side executor script installed under the immutable release.
- A Synology scheduled task or supervised host process that invokes the
  executor at a short interval.

The executor and application release use the same immutable version. The old
application images, old release directory, and latest upgrade snapshot remain
available during rollout.

## Verification

Automated tests cover:

- Administrator-only backup listing.
- Backup path containment and symlink rejection.
- Password re-authentication and rate limiting.
- Canonical job signing and tamper rejection.
- Replay and expiration rejection.
- Single-job exclusion.
- Manual backup retention under 500 GB.
- Restore phase ordering.
- Restore drill and pre-restore snapshot gates.
- Automatic rollback after each destructive phase.
- No Docker socket or Docker command in the Express container.
- UI confirmation requirements and status polling.

Synology qualification uses a cloned database and uploads directory first. A
production restore is not used as the deployment smoke test; production
qualification creates a manual backup and verifies its manifest, while the
full restore flow is exercised against the clone.
