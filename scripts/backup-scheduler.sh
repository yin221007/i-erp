#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_SCHEDULE_HOUR="${BACKUP_SCHEDULE_HOUR:-2}"
BACKUP_SCHEDULE_MINUTE="${BACKUP_SCHEDULE_MINUTE:-30}"
BACKUP_POLL_SECONDS="${BACKUP_POLL_SECONDS:-300}"
marker_file="${BACKUP_ROOT:?BACKUP_ROOT is required}/.last-daily-backup"

for value_name in \
  BACKUP_SCHEDULE_HOUR \
  BACKUP_SCHEDULE_MINUTE \
  BACKUP_POLL_SECONDS; do
  value="${!value_name}"
  if [[ ! "$value" =~ ^[0-9]+$ ]]; then
    printf '%s must be a non-negative integer\n' "$value_name" >&2
    exit 64
  fi
done
if (( BACKUP_SCHEDULE_HOUR > 23 || BACKUP_SCHEDULE_MINUTE > 59 )); then
  printf 'Backup schedule time is invalid\n' >&2
  exit 64
fi
if (( BACKUP_POLL_SECONDS < 30 )); then
  printf 'BACKUP_POLL_SECONDS must be at least 30\n' >&2
  exit 64
fi

mkdir -p "$BACKUP_ROOT"

while true; do
  local_date="$(date +%F)"
  current_minutes=$((10#$(date +%H) * 60 + 10#$(date +%M)))
  scheduled_minutes=$((BACKUP_SCHEDULE_HOUR * 60 + BACKUP_SCHEDULE_MINUTE))
  completed_date=""
  [[ -f "$marker_file" ]] && completed_date="$(cat "$marker_file")"

  if (
    ((
      current_minutes >= scheduled_minutes
    )) && [[ "$completed_date" != "$local_date" ]]
  ); then
    backup_id="$(date -u +%Y%m%dT%H%M%SZ)-daily"
    if BACKUP_KIND=daily BACKUP_ID="$backup_id" \
      bash "$SCRIPT_DIR/backup.sh"; then
      marker_tmp="${marker_file}.$$"
      printf '%s\n' "$local_date" > "$marker_tmp"
      mv "$marker_tmp" "$marker_file"
    fi
  fi

  [[ "${BACKUP_SCHEDULER_RUN_ONCE:-0}" == "1" ]] && exit 0
  sleep "$BACKUP_POLL_SECONDS"
done
