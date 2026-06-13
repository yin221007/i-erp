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
