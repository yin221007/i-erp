#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

printf '== Clean dependency install ==\n'
npm ci --registry=https://registry.npmjs.org

printf '== Automated tests ==\n'
npm test

printf '== Production build ==\n'
npm run build

printf '== Dependency audit ==\n'
npm audit --registry=https://registry.npmjs.org

printf '== Bash syntax ==\n'
bash -n scripts/*.sh

if command -v shellcheck >/dev/null 2>&1; then
  printf '== ShellCheck ==\n'
  shellcheck scripts/*.sh
elif [[ "${QUALIFICATION_MODE:-local}" == "nas" ]]; then
  printf 'shellcheck is required in QUALIFICATION_MODE=nas\n' >&2
  exit 69
else
  printf 'ShellCheck unavailable; local gate used bash -n and script tests.\n'
fi

if command -v docker >/dev/null 2>&1; then
  printf '== Docker Compose validation ==\n'
  : "${IERP_VERSION:?Set IERP_VERSION for Compose validation}"
  : "${DB_HOST:?Set DB_HOST for Compose validation}"
  : "${DB_USER:?Set DB_USER for Compose validation}"
  : "${DB_PASSWORD:?Set DB_PASSWORD for Compose validation}"
  : "${PUBLIC_ORIGINS:?Set PUBLIC_ORIGINS for Compose validation}"
  : "${SESSION_SECRET:?Set SESSION_SECRET for Compose validation}"
  : "${MAINTENANCE_JOB_SECRET:?Set MAINTENANCE_JOB_SECRET for Compose validation}"
  : "${MAINTENANCE_QUEUE_PATH:?Set MAINTENANCE_QUEUE_PATH for Compose validation}"
  : "${BLUE_MAINTENANCE_QUEUE_PATH:?Set BLUE_MAINTENANCE_QUEUE_PATH for Compose validation}"
  : "${GREEN_MAINTENANCE_QUEUE_PATH:?Set GREEN_MAINTENANCE_QUEUE_PATH for Compose validation}"
  : "${GREEN_DB_NAME:?Set GREEN_DB_NAME to a clone for Compose validation}"
  : "${GREEN_UPLOADS_PATH:?Set GREEN_UPLOADS_PATH to cloned uploads}"
  docker compose -f docker-compose.yml config >/dev/null
  docker compose -f deploy/docker-compose.blue.yml config >/dev/null
  docker compose -f deploy/docker-compose.green.yml config >/dev/null
  docker compose -f deploy/docker-compose.maintenance.yml config >/dev/null
elif [[ "${QUALIFICATION_MODE:-local}" == "nas" ]]; then
  printf 'docker compose is required in QUALIFICATION_MODE=nas\n' >&2
  exit 69
else
  printf 'Docker unavailable; local gate used parsed Compose contract tests.\n'
fi

printf 'Release gate passed in %s mode.\n' "${QUALIFICATION_MODE:-local}"
