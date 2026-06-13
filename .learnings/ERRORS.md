# Errors

## [ERR-20260613-010] container-db-client-stdin

**Logged**: 2026-06-13T23:15:00+08:00
**Priority**: critical
**Status**: resolved
**Area**: infra

### Summary

The containerized MariaDB client did not attach standard input, so rollback
database imports terminated the upstream decompressor with a broken pipe.

### Error

```text
gzip exited with status 141 while streaming database.sql.gz
```

### Context

- Read-only database checks succeeded because they did not use standard input.
- The isolated rollback database was created, but no production database,
  uploads, container, port, or Lucky route was changed.

### Suggested Fix

Run the shared MariaDB client container with `docker run -i` and keep a
regression test that requires the interactive standard-input attachment.

### Metadata

- Reproducible: yes
- Related Files: `scripts/deploy-lib.sh`,
  `tests/scripts/container-db-client.test.js`

### Resolution

- **Resolved**: 2026-06-13T23:16:00+08:00
- **Notes**: Added `-i`, reproduced the prior test failure, and passed the
  deployment and rollback test suites before repeating the rehearsal.

---

## [ERR-20260613-009] legacy-production-entrypoint

**Logged**: 2026-06-13T23:45:00+08:00
**Priority**: critical
**Status**: resolved
**Area**: backend

### Summary

The production Docker image still started a legacy monolithic `server.js`
instead of the tested modular application factory.

### Error

```text
Invalid Origin requests returned HTTP 500 from the legacy CORS middleware.
```

### Context

- Unit and API tests imported `server/app.js`, so they did not exercise the
  Docker entrypoint.
- The legacy entrypoint duplicated routes and contained a plaintext default
  administrator fallback.
- The candidate database was isolated correctly; no production data was
  migrated.

### Suggested Fix

Keep `server.js` as a one-line compatibility import, put startup ordering in
`server/index.js`, and test the production entrypoint source explicitly.

### Metadata

- Reproducible: yes
- Related Files: `server.js`, `server/index.js`,
  `tests/smoke/runtime-entry.test.js`

### Resolution

- **Resolved**: 2026-06-13T23:55:00+08:00
- **Notes**: Added the modular runtime entry, removed the plaintext fallback,
  secured push test endpoints, and disabled browser-scale backup operations.

---

## [ERR-20260613-008] backup-root-ownership

**Logged**: 2026-06-13T23:08:00+08:00
**Priority**: high
**Status**: resolved
**Area**: infra

### Summary

The backup completed inside the container, but its `0700` snapshot directory
was owned by root and could not be verified by the Synology deployment account.

### Error

```text
find: /volume2/docker/ierp-backups/20260613T105316Z-daily: Permission denied
```

### Context

- The backup bind mount resolved to the expected host path.
- The snapshot data and completion marker were created successfully.
- Restore and deployment scripts run as Synology user `yin` (`1026:100`).

### Suggested Fix

Run the backup service with configurable `NAS_UID` and `NAS_GID`.

### Metadata

- Reproducible: yes
- Related Files: `docker-compose.yml`, `.env.example`

### Resolution

- **Resolved**: 2026-06-13T23:12:00+08:00
- **Notes**: Backup containers now use the deployment account identity while
  retaining private file permissions.

---

## [ERR-20260613-007] nested-ssh-shell-expansion

**Logged**: 2026-06-13T22:48:00+08:00
**Priority**: medium
**Status**: resolved
**Area**: infra

### Summary

A nested `zsh -lc` command expanded remote checksum substitutions locally
before SSH ran.

### Error

```text
sha256sum: /volume2/docker/ierp-releases/ierp-ac4eefa-patch.tar.gz:
No such file or directory
```

### Context

- The patch upload completed, but extraction and validation did not run.
- A read-only check confirmed the release source was still unchanged.

### Suggested Fix

Split upload and remote validation into separate SSH commands and keep remote
substitutions inside one single-quoted remote script.

### Metadata

- Reproducible: yes
- Related Files: deployment command only

### Resolution

- **Resolved**: 2026-06-13T22:50:00+08:00
- **Notes**: Re-ran remote validation and extraction as a separate command.

---

## [ERR-20260613-006] mariadb-client-default-tls

**Logged**: 2026-06-13T22:42:00+08:00
**Priority**: high
**Status**: resolved
**Area**: infra

### Summary

The Alpine MariaDB 11.4 client required TLS by default, while the legacy NAS
database endpoint does not provide TLS.

### Error

```text
TLS/SSL error: SSL is required, but the server does not support it
```

### Context

- The backup container started successfully after the cgroup fix.
- A read-only `SELECT 1` succeeded with `--skip-ssl`.
- Backup, restore, deployment comparison, and rollback use the same client.

### Suggested Fix

Use one shared `DB_CLIENT_TLS` policy for every maintenance script.

### Metadata

- Reproducible: yes
- Related Files: `scripts/db-client-args.sh`, `scripts/backup.sh`,
  `scripts/restore-drill.sh`, `scripts/deploy-lib.sh`, `scripts/rollback.sh`

### Resolution

- **Resolved**: 2026-06-13T23:00:00+08:00
- **Notes**: Added explicit `disabled` and `required` modes with regression
  tests; unknown values abort.

---

## [ERR-20260613-005] synology-cpu-cfs-quota

**Logged**: 2026-06-13T22:30:00+08:00
**Priority**: high
**Status**: resolved
**Area**: infra

### Summary

Synology Docker rejected Compose services using the `cpus` hard limit because
the NAS kernel does not expose the CPU CFS quota controller.

### Error

```text
NanoCPUs can not be set, as your kernel does not support CPU CFS scheduler or
the cgroup is not mounted
```

### Context

- Docker 24.0.2 reports cgroup v1 with the `cgroupfs` driver.
- The backup image built successfully, but container creation failed before the
  backup script started.
- Memory limits remain supported and are the primary protection against the
  long-running memory risk identified for this deployment.

### Suggested Fix

Remove hard `cpus` limits from Synology Compose services and use
`cpu_shares` for relative scheduling weight while retaining `mem_limit`.

### Metadata

- Reproducible: yes
- Related Files: `docker-compose.yml`, `deploy/docker-compose.blue.yml`,
  `deploy/docker-compose.green.yml`

### Resolution

- **Resolved**: 2026-06-13T22:40:00+08:00
- **Notes**: Replaced `cpus` with `cpu_shares`, retained all memory limits, and
  added deployment regression coverage.

---

## [ERR-20260613-001] git-init-working-directory

**Logged**: 2026-06-13T14:00:00+08:00
**Priority**: low
**Status**: resolved
**Area**: config

### Summary

Git initialization was initially issued from the workspace parent instead of
the newly copied project directory.

### Error

```text
/Users/yin/Desktop/codex/work/ierp13/.git: Operation not permitted
```

### Context

- The source copy completed before the failing `git init`.
- The parent workspace was verified unchanged.
- Git was then initialized inside `ierp-hardening`.

### Suggested Fix

Use the new project directory as the command working directory for repository
initialization rather than relying on a preceding `cd`.

### Metadata

- Reproducible: yes
- Related Files: `.git/`

### Resolution

- **Resolved**: 2026-06-13T14:00:00+08:00
- **Notes**: Initialized the repository in the correct working directory.

---

## [ERR-20260613-004] api-tests-loopback-sandbox

**Logged**: 2026-06-13T18:30:00+08:00
**Priority**: low
**Status**: resolved
**Area**: tests

### Summary

The full Supertest suite could not bind its temporary loopback listeners inside
the default sandbox.

### Error

```text
listen EPERM: operation not permitted 0.0.0.0
```

### Context

- Targeted tests had already passed with local-port permission.
- The same full suite passed unchanged after running with the approved test
  permission.

### Suggested Fix

Run `npm test` with the approved local test permission when API tests use
Supertest listeners.

### Metadata

- Reproducible: yes
- Related Files: `tests/api/`

### Resolution

- **Resolved**: 2026-06-13T18:30:00+08:00
- **Notes**: Re-ran the full suite with permission; all tests passed.

---

## [ERR-20260613-003] npm-registry-dns

**Logged**: 2026-06-13T17:30:00+08:00
**Priority**: low
**Status**: resolved
**Area**: config

### Summary

The configured npm mirror could not be resolved while checking mail package
versions.

### Error

```text
getaddrinfo ENOTFOUND registry.npmmirror.com
```

### Context

- The command was an npm package metadata lookup.
- The project itself and installed dependencies were unaffected.

### Suggested Fix

Use `--registry=https://registry.npmjs.org` for dependency metadata, installs,
and audits in this environment.

### Metadata

- Reproducible: yes
- Related Files: `package.json`, `package-lock.json`

### Resolution

- **Resolved**: 2026-06-13T17:30:00+08:00
- **Notes**: Switched subsequent npm network operations to the official registry.

---

## [ERR-20260613-002] shell-pattern-quoting

**Logged**: 2026-06-13T14:30:00+08:00
**Priority**: low
**Status**: resolved
**Area**: tests

### Summary

A static-search command used a double-quoted pattern containing a backtick,
which zsh parsed as command substitution.

### Error

```text
zsh:1: unmatched "
```

### Context

- The command was read-only.
- Tests and builds were running independently and were unaffected.

### Suggested Fix

Avoid backticks in double-quoted shell patterns or split the search into simpler
regular expressions.

### Metadata

- Reproducible: yes
- Related Files: `server.js`, `server/`

### Resolution

- **Resolved**: 2026-06-13T14:30:00+08:00
- **Notes**: Re-ran the search with a simpler pattern; it completed cleanly.

---
