#!/usr/bin/env bash
set -Eeuo pipefail

IERP_RELEASE_ROOT="${IERP_RELEASE_ROOT:-/volume2/docker/ierp}"
IERP_ENV_FILE="${IERP_ENV_FILE:-$IERP_RELEASE_ROOT/.env}"
[[ -f "$IERP_ENV_FILE" ]] || {
  printf 'Maintenance environment file is missing\n' >&2
  exit 64
}

set -a
source "$IERP_ENV_FILE"
set +a

QUEUE_ROOT="${MAINTENANCE_QUEUE_PATH:?Set MAINTENANCE_QUEUE_PATH}"
APP_COMPOSE_FILE="${IERP_APP_COMPOSE_FILE:-$IERP_RELEASE_ROOT/deploy/docker-compose.green.yml}"
BACKUP_COMPOSE_FILE="${IERP_BACKUP_COMPOSE_FILE:-$IERP_RELEASE_ROOT/docker-compose.yml}"
BACKUP_IMAGE="${IERP_BACKUP_IMAGE:-ierp-backup}:${IERP_VERSION:?Set IERP_VERSION}"
EXECUTOR_LOCK="$QUEUE_ROOT/.executor.lock"

for directory in pending running completed failed status nonces; do
  mkdir -p "$QUEUE_ROOT/$directory"
done
chmod 700 "$QUEUE_ROOT" "$QUEUE_ROOT"/{pending,running,completed,failed,status,nonces}

if ! mkdir "$EXECUTOR_LOCK" 2>/dev/null; then
  exit 0
fi
cleanup_lock() {
  rmdir "$EXECUTOR_LOCK" 2>/dev/null || true
}
trap cleanup_lock EXIT INT TERM

write_status() {
  local state="$1"
  local phase="$2"
  local message="$3"
  local effective_backup_id="${4:-}"
  local backup_json="null"
  local temporary="$QUEUE_ROOT/status/.${job_id}.$$.tmp"
  if [[ -n "$effective_backup_id" ]]; then
    backup_json="\"$effective_backup_id\""
  fi
  umask 077
  printf '%s\n' \
    '{' \
    "  \"id\": \"$job_id\"," \
    "  \"operation\": \"$operation\"," \
    "  \"backupId\": $backup_json," \
    "  \"state\": \"$state\"," \
    "  \"phase\": \"$phase\"," \
    "  \"message\": \"$message\"," \
    "  \"updatedAt\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"" \
    '}' > "$temporary"
  mv "$temporary" "$QUEUE_ROOT/status/$job_id.json"
}

backup_compose() {
  docker compose --env-file "$IERP_ENV_FILE" -f "$BACKUP_COMPOSE_FILE" "$@"
}

run_manual_backup() {
  local generated_backup_id
  generated_backup_id="$(date -u +%Y%m%dT%H%M%SZ)-manual"
  write_status running backup "Creating verified manual backup" "$generated_backup_id"
  if ! backup_compose --profile backup run --rm \
      -e BACKUP_KIND=manual \
      -e "BACKUP_ID=$generated_backup_id" \
      backup; then
    return 1
  fi
  write_status completed complete "Manual backup completed" "$generated_backup_id"
}

run_guarded_restore() {
  export IERP_RELEASE_ROOT IERP_ENV_FILE
  export IERP_APP_COMPOSE_FILE="$APP_COMPOSE_FILE"
  export IERP_BACKUP_COMPOSE_FILE="$BACKUP_COMPOSE_FILE"
  export MAINTENANCE_QUEUE_PATH="$QUEUE_ROOT"
  export MAINTENANCE_JOB_ID="$job_id"
  export MAINTENANCE_OPERATION="$operation"
  export MAINTENANCE_BACKUP_ID="$backup_id"
  "$IERP_RELEASE_ROOT/scripts/maintenance-restore.sh"
}

shopt -s nullglob
pending_jobs=("$QUEUE_ROOT"/pending/*.json)
(( ${#pending_jobs[@]} > 0 )) || exit 0
pending_job="${pending_jobs[0]}"
job_file="$(basename "$pending_job")"
if [[ ! "$job_file" =~ ^[0-9a-fA-F-]{36}\.json$ ]]; then
  mv "$pending_job" "$QUEUE_ROOT/failed/$job_file"
  exit 65
fi

running_job="$QUEUE_ROOT/running/$job_file"
mv "$pending_job" "$running_job"

if ! verification="$(
  docker run --rm \
    --entrypoint node \
    -e MAINTENANCE_JOB_SECRET \
    -e MAINTENANCE_QUEUE_ROOT=/queue \
    -v "$QUEUE_ROOT:/queue" \
    "$BACKUP_IMAGE" \
    /app/scripts/maintenance-job-cli.js \
    verify-and-consume "/queue/running/$job_file"
)"; then
  mv "$running_job" "$QUEUE_ROOT/failed/$job_file"
  exit 65
fi

IFS=$'\t' read -r job_id operation backup_id <<< "$verification"
case "$operation" in
  backup)
    if run_manual_backup; then
      mv "$running_job" "$QUEUE_ROOT/completed/$job_file"
    else
      write_status failed backup_failed "Manual backup failed"
      mv "$running_job" "$QUEUE_ROOT/failed/$job_file"
      exit 1
    fi
    ;;
  restore)
    if run_guarded_restore; then
      mv "$running_job" "$QUEUE_ROOT/completed/$job_file"
    else
      mv "$running_job" "$QUEUE_ROOT/failed/$job_file"
      exit 1
    fi
    ;;
  *)
    mv "$running_job" "$QUEUE_ROOT/failed/$job_file"
    exit 65
    ;;
esac
