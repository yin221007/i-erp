#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$SCRIPT_DIR/deploy-lib.sh"

GREEN_COMPOSE_FILE="${GREEN_COMPOSE_FILE:-$PROJECT_ROOT/deploy/docker-compose.green.yml}"
BASE_COMPOSE_FILE="${BASE_COMPOSE_FILE:-$PROJECT_ROOT/docker-compose.yml}"
MAINTENANCE_COMPOSE_FILE="${MAINTENANCE_COMPOSE_FILE:-$PROJECT_ROOT/deploy/docker-compose.maintenance.yml}"
GREEN_FRONTEND_PORT="${GREEN_FRONTEND_PORT:-10667}"
AUTO_ROLLBACK="${AUTO_ROLLBACK:-1}"
old_stopped=0
production_migration_started=0
cutover_complete=0
final_snapshot=""

# STEP 1: verify_restore_drill
# STEP 2: build_candidate_images
# STEP 3: start_clone_candidate
# STEP 4: BUSINESS_SMOKE_CONFIRMATION
# STEP 5: MAINTENANCE_CONFIRMATION
# STEP 6: create_upgrade_snapshot
# STEP 7: start_production_candidate
# STEP 8: LUCKY_CUTOVER_CONFIRMATION

build_candidate_images() {
  log "Building immutable candidate images: $IERP_VERSION"
  docker compose -f "$BASE_COMPOSE_FILE" --profile backup build backup
  docker compose -f "$MAINTENANCE_COMPOSE_FILE" build maintenance
  GREEN_DB_NAME="$GREEN_CLONE_DB_NAME" \
  GREEN_UPLOADS_PATH="$GREEN_CLONE_UPLOADS_PATH" \
  GREEN_MAINTENANCE_QUEUE_PATH="$GREEN_CLONE_MAINTENANCE_QUEUE_PATH" \
  BACKUP_PATH="$BACKUP_ROOT" \
    docker compose -f "$GREEN_COMPOSE_FILE" build
}

start_clone_candidate() {
  log "Starting green candidate against cloned data"
  GREEN_DB_NAME="$GREEN_CLONE_DB_NAME" \
  GREEN_UPLOADS_PATH="$GREEN_CLONE_UPLOADS_PATH" \
  GREEN_MAINTENANCE_QUEUE_PATH="$GREEN_CLONE_MAINTENANCE_QUEUE_PATH" \
  BACKUP_PATH="$BACKUP_ROOT" \
    docker compose -f "$GREEN_COMPOSE_FILE" up -d --force-recreate
  wait_for_health "http://127.0.0.1:$GREEN_FRONTEND_PORT/health/ready"
  compare_table_counts "$RESTORE_DRILL_SNAPSHOT" "$GREEN_CLONE_DB_NAME"
  compare_upload_count "$RESTORE_DRILL_SNAPSHOT" "$GREEN_CLONE_UPLOADS_PATH"
}

stop_old_stack() {
  log "Stopping old stack after maintenance mode confirmation"
  docker compose -f "$OLD_COMPOSE_FILE" stop
  old_stopped=1
}

create_upgrade_snapshot() {
  local backup_id
  backup_id="$(date -u +%Y%m%dT%H%M%SZ)-upgrade"
  log "Creating final upgrade snapshot: $backup_id"
  BACKUP_KIND=upgrade \
  BACKUP_ID="$backup_id" \
  BACKUP_PATH="$BACKUP_ROOT" \
  UPLOADS_PATH="$UPLOADS_PATH" \
    docker compose -f "$BASE_COMPOSE_FILE" --profile backup run --rm backup
  final_snapshot="$BACKUP_ROOT/$backup_id"
  verify_snapshot "$final_snapshot"
}

start_production_candidate() {
  log "Recreating green against production data after snapshot"
  production_migration_started=1
  GREEN_DB_NAME="$DB_NAME" \
  GREEN_UPLOADS_PATH="$UPLOADS_PATH" \
  GREEN_MAINTENANCE_QUEUE_PATH="$MAINTENANCE_QUEUE_PATH" \
  BACKUP_PATH="$BACKUP_ROOT" \
    docker compose -f "$GREEN_COMPOSE_FILE" up -d --force-recreate
  wait_for_health "http://127.0.0.1:$GREEN_FRONTEND_PORT/health/ready"
  compare_table_counts "$final_snapshot" "$DB_NAME"
  compare_upload_count "$final_snapshot" "$UPLOADS_PATH"
}

automatic_rollback() {
  local status=$?
  trap - EXIT
  [[ "$status" -eq 0 ]] && exit 0

  if [[ "$old_stopped" -eq 1 && "$cutover_complete" -eq 0 ]]; then
    if [[ "$AUTO_ROLLBACK" == "1" ]]; then
      if [[ "$production_migration_started" -eq 1 && -n "$final_snapshot" ]]; then
        log "Deployment failed after production migration started; restoring old version"
        ROLLBACK_SNAPSHOT="$final_snapshot" \
        ROLLBACK_CONFIRMATION="restore-$(basename "$final_snapshot")" \
          "$SCRIPT_DIR/rollback.sh" || {
            printf 'AUTOMATIC ROLLBACK FAILED. Keep maintenance mode enabled.\n' >&2
          }
      else
        log "Deployment failed before production migration; restarting old stack"
        docker compose -f "$OLD_COMPOSE_FILE" up -d || {
          printf 'OLD STACK RESTART FAILED. Keep maintenance mode enabled.\n' >&2
        }
      fi
    else
      printf 'Deployment failed after old stack stopped. Keep maintenance mode enabled.\n' >&2
    fi
  fi
  exit "$status"
}
trap automatic_rollback EXIT

check_inputs() {
  require_env \
    IERP_VERSION \
    RESTORE_DRILL_SNAPSHOT \
    GREEN_CLONE_DB_NAME \
    GREEN_CLONE_UPLOADS_PATH \
    GREEN_CLONE_MAINTENANCE_QUEUE_PATH
  verify_restore_drill "$RESTORE_DRILL_SNAPSHOT"
  [[ -d "$GREEN_CLONE_UPLOADS_PATH" ]] ||
    die "Green clone uploads path does not exist"
  mkdir -p "$GREEN_CLONE_MAINTENANCE_QUEUE_PATH"
}

main() {
  check_inputs
  if [[ "${1:-}" == "--check-only" ]]; then
    log "Deployment prerequisites are valid"
    return 0
  fi

  require_env \
    DB_HOST DB_USER DB_PASSWORD DB_NAME \
    PUBLIC_ORIGINS SESSION_SECRET MAINTENANCE_JOB_SECRET \
    UPLOADS_PATH BACKUP_ROOT MAINTENANCE_QUEUE_PATH OLD_COMPOSE_FILE
  require_command docker curl sha256sum find

  verify_restore_drill "$RESTORE_DRILL_SNAPSHOT"
  build_candidate_images
  start_clone_candidate

  confirm_gate \
    BUSINESS_SMOKE_CONFIRMATION \
    passed \
    "Complete login, permissions, upload, email, AI, recycle-bin, and production smoke tests on green."
  confirm_gate \
    MAINTENANCE_CONFIRMATION \
    confirmed \
    "Enable Lucky maintenance response and confirm users can no longer write."

  stop_old_stack
  create_upgrade_snapshot
  start_production_candidate

  printf 'Change Lucky upstream to http://127.0.0.1:%s and verify HTTPS access.\n' \
    "$GREEN_FRONTEND_PORT"
  confirm_gate \
    LUCKY_CUTOVER_CONFIRMATION \
    confirmed \
    "Confirm Lucky now targets the green port and public login succeeds."

  if [[ -n "${PUBLIC_HEALTH_URL:-}" ]]; then
    wait_for_health "$PUBLIC_HEALTH_URL" 15
  fi
  cutover_complete=1
  log "Cutover completed. Keep the old stack and snapshot for at least 7 days."
}

main "$@"
