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
