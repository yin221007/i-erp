# Administrator Backup And Restore

## Scope

Only an administrator can use this feature. It manages server-side verified
snapshots; browsers cannot upload or download database backup archives.

Open `系统设置 -> 数据维护 -> 管理员备份与恢复中心`.

## Manual Backup

1. Select `手动备份`.
2. Enter the current administrator account password.
3. Select `提交备份任务`.
4. Keep the page open until the job changes from `pending` or `running` to
   `completed`.
5. Confirm that the new snapshot appears in the catalog as selectable.

The Synology root task processes the queue within one minute. Manual backup
failure does not alter production data.

Retention defaults are:

- Daily snapshots: 7
- Upgrade snapshots: 3
- Manual snapshots: 3
- Pre-restore snapshots: locked
- Total backup capacity: 500 GB

When the capacity limit cannot be met without deleting a locked snapshot, the
new backup fails instead of deleting the locked recovery point.

## Restore

Restore replaces the current database and uploaded files with one selected
snapshot. The application version, administrator accounts, and passwords come
from that snapshot's data.

1. Confirm that the selected snapshot has the expected date, size, and upload
   count.
2. Select `恢复此备份`.
3. Type the exact backup ID shown in the dialog.
4. Confirm the maintenance interruption checkbox.
5. Enter the current administrator password.
6. Select `确认停机并恢复`.
7. Wait for the job to reach `completed` before using the system again.
8. Verify administrator login, normal user login, project records, permissions,
   avatars, logos, and representative attachments.

The executor verifies the selected snapshot and runs an isolated restore drill
before blocking public writes. It then serves a maintenance response, creates a
locked pre-restore snapshot, stops the backend, restores database and uploads,
checks counts, and resumes the application.

The deployed green Compose file controls the production frontend and backend;
the base Compose file controls backup jobs. Uploaded-file archives are rejected
if they contain absolute paths, parent traversal, symbolic links, or hard links.
Temporary extraction directories and old upload-directory copies are removed
only after the restored application or automatic rollback passes verification.

If failure occurs after replacement starts, automatic rollback restores the
locked pre-restore snapshot before reopening the application. If automatic
rollback also fails, maintenance mode remains active to prevent further writes.

## Job States

- `pending`: accepted by the application and waiting for the Synology task.
- `running`: executor has claimed the signed job.
- `completed`: backup or restore completed and verification passed.
- `failed / validation_failed`: selected snapshot was rejected before data
  replacement.
- `failed / rolled_back`: restore failed, but the original pre-restore data was
  restored successfully.
- `failed / rollback_failed`: both restore and automatic rollback failed;
  follow `docs/runbooks/rollback.md`.

Only one maintenance job can be active. A job that remains `pending` for more
than two minutes usually means the Synology task is disabled. A job that
remains `running` after a host or Docker failure requires operator inspection;
the executor deliberately does not replay a destructive restore automatically.

## Synology Checks

The Task Scheduler entry must run every minute as `root`:

```bash
bash /volume2/docker/ierp-maintenance/run.sh
```

Check executor messages in Synology Log Center using tag
`ierp-maintenance`. Confirm these paths remain private and root-owned:

```text
/volume2/docker/ierp/.env                         mode 0600
/volume2/docker/ierp-maintenance                 mode 0700
/volume2/docker/ierp-maintenance-queue           mode 0700
```

Never disclose `MAINTENANCE_JOB_SECRET`, edit signed queue files, or mount the
Docker socket into the frontend or backend containers.
