#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/deploy-lib.sh"

GREEN_FRONTEND_CONTAINER="${GREEN_FRONTEND_CONTAINER:-ierp-green-frontend}"
GREEN_BACKEND_CONTAINER="${GREEN_BACKEND_CONTAINER:-ierp-green-backend}"

# STEP 1: verify_snapshot
# STEP 2: stop_green_stack
# STEP 3: restore_database
# STEP 4: restore_uploads
# STEP 5: start_old_stack

stop_green_stack() {
  log "Stopping green containers"
  docker stop "$GREEN_FRONTEND_CONTAINER" "$GREEN_BACKEND_CONTAINER" \
    >/dev/null 2>&1 || true
}

quarantine_failed_database() {
  local quarantine_root="$1"
  mkdir -p "$quarantine_root"
  if ! db_dump \
      --single-transaction \
      --quick \
      "$DB_NAME" |
      gzip -1 > "$quarantine_root/failed-database.sql.gz"; then
    rm -f "$quarantine_root/failed-database.sql.gz"
    log "Warning: failed-version database dump could not be retained"
  fi
}

restore_database() {
  [[ "$DB_NAME" =~ ^[A-Za-z0-9_]+$ ]] ||
    die "DB_NAME contains unsupported characters"
  log "Restoring database $DB_NAME from $(basename "$ROLLBACK_SNAPSHOT")"
  db_client \
    --execute="DROP DATABASE IF EXISTS \`$DB_NAME\`; CREATE DATABASE \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
  gzip -dc "$ROLLBACK_SNAPSHOT/database.sql.gz" |
    db_client \
      "$DB_NAME"
  compare_table_counts "$ROLLBACK_SNAPSHOT" "$DB_NAME"
}

restore_uploads() {
  local timestamp staging failed_path
  timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
  staging="${UPLOADS_PATH}.restore-staging-${timestamp}"
  failed_path="${UPLOADS_PATH}.failed-${timestamp}"
  mkdir -p "$staging"
  tar -xzf "$ROLLBACK_SNAPSHOT/uploads.tar.gz" -C "$staging"
  compare_upload_count "$ROLLBACK_SNAPSHOT" "$staging"
  mv "$UPLOADS_PATH" "$failed_path"
  if ! mv "$staging" "$UPLOADS_PATH"; then
    mv "$failed_path" "$UPLOADS_PATH"
    die "Could not promote restored uploads; original uploads were put back"
  fi
  log "Failed-version uploads retained at $failed_path"
}

start_old_stack() {
  log "Starting preserved old stack"
  docker compose -f "$OLD_COMPOSE_FILE" up -d
  if [[ -n "${OLD_HEALTH_URL:-}" ]]; then
    wait_for_health "$OLD_HEALTH_URL" 30
  fi
}

main() {
  require_env \
    IERP_VERSION ROLLBACK_SNAPSHOT DB_HOST DB_USER DB_PASSWORD DB_NAME \
    UPLOADS_PATH OLD_COMPOSE_FILE BACKUP_ROOT
  verify_snapshot "$ROLLBACK_SNAPSHOT"

  if [[ "${1:-}" == "--check-only" ]]; then
    log "Rollback snapshot is valid"
    return 0
  fi

  require_command docker gzip tar sha256sum find
  confirm_gate \
    ROLLBACK_CONFIRMATION \
    "restore-$(basename "$ROLLBACK_SNAPSHOT")" \
    "This will replace the production database and uploads with the named snapshot."

  stop_green_stack
  docker compose -f "$OLD_COMPOSE_FILE" stop >/dev/null 2>&1 || true

  quarantine_root="$BACKUP_ROOT/failed-rollbacks/$(date -u +%Y%m%dT%H%M%SZ)"
  quarantine_failed_database "$quarantine_root"
  restore_database
  restore_uploads
  start_old_stack

  printf 'Change Lucky upstream back to the preserved old-stack port, then verify HTTPS login.\n'
  if [[ "${SKIP_LUCKY_CONFIRMATION:-0}" != "1" ]]; then
    confirm_gate \
      LUCKY_ROLLBACK_CONFIRMATION \
      confirmed \
      "Confirm Lucky targets the old stack and the original accounts can log in."
  fi
  log "Rollback completed. Failed-version database dump: $quarantine_root"
}

main "$@"
