# i ERP

i ERP is a web-based kitchen equipment engineering management system. It includes project workflow tracking, engineering archive management, production progress, payment collection tracking, team chat, notification delivery, administrator backup and restore operations, and an AI center with DeepSeek and MiniMax provider configuration.

## Version

Current public release: **1.10.0**

## Features

- Project lifecycle workflow with phase nodes and key risk tracking
- Engineering archive upload, preview, download, and recycle bin protection
- Production progress and payment collection dashboards
- Team chat, approval notifications, and push webhook support
- Administrator backup catalog, manual backup, guarded restore queue, and rollback-oriented runbooks
- AI center using centrally managed provider keys for DeepSeek and MiniMax
- Docker Compose deployment with backend, frontend, backup, and scheduler services

## Security Notice

This public repository has been sanitized. It does not contain the original production database, uploaded files, private deployment hosts, SSH keys, API keys, or live credentials. The included `db.json` is demo-only seed data.

Before production deployment:

- Replace every value in `.env.example` marked as a password or secret.
- Do not expose the backend directly to the internet. Put it behind the included frontend/reverse-proxy flow.
- Change or remove demo accounts before real use.
- Store uploads, backups, and maintenance queues outside the source tree.

Demo accounts in the seed file are only for local evaluation:

- `admin / ChangeMe-Admin-123!`
- `demo / ChangeMe-User-123!`

## Local Development

Prerequisites: Node.js 20+ and npm.

```bash
npm install
npm test
npm run build
```

For backend/API testing, provide database and secret environment variables as shown in `.env.example`.

## Docker Deployment

```bash
cp .env.example .env
# Edit .env and replace all secrets.
docker compose --env-file .env --profile backup-scheduler up -d --build
```

See the runbooks in `docs/runbooks/` for upgrade, rollback, and administrator backup/restore guidance.

## Release Verification

```bash
npm test
npm run build
npm audit --audit-level=high
```
