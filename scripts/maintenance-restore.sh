#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/deploy-lib.sh"

require_env \
  IERP_RELEASE_ROOT IERP_ENV_FILE IERP_COMPOSE_FILE IERP_VERSION \
  MAINTENANCE_QUEUE_PATH MAINTENANCE_JOB_ID MAINTENANCE_OPERATION \
  MAINTENANCE_BACKUP_ID MAINTENANCE_JOB_SECRET \
  BACKUP_PATH UPLOADS_PATH DB_HOST DB_USER DB_PASSWORD DB_NAME

[[ "$MAINTENANCE_OPERATION" == "restore" ]] ||
  die "Maintenance restore received an invalid operation"
if [[ ! "$MAINTENANCE_BACKUP_ID" =~ ^[0-9]{8}T[0-9]{6}Z-(daily|upgrade|manual|pre-restore)$ ]]; then
  die "Maintenance restore backup id is invalid"
fi

selected_snapshot="$BACKUP_PATH/$MAINTENANCE_BACKUP_ID"
status_root="$MAINTENANCE_QUEUE_PATH/status"
maintenance_compose_file="${MAINTENANCE_COMPOSE_FILE:-$IERP_RELEASE_ROOT/deploy/docker-compose.maintenance.yml}"
pre_restore_snapshot=""
maintenance_started=0
destructive_started=0
completed=0

write_status() {
  local state="$1"
  local phase="$2"
  local message="$3"
  local temporary="$status_root/.${MAINTENANCE_JOB_ID}.$$.tmp"
  mkdir -p "$status_root"
  umask 077
  printf '%s\n' \
    '{' \
    "  \"id\": \"$MAINTENANCE_JOB_ID\"," \
    '  "operation": "restore",' \
    "  \"backupId\": \"$MAINTENANCE_BACKUP_ID\"," \
    "  \"state\": \"$state\"," \
    "  \"phase\": \"$phase\"," \
    "  \"message\": \"$message\"," \
    "  \"updatedAt\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"" \
    '}' > "$temporary"
  mv "$temporary" "$status_root/$MAINTENANCE_JOB_ID.json"
}

app_compose() {
  docker compose \
    --env-file "$IERP_ENV_FILE" \
    -f "$IERP_COMPOSE_FILE" \
    "$@"
}

maintenance_compose() {
  docker compose \
    --env-file "$IERP_ENV_FILE" \
    -f "$maintenance_compose_file" \
    "$@"
}

run_restore_drill() {
  app_compose --profile backup run --rm \
    -e "BACKUP_DIR=/backups/$MAINTENANCE_BACKUP_ID" \
    backup \
    bash scripts/restore-drill.sh
}

start_maintenance_response() {
  write_status running maintenance "Blocking new writes and draining requests"
  app_compose stop frontend
  app_compose --profile backup-scheduler stop backup-scheduler \
    >/dev/null 2>&1 || true
  maintenance_compose up -d
  maintenance_started=1
  sleep "${MAINTENANCE_DRAIN_SECONDS:-5}"
}

create_pre_restore_backup() {
  local pre_restore_id
  pre_restore_id="$(date -u +%Y%m%dT%H%M%SZ)-pre-restore"
  write_status running pre_restore_backup "Creating rollback snapshot"
  app_compose --profile backup run --rm \
    -e BACKUP_KIND=pre-restore \
    -e "BACKUP_ID=$pre_restore_id" \
    backup
  pre_restore_snapshot="$BACKUP_PATH/$pre_restore_id"
  verify_snapshot "$pre_restore_snapshot"
}

stop_application() {
  write_status running stop_application "Stopping application backend"
  app_compose stop backend
}

restore_database_from_snapshot() {
  local snapshot="$1"
  [[ "$DB_NAME" =~ ^[A-Za-z0-9_]+$ ]] ||
    die "DB_NAME contains unsupported characters"
  db_client \
    --execute="DROP DATABASE IF EXISTS \`$DB_NAME\`; CREATE DATABASE \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
  gzip -dc "$snapshot/database.sql.gz" | db_client "$DB_NAME"
  compare_table_counts "$snapshot" "$DB_NAME"
}

restore_uploads_from_snapshot() {
  local snapshot="$1"
  local timestamp staging previous
  timestamp="$(date -u +%Y%m%dT%H%M%SZ)-${RANDOM}"
  staging="${UPLOADS_PATH}.restore-staging-${timestamp}"
  previous="${UPLOADS_PATH}.before-restore-${timestamp}"
  mkdir -p "$staging"
  tar -xzf "$snapshot/uploads.tar.gz" -C "$staging"
  compare_upload_count "$snapshot" "$staging"
  mv "$UPLOADS_PATH" "$previous"
  if ! mv "$staging" "$UPLOADS_PATH"; then
    mv "$previous" "$UPLOADS_PATH"
    die "Restored uploads could not be promoted"
  fi
}

stop_maintenance_response() {
  if [[ "$maintenance_started" -eq 1 ]]; then
    maintenance_compose down >/dev/null 2>&1 || true
    maintenance_started=0
  fi
}

wait_for_backend_health() {
  local backend_container="ierp-${IERP_COLOR:-green}-backend"
  local attempt status
  for ((attempt = 1; attempt <= 30; attempt += 1)); do
    status="$(
      docker inspect \
        --format '{{if .State.Health}}{{.State.Health.Status}}{{end}}' \
        "$backend_container" 2>/dev/null
    )"
    [[ "$status" == "healthy" ]] && return 0
    sleep 2
  done
  die "Backend health check did not become ready"
}

start_application() {
  app_compose up -d backend
  wait_for_backend_health
}

resume_public_application() {
  stop_maintenance_response
  app_compose --profile backup-scheduler up -d frontend backup-scheduler
  wait_for_health \
    "http://127.0.0.1:${FRONTEND_PORT:-10667}/health/ready" \
    30
}

automatic_rollback() {
  local original_status=$?
  trap - EXIT
  if [[ "$original_status" -eq 0 || "$completed" -eq 1 ]]; then
    exit "$original_status"
  fi

  set +e
  if [[ "$maintenance_started" -eq 0 && "$destructive_started" -eq 0 ]]; then
    write_status failed validation_failed "Restore validation failed before maintenance"
    exit "$original_status"
  fi

  if [[ "$destructive_started" -eq 1 && -n "$pre_restore_snapshot" ]]; then
    write_status running automatic_rollback "Restore failed; rolling back"
    if [[ "$maintenance_started" -eq 0 ]]; then
      start_maintenance_response
    fi
    stop_application
    restore_database_from_snapshot "$pre_restore_snapshot"
    database_status=$?
    restore_uploads_from_snapshot "$pre_restore_snapshot"
    uploads_status=$?
    start_application
    backend_status=$?
    application_status=1
    if [[ "$backend_status" -eq 0 ]]; then
      resume_public_application
      application_status=$?
    fi
    if [[ "$database_status" -eq 0 &&
      "$uploads_status" -eq 0 &&
      "$backend_status" -eq 0 &&
      "$application_status" -eq 0 ]]; then
      write_status failed rolled_back "Restore failed; automatic rollback completed"
    else
      start_maintenance_response
      write_status failed rollback_failed "Restore and automatic rollback failed"
    fi
  else
    start_application
    backend_status=$?
    if [[ "$backend_status" -eq 0 ]]; then
      resume_public_application
      application_status=$?
    else
      application_status=1
    fi
    if [[ "$application_status" -eq 0 ]]; then
      write_status failed cancelled "Restore stopped before data replacement"
    else
      start_maintenance_response
      write_status failed recovery_failed "Application recovery failed"
    fi
  fi
  exit "$original_status"
}
trap automatic_rollback EXIT

# PHASE 1: verify_selected_snapshot
write_status running verify_snapshot "Verifying selected backup"
verify_snapshot "$selected_snapshot"

# PHASE 2: run_restore_drill
write_status running restore_drill "Running isolated restore drill"
run_restore_drill
verify_restore_drill "$selected_snapshot"

# PHASE 3: start_maintenance_response
start_maintenance_response

# PHASE 4: create_pre_restore_backup
create_pre_restore_backup

# PHASE 5: stop_application
stop_application
destructive_started=1

# PHASE 6: restore_database
write_status running restore_database "Restoring database"
restore_database_from_snapshot "$selected_snapshot"

# PHASE 7: restore_uploads
write_status running restore_uploads "Restoring uploaded files"
restore_uploads_from_snapshot "$selected_snapshot"

# PHASE 8: start_application
write_status running start_application "Starting backend for verification"
start_application

# PHASE 9: verify_and_finish
write_status running verify_restored_data "Verifying restored data"
compare_table_counts "$selected_snapshot" "$DB_NAME"
compare_upload_count "$selected_snapshot" "$UPLOADS_PATH"
resume_public_application
completed=1
write_status completed complete "Restore completed"
