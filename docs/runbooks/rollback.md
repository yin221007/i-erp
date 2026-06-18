# iERP Rollback

## When To Roll Back

Rollback immediately for failed readiness, repeated 5xx responses, login
failure with original accounts, missing records or uploads, broken permissions,
or migration/count mismatch.

## Required Snapshot

Use the named final upgrade snapshot created immediately before production
migration. It must contain:

```text
complete
metadata.json
database.sql.gz
uploads.tar.gz
table-counts.tsv
manifest.sha256
```

## Procedure

1. Enable the Lucky maintenance response.
2. Export `ROLLBACK_SNAPSHOT` with the exact snapshot directory.
3. Export `ROLLBACK_CONFIRMATION=restore-<snapshot-directory-name>`.
4. Run `scripts/rollback.sh`.
5. Change Lucky back to the preserved old-stack port when instructed.
6. Verify public HTTPS login with original accounts and run the old-version
   business smoke checklist.

The script stops green, preserves a failed-version database dump and uploads
directory, restores database and uploads from the verified snapshot, compares
counts, and only then starts the old stack. It does not modify Lucky.

Do not delete the failed-version quarantine, green images, old images, or the
upgrade snapshot until the incident is reviewed.

## Data Restore Versus Version Rollback

The administrator restore action in `系统设置 -> 数据维护` restores database
and uploads while keeping the currently deployed application version. It
creates a locked pre-restore snapshot and automatically restores that snapshot
if the selected restore fails after data replacement begins.

Use this runbook instead when the application version itself is faulty. Keep
the preserved old images, old Compose definition, and final upgrade snapshot so
the previous version can be restarted with the original accounts and data.

If an administrator job remains `running` after a NAS restart or executor
failure, do not submit another job or move queue files manually. Keep the
maintenance response active if writes may already have been blocked, inspect
Synology syslog for tag `ierp-maintenance`, verify the current database and
uploads against the pre-restore snapshot, and then perform the explicit
rollback procedure above.
