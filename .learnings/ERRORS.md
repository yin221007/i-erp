# Errors

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
