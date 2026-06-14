#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_SCHEDULE_MORNING="${BACKUP_SCHEDULE_MORNING:-06:30}"
BACKUP_SCHEDULE_EVENING="${BACKUP_SCHEDULE_EVENING:-18:30}"
BACKUP_POLL_SECONDS="${BACKUP_POLL_SECONDS:-300}"
marker_file="${BACKUP_ROOT:?BACKUP_ROOT is required}/.last-daily-backup-slot"

if [[ ! "$BACKUP_POLL_SECONDS" =~ ^[0-9]+$ ]]; then
  printf 'BACKUP_POLL_SECONDS must be a non-negative integer\n' >&2
  exit 64
fi
if (( BACKUP_POLL_SECONDS < 30 )); then
  printf 'BACKUP_POLL_SECONDS must be at least 30\n' >&2
  exit 64
fi

parse_schedule_minutes() {
  local value="$1"
  local name="$2"
  if [[ ! "$value" =~ ^([0-1][0-9]|2[0-3]):([0-5][0-9])$ ]]; then
    printf '%s must use HH:MM in 24-hour time\n' "$name" >&2
    exit 64
  fi
  printf '%s\n' "$((10#${BASH_REMATCH[1]} * 60 + 10#${BASH_REMATCH[2]}))"
}

morning_minutes="$(
  parse_schedule_minutes "$BACKUP_SCHEDULE_MORNING" BACKUP_SCHEDULE_MORNING
)"
evening_minutes="$(
  parse_schedule_minutes "$BACKUP_SCHEDULE_EVENING" BACKUP_SCHEDULE_EVENING
)"
if (( morning_minutes >= evening_minutes )); then
  printf 'Morning backup schedule must be earlier than evening schedule\n' >&2
  exit 64
fi

mkdir -p "$BACKUP_ROOT"

while true; do
  local_date="$(date +%F)"
  current_minutes=$((10#$(date +%H) * 60 + 10#$(date +%M)))
  due_slot=""
  due_rank=0
  if (( current_minutes >= evening_minutes )); then
    due_slot="evening"
    due_rank=2
  elif (( current_minutes >= morning_minutes )); then
    due_slot="morning"
    due_rank=1
  fi

  completed_marker=""
  [[ -f "$marker_file" ]] && completed_marker="$(cat "$marker_file")"
  completed_date="${completed_marker%%|*}"
  completed_slot="${completed_marker#*|}"
  completed_rank=0
  [[ "$completed_slot" == "morning" ]] && completed_rank=1
  [[ "$completed_slot" == "evening" ]] && completed_rank=2

  if [[ -n "$due_slot" ]] && ! (
    [[ "$completed_date" == "$local_date" ]] &&
    (( completed_rank >= due_rank ))
  ); then
    backup_id="$(date -u +%Y%m%dT%H%M%SZ)-daily"
    if BACKUP_KIND=daily BACKUP_ID="$backup_id" \
      bash "$SCRIPT_DIR/backup.sh"; then
      marker_tmp="${marker_file}.$$"
      printf '%s|%s\n' "$local_date" "$due_slot" > "$marker_tmp"
      mv "$marker_tmp" "$marker_file"
    fi
  fi

  [[ "${BACKUP_SCHEDULER_RUN_ONCE:-0}" == "1" ]] && exit 0
  sleep "$BACKUP_POLL_SECONDS"
done
