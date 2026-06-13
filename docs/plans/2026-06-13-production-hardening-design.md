# iERP Production Hardening Design

**Date:** 2026-06-13

**Baseline:** Synology production source snapshot downloaded from
`/volume2/docker/ierp`.

## Goals

- Preserve every existing business record, upload, user ID, username, and
  password.
- Replace browser-controlled identity with server-side authentication.
- Allow the same account to use multiple devices.
- Make backup, restore, upgrade, and rollback deterministic.
- Repair recycle-bin and production-record persistence defects.
- Add a server-side DeepSeek official API integration with a system-wide key.
- Keep the old deployment available until the new deployment has operated
  successfully for at least seven days.

## Non-goals

- Replacing MariaDB or redesigning all business tables in the first release.
- Rewriting the React interface.
- Automatically deleting the old production deployment.
- Sending AI provider keys to browsers.

## Architecture

The existing React application and JSON business records remain in place. The
single backend file is split gradually into an Express application factory,
database migrations, authentication, authorization, resource routes, backup,
recycle-bin, upload, email, and AI modules.

The new deployment runs beside the old deployment. It uses a cloned database
and cloned uploads during validation. Lucky continues pointing to the old
frontend until tests, migration rehearsal, and business smoke tests pass.

## Authentication And Authorization

- Existing plaintext passwords are converted during a maintenance migration to
  versioned Node.js `scrypt` hashes with a unique random salt.
- Usernames, user IDs, and accepted passwords do not change.
- Login creates a random opaque session token. Only its SHA-256 digest is stored
  in MariaDB.
- The browser receives the raw token in a `HttpOnly`, `Secure`,
  `SameSite=Lax` cookie.
- Multiple active sessions per user are allowed.
- Sessions expire after 30 days of inactivity and have a maximum lifetime of
  90 days.
- Administrators can revoke one user or all sessions.
- `x-user-id` is ignored as an authentication mechanism.
- Every API route requires a valid session except login and health checks.
- Resource reads and writes use explicit server-side policies. Frontend button
  visibility is not treated as authorization.
- `/api/users` returns a safe public user shape and never returns password
  hashes, email authorization codes, or private webhook credentials.
- Login attempts are rate-limited by username and client IP.
- State-changing requests verify `Origin` against configured public origins.
- Express trusts only the Lucky proxy hop configured by `TRUST_PROXY=1`.

## Data And Migrations

- Add a `schema_migrations` table and run numbered, idempotent migrations.
- Add an `auth_sessions` table for multi-device sessions.
- Existing business resource tables remain `id + json_data` for the first
  hardening release.
- Migrations fail closed: the backend does not listen if a migration fails.
- Production records receive a stable `id`; legacy rows use `projectId` as the
  migration source when `id` is absent.
- The old code remains compatible only with the pre-migration snapshot. A
  rollback after migration restores the database and uploads snapshot before
  switching Lucky back.

## Backup And Restore

- A host-side scheduled job uses `mariadb-dump` and streaming compression.
- Uploads are archived or incrementally synchronized without loading their
  contents into Node.js memory.
- Only one backup job may run at a time.
- Daily backups retain seven successful generations.
- Upgrade snapshots retain three generations unless manually locked.
- All backups, including locked snapshots, count toward a 500 GB cap.
- Before starting, backup checks that at least 20 GB and 10 percent of the
  target filesystem remain free.
- When near the cap, the oldest successful unlocked backups are deleted first.
- If sufficient space cannot be reclaimed, the new backup is refused and an
  alert is emitted. Live business data is never deleted.
- Each generation contains SQL, uploads, deployment configuration, application
  version, row counts, file counts, and SHA-256 manifests.
- Failed generations remain marked incomplete and are removed automatically.
- Restore imports into a temporary database, verifies schema and row counts,
  then promotes it during maintenance mode.
- The unsafe browser `TRUNCATE` restore is removed.
- A scheduled restore drill verifies that backups are usable.

## Recycle Bin

- Delete, recycle creation, restore, and permanent deletion run in database
  transactions.
- Restore rejects conflicts instead of silently overwriting live records.
- Permanent deletion never creates another recycle entry.
- Empty-bin operations are administrator-only.
- A daily cleanup removes entries older than 30 days in bounded batches.
- An upload is deleted only when no live or recycled record references it.

## Upload And Email Security

- Upload requires authentication and module permission.
- Default file limit is 100 MB and can be lowered per route.
- File names are generated by the server.
- Allowed MIME types and extensions are checked together.
- Executable HTML, SVG, JavaScript, and unknown active content are rejected.
- Uploaded files are served as attachments or from a separate download route,
  with `X-Content-Type-Options: nosniff`.
- Email and webhook endpoints require authentication and authorization.
- SMTP/IMAP certificate verification is enabled.
- Hosts and ports are validated against administrator-configured policy.
- Email HTML is sanitized before rendering.
- Complete email bodies and attachments are not persisted in browser
  `localStorage`.

## AI Center

- The frontend calls `/api/ai/chat`; only the backend calls DeepSeek.
- `DEEPSEEK_API_KEY` is a system-wide environment secret.
- The provider base URL is fixed to the official DeepSeek API host.
- Administrators manage model records containing model ID, display name,
  enabled state, reasoning capability, context limit, output-token limit, and
  sort order.
- Model IDs are data, not frontend constants, so future DeepSeek models can be
  enabled without rebuilding the frontend.
- Requests enforce authentication, AI permission, input limits, concurrency
  limits, timeout, and cancellation.
- Streaming responses are supported.
- Token usage and status are recorded per user; administrators see aggregate
  usage, not employee conversation contents.
- AI messages are always filtered by authenticated user on the server.
- Attachments are represented by stored file references. Base64 payloads are
  not copied into `ai_messages`.
- DeepSeek is initially text-only. Visual files remain assigned to a provider
  that explicitly supports their media type.

## Dependency And Build Policy

- Commit `package-lock.json` and use `npm ci`.
- Upgrade vulnerable runtime dependencies, especially `nodemailer`, the legacy
  IMAP chain, and `multer`.
- Upgrade Vite and esbuild together after compatibility tests.
- Remove duplicate module scripts, the missing `/index.css` reference, CDN
  Tailwind, and the import map when the bundled build supplies those modules.
- Add route-level code splitting for the AI center, email client, charts, and
  other large modules.

## Deployment And Rollback

- Build immutable frontend and backend images with version tags.
- Keep old and new Compose projects, ports, and image tags separate.
- Validate the new version against a cloned database and cloned uploads.
- Enter maintenance mode before the final backup and migration.
- Switch Lucky only after health checks and business smoke tests pass.
- Keep the old containers stopped but intact after cutover.
- A rollback switches Lucky to the old frontend and restores the pre-migration
  database and uploads snapshot before starting old containers.
- Old deployment assets cannot be removed automatically. Human confirmation is
  required after at least seven stable days.

## Verification Gates

The deployment may not be switched until all of the following pass:

- Original usernames and passwords authenticate successfully.
- Plaintext passwords no longer exist after migration.
- Forged `x-user-id` headers grant no access.
- Multi-device sessions and administrator revocation work.
- Cross-user AI messages and restricted resources are inaccessible.
- Backup creation remains bounded in memory and respects the 500 GB policy.
- A full restore drill succeeds.
- Recycle restore, conflict, permanent-delete, and cleanup cases pass.
- Production progress persists and deletes by stable ID.
- Upload, email, DeepSeek, migration, and rollback tests pass.
- Production-data clone row counts and upload manifests match the source.

