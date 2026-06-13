#!/usr/bin/env bash
set -euo pipefail

required_variables=(
  BACKUP_DIR
  DB_HOST
  DB_USER
  DB_PASSWORD
)

for variable_name in "${required_variables[@]}"; do
  if [[ -z "${!variable_name:-}" ]]; then
    printf 'Missing required environment variable: %s\n' "$variable_name" >&2
    exit 64
  fi
done

for required_file in \
  complete \
  metadata.json \
  database.sql.gz \
  uploads.tar.gz \
  table-counts.tsv \
  manifest.sha256; do
  if [[ ! -f "$BACKUP_DIR/$required_file" ]]; then
    printf 'Backup is incomplete: missing %s\n' "$required_file" >&2
    exit 65
  fi
done

(
  cd "$BACKUP_DIR"
  sha256sum --check manifest.sha256
)

restore_database="ierp_restore_$(date -u +%Y%m%dT%H%M%SZ)_${RANDOM}"
if [[ ! "$restore_database" =~ ^[A-Za-z0-9_]+$ ]]; then
  printf 'Generated restore database name is invalid\n' >&2
  exit 70
fi

database_created=0
cleanup() {
  status=$?
  if [[ "$database_created" -eq 1 && "${KEEP_RESTORE_DB:-0}" != "1" ]]; then
    mariadb \
      --host="$DB_HOST" \
      --port="${DB_PORT:-3306}" \
      --user="$DB_USER" \
      --password="$DB_PASSWORD" \
      --execute="DROP DATABASE IF EXISTS \`$restore_database\`" \
      >/dev/null 2>&1 || true
  fi
  exit "$status"
}
trap cleanup EXIT INT TERM

mariadb \
  --host="$DB_HOST" \
  --port="${DB_PORT:-3306}" \
  --user="$DB_USER" \
  --password="$DB_PASSWORD" \
  --execute="CREATE DATABASE \`$restore_database\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
database_created=1

gzip -dc "$BACKUP_DIR/database.sql.gz" |
  mariadb \
    --host="$DB_HOST" \
    --port="${DB_PORT:-3306}" \
    --user="$DB_USER" \
    --password="$DB_PASSWORD" \
    "$restore_database"

while IFS=$'\t' read -r table_name expected_count; do
  if [[ ! "$table_name" =~ ^[A-Za-z0-9_]+$ || ! "$expected_count" =~ ^[0-9]+$ ]]; then
    printf 'Invalid table count entry: %s %s\n' "$table_name" "$expected_count" >&2
    exit 65
  fi

  actual_count="$(
    mariadb \
      --batch \
      --skip-column-names \
      --host="$DB_HOST" \
      --port="${DB_PORT:-3306}" \
      --user="$DB_USER" \
      --password="$DB_PASSWORD" \
      "$restore_database" \
      --execute="SELECT COUNT(*) FROM \`$table_name\`"
  )"

  if [[ "$actual_count" != "$expected_count" ]]; then
    printf 'Table count mismatch for %s: expected %s, got %s\n' \
      "$table_name" "$expected_count" "$actual_count" >&2
    exit 65
  fi
done < "$BACKUP_DIR/table-counts.tsv"

expected_upload_count="$(
  node -e "
    const metadata = JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'));
    if (!Number.isSafeInteger(metadata.uploadFileCount) || metadata.uploadFileCount < 0) {
      process.exit(65);
    }
    process.stdout.write(String(metadata.uploadFileCount));
  " "$BACKUP_DIR/metadata.json"
)"
actual_upload_count="$(
  tar -tzf "$BACKUP_DIR/uploads.tar.gz" |
    awk '!/\/$/ && $0 != "." && $0 != "\.\/" { count += 1 } END { print count + 0 }'
)"

if [[ "$actual_upload_count" != "$expected_upload_count" ]]; then
  printf 'Upload count mismatch: expected %s, got %s\n' \
    "$expected_upload_count" "$actual_upload_count" >&2
  exit 65
fi

manifest_sha256="$(sha256sum "$BACKUP_DIR/manifest.sha256" | awk '{ print $1 }')"
marker_tmp="$BACKUP_DIR/.restore-drill.ok.$$"
printf '%s\n' \
  'status=success' \
  "manifest_sha256=$manifest_sha256" \
  "verified_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  > "$marker_tmp"
mv "$marker_tmp" "$BACKUP_DIR/restore-drill.ok"

printf 'Restore drill passed using temporary database: %s\n' "$restore_database"
