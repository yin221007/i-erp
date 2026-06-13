#!/usr/bin/env bash
set -euo pipefail

required_variables=(
  BACKUP_ROOT
  UPLOADS_ROOT
  DB_HOST
  DB_USER
  DB_PASSWORD
  DB_NAME
)

for variable_name in "${required_variables[@]}"; do
  if [[ -z "${!variable_name:-}" ]]; then
    printf 'Missing required environment variable: %s\n' "$variable_name" >&2
    exit 64
  fi
done

MIN_FREE_BYTES="${MIN_FREE_BYTES:-21474836480}"
MIN_FREE_PERCENT="${MIN_FREE_PERCENT:-10}"
BACKUP_CAPACITY_BYTES="${BACKUP_CAPACITY_BYTES:-536870912000}"
BACKUP_KIND="${BACKUP_KIND:-daily}"
BACKUP_ID="${BACKUP_ID:-$(date -u +%Y%m%dT%H%M%SZ)-${BACKUP_KIND}}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

case "$BACKUP_KIND" in
  daily|upgrade) ;;
  *)
    printf 'BACKUP_KIND must be daily or upgrade\n' >&2
    exit 64
    ;;
esac

mkdir -p "$BACKUP_ROOT"
lock_directory="$BACKUP_ROOT/.backup.lock"
if ! mkdir "$lock_directory" 2>/dev/null; then
  printf 'Another backup is already running\n' >&2
  exit 75
fi

incomplete_directory="$BACKUP_ROOT/.incomplete-$BACKUP_ID"
final_directory="$BACKUP_ROOT/$BACKUP_ID"
completed=0

cleanup() {
  status=$?
  rmdir "$lock_directory" 2>/dev/null || true
  if [[ "$completed" -ne 1 ]]; then
    rm -rf "$incomplete_directory"
  fi
  exit "$status"
}
trap cleanup EXIT INT TERM

read -r available_kilobytes used_percent < <(
  df -Pk "$BACKUP_ROOT" | awk 'NR == 2 { print $4, $5 }'
)
free_bytes=$((available_kilobytes * 1024))
free_percent=$((100 - ${used_percent%\%}))

if (( free_bytes < MIN_FREE_BYTES || free_percent < MIN_FREE_PERCENT )); then
  printf 'Backup refused: free space is below configured thresholds\n' >&2
  exit 78
fi

if [[ -e "$incomplete_directory" || -e "$final_directory" ]]; then
  printf 'Backup generation already exists: %s\n' "$BACKUP_ID" >&2
  exit 73
fi

umask 077
mkdir "$incomplete_directory"

mariadb-dump \
  --single-transaction \
  --quick \
  --routines \
  --events \
  --host="$DB_HOST" \
  --port="${DB_PORT:-3306}" \
  --user="$DB_USER" \
  --password="$DB_PASSWORD" \
  "$DB_NAME" |
  gzip -1 > "$incomplete_directory/database.sql.gz"

tar \
  --create \
  --gzip \
  --file="$incomplete_directory/uploads.tar.gz" \
  --directory="$UPLOADS_ROOT" \
  .

if [[ -n "${DEPLOY_ROOT:-}" && -d "$DEPLOY_ROOT" ]]; then
  deployment_files=()
  for file_name in docker-compose.yml nginx.conf; do
    if [[ -f "$DEPLOY_ROOT/$file_name" ]]; then
      deployment_files+=("$file_name")
    fi
  done
  if (( ${#deployment_files[@]} > 0 )); then
    tar \
      --create \
      --gzip \
      --file="$incomplete_directory/deployment.tar.gz" \
      --directory="$DEPLOY_ROOT" \
      "${deployment_files[@]}"
  fi
fi

upload_file_count="$(find "$UPLOADS_ROOT" -type f | wc -l | tr -d ' ')"
generation_size_bytes="$(
  du -sk "$incomplete_directory" |
    awk '{ print $1 * 1024 }'
)"
created_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

printf '%s\n' \
  '{' \
  "  \"id\": \"$BACKUP_ID\"," \
  "  \"kind\": \"$BACKUP_KIND\"," \
  '  "status": "complete",' \
  "  \"createdAt\": \"$created_at\"," \
  "  \"sizeBytes\": $generation_size_bytes," \
  "  \"uploadFileCount\": $upload_file_count" \
  '}' > "$incomplete_directory/metadata.json"

touch "$incomplete_directory/complete"
(
  cd "$incomplete_directory"
  sha256sum ./* > manifest.sha256
)

mv "$incomplete_directory" "$final_directory"
completed=1

BACKUP_CAPACITY_BYTES="$BACKUP_CAPACITY_BYTES" \
  node "$SCRIPT_DIR/apply-backup-retention.js" "$BACKUP_ROOT"

if [[ ! -d "$final_directory" ]]; then
  printf 'New backup was removed to enforce the capacity limit\n' >&2
  exit 78
fi

printf 'Backup completed: %s\n' "$final_directory"
