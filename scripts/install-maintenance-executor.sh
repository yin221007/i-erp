#!/usr/bin/env bash
set -Eeuo pipefail

IERP_RELEASE_ROOT="${IERP_RELEASE_ROOT:-/volume2/docker/ierp}"
IERP_ENV_FILE="${IERP_ENV_FILE:-$IERP_RELEASE_ROOT/.env}"
MAINTENANCE_HOME="${MAINTENANCE_HOME:-/volume2/docker/ierp-maintenance}"
MAINTENANCE_RUNNER="$MAINTENANCE_HOME/run.sh"
DEFAULT_QUEUE_PATH="/volume2/docker/ierp-maintenance-queue"

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  printf 'Run this installer as root.\n' >&2
  exit 77
fi

for required_file in \
  "$IERP_ENV_FILE" \
  "$IERP_RELEASE_ROOT/scripts/maintenance-executor.sh" \
  "$IERP_RELEASE_ROOT/docker-compose.yml" \
  "$IERP_RELEASE_ROOT/deploy/docker-compose.green.yml" \
  "$IERP_RELEASE_ROOT/deploy/docker-compose.maintenance.yml"; do
  if [[ ! -f "$required_file" ]]; then
    printf 'Required file is missing: %s\n' "$required_file" >&2
    exit 66
  fi
done

chmod 600 "$IERP_ENV_FILE"

set -a
source "$IERP_ENV_FILE"
set +a

if [[ -z "${MAINTENANCE_JOB_SECRET:-}" ]] ||
   [[ "$MAINTENANCE_JOB_SECRET" == replace-with-* ]]; then
  MAINTENANCE_JOB_SECRET="$(openssl rand -hex 32)"
  printf '\nMAINTENANCE_JOB_SECRET=%s\n' \
    "$MAINTENANCE_JOB_SECRET" >> "$IERP_ENV_FILE"
fi

if (( ${#MAINTENANCE_JOB_SECRET} < 32 )); then
  printf 'MAINTENANCE_JOB_SECRET must contain at least 32 characters.\n' >&2
  exit 65
fi

if [[ -z "${MAINTENANCE_QUEUE_PATH:-}" ]]; then
  MAINTENANCE_QUEUE_PATH="$DEFAULT_QUEUE_PATH"
  printf 'MAINTENANCE_QUEUE_PATH=%s\n' \
    "$MAINTENANCE_QUEUE_PATH" >> "$IERP_ENV_FILE"
fi

case "$MAINTENANCE_QUEUE_PATH" in
  /volume2/docker/*) ;;
  *)
    printf 'MAINTENANCE_QUEUE_PATH must be under /volume2/docker.\n' >&2
    exit 65
    ;;
esac

install -d -m 700 "$MAINTENANCE_HOME"
install -d -m 700 "$MAINTENANCE_QUEUE_PATH"
for directory in pending running completed failed status nonces; do
  install -d -m 700 "$MAINTENANCE_QUEUE_PATH/$directory"
done

install -m 700 /dev/null "$MAINTENANCE_RUNNER"
printf '%s\n' \
  '#!/usr/bin/env bash' \
  'set -o pipefail' \
  "IERP_RELEASE_ROOT='$IERP_RELEASE_ROOT' IERP_ENV_FILE='$IERP_ENV_FILE' \\" \
  "  /bin/bash '$IERP_RELEASE_ROOT/scripts/maintenance-executor.sh' 2>&1 |" \
  '  /usr/bin/logger -t ierp-maintenance' \
  > "$MAINTENANCE_RUNNER"
chmod 700 "$MAINTENANCE_RUNNER" "$MAINTENANCE_QUEUE_PATH"
chmod 600 "$IERP_ENV_FILE"

printf '%s\n' \
  'Maintenance executor installed.' \
  'Create this Synology Task Scheduler task:' \
  '  Schedule: every minute' \
  '  User: root' \
  '  Command: bash /volume2/docker/ierp-maintenance/run.sh' \
  'Logs are written to Synology syslog with tag ierp-maintenance.'
